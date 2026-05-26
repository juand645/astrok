from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, aliased

from app.api.deps import (
    actor_can_create_clients,
    actor_is_admin,
    assert_can_access_client,
    get_authenticated_user,
)
from app.core.database import get_db
from app.core.security import hash_password
from app.models.plan import Plan
from app.models.user import Role, User, UserRole
from app.models.user_relation import UserRelation
from app.schemas.client import ClientCreate, ClientDetail, ClientRead, ClientTransfer, ClientUpdate
from app.schemas.plan import PlanRead
from app.schemas.plan_coach import (
    ChatMessage,
    CoachChatRequest,
    CoachChatResponse,
)
from app.services.history import create_plan_with_initial_version, record_measurements
from app.services.plan_coach import chat as plan_coach_chat

router = APIRouter()


@router.post("/", response_model=ClientDetail, status_code=status.HTTP_201_CREATED)
def create_client(
    payload: ClientCreate,
    current_user: User = Depends(get_authenticated_user),
    db: Session = Depends(get_db),
) -> ClientDetail:
    """Create a client + assign trainer relation + optional intake data, in one transaction.

    Used by the "New client" flow in the frontend. Anyone with at least one
    non-client active role may call this (trainers, admins, doctors, etc.).

    Body (``ClientCreate``):
        full_name, email, username, password: standard new-user fields.
        birth_date: optional ISO date.
        description: client goal / notes.
        measures: optional initial measurement dict; persisted as an intake
            history row AND merged into the cache.
        relation_description: free-text focus note attached to the new
            ``user_relations`` row.
        plans: optional list of plan stubs to create alongside the client.

    Returns the new ``ClientDetail`` (includes the live measures cache and
    the relation info).

    Raises:
        403: caller is a pure-client role.
        409: email or username already exists.
        500: ``client`` role missing from the DB seed (re-run schema.sql).
    """
    if not actor_can_create_clients(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to create clients.",
        )

    existing = db.scalar(
        select(User).where(or_(User.email == payload.email, User.username == payload.username))
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email or username already exists.",
        )

    client_role = db.scalar(select(Role).where(Role.name == "client", Role.active.is_(True)))
    if client_role is None:
        raise HTTPException(
            status_code=500,
            detail="The 'client' role is not configured. Seed it before creating clients.",
        )

    user = User(
        full_name=payload.full_name.strip(),
        email=str(payload.email),
        username=payload.username.strip(),
        password_hash=hash_password(payload.password),
        personal_number=(payload.personal_number.strip() or None) if payload.personal_number else None,
        description=(payload.description.strip() or None) if payload.description else None,
        birth_date=payload.birth_date,
    )
    user.roles = [UserRole(role=client_role)]
    db.add(user)
    db.flush()

    relation = UserRelation(
        professional_id=current_user.id,
        client_id=user.id,
        relation_type="trainer_client",
        description=(
            payload.relation_description.strip() if payload.relation_description else None
        ),
    )
    db.add(relation)

    if payload.measures:
        record_measurements(
            db,
            client=user,
            measures=payload.measures,
            recorded_by=current_user.id,
            notes="Initial intake on client creation",
            commit=False,
        )

    for plan_input in payload.plans:
        create_plan_with_initial_version(
            db,
            client_id=user.id,
            professional_id=current_user.id,
            title=plan_input.title.strip(),
            plan_type=plan_input.plan_type,
            content=plan_input.content,
            description=plan_input.description,
            status=plan_input.status,
            appointment_id=None,
            change_note="Created with client",
            commit=False,
        )

    user.updated_at = datetime.now(UTC)

    db.commit()
    db.refresh(user)
    db.refresh(relation)

    return ClientDetail(
        id=user.id,
        full_name=user.full_name,
        email=user.email,
        username=user.username,
        personal_number=user.personal_number,
        description=user.description,
        birth_date=user.birth_date,
        measures=user.measures or {},
        relation_type=relation.relation_type,
        relation_description=relation.description,
    )


@router.get("/", response_model=list[ClientRead])
def list_my_clients(
    current_user: User = Depends(get_authenticated_user),
    db: Session = Depends(get_db),
) -> list[ClientRead]:
    """List the active clients assigned to the caller via ``user_relations``.

    Returns every active user joined to the caller through an active
    ``user_relations`` row (the caller as ``professional_id``). For a pure
    client this is naturally empty; for a trainer it's their roster.
    Admins see every active client and the assigned professional, so a
    future "secretary" / front-desk role can hand-off the right trainer
    name on each card.

    Ordered alphabetically by client full name.
    """
    professional = aliased(User)
    base = (
        select(
            User,
            UserRelation.relation_type,
            UserRelation.description,
            professional.id,
            professional.full_name,
        )
        .join(UserRelation, UserRelation.client_id == User.id)
        .join(professional, professional.id == UserRelation.professional_id)
        .where(
            UserRelation.active.is_(True),
            User.active.is_(True),
        )
    )

    if not actor_is_admin(current_user):
        base = base.where(UserRelation.professional_id == current_user.id)

    rows = db.execute(base.order_by(User.full_name)).all()

    return [
        ClientRead(
            id=user.id,
            full_name=user.full_name,
            email=user.email,
            username=user.username,
            personal_number=user.personal_number,
            description=user.description,
            birth_date=user.birth_date,
            relation_type=relation_type,
            relation_description=relation_description,
            professional_id=professional_id,
            professional_name=professional_name,
        )
        for user, relation_type, relation_description, professional_id, professional_name in rows
    ]


@router.get("/{client_id}", response_model=ClientDetail)
def get_client_detail(
    client_id: int,
    current_user: User = Depends(get_authenticated_user),
    db: Session = Depends(get_db),
) -> ClientDetail:
    """Fetch a single client's full detail (measures cache + relation info).

    Path:
        client_id: User id of the client to load.

    Access is gated by ``assert_can_access_client``. Returns 404 if the
    client doesn't exist or is inactive.
    """
    assert_can_access_client(db, current_user, client_id)

    user = db.get(User, client_id)
    if user is None or not user.active:
        raise HTTPException(status_code=404, detail="Client not found.")

    relation = db.scalar(
        select(UserRelation).where(
            UserRelation.client_id == client_id,
            UserRelation.professional_id == current_user.id,
            UserRelation.active.is_(True),
        )
    )

    return ClientDetail(
        id=user.id,
        full_name=user.full_name,
        email=user.email,
        username=user.username,
        personal_number=user.personal_number,
        description=user.description,
        birth_date=user.birth_date,
        measures=user.measures or {},
        relation_type=relation.relation_type if relation else None,
        relation_description=relation.description if relation else None,
    )


@router.patch("/{client_id}", response_model=ClientDetail)
def update_client(
    client_id: int,
    payload: ClientUpdate,
    current_user: User = Depends(get_authenticated_user),
    db: Session = Depends(get_db),
) -> ClientDetail:
    """Patch limited fields on a client (description and personal_number).

    Path:
        client_id: Target client.

    Body (``ClientUpdate``):
        description: New free-text notes. An empty/whitespace string clears it.
        personal_number: New contact number. An empty/whitespace string clears it.

    Either or both may be provided. Returns the refreshed ``ClientDetail``.
    403 if caller lacks access.
    """
    assert_can_access_client(db, current_user, client_id)

    user = db.get(User, client_id)
    if user is None or not user.active:
        raise HTTPException(status_code=404, detail="Client not found.")

    changed = False
    if payload.description is not None:
        user.description = payload.description.strip() or None
        changed = True
    if payload.personal_number is not None:
        user.personal_number = payload.personal_number.strip() or None
        changed = True
    if changed:
        user.updated_at = datetime.now(UTC)

    db.commit()
    db.refresh(user)

    relation = db.scalar(
        select(UserRelation).where(
            UserRelation.client_id == client_id,
            UserRelation.professional_id == current_user.id,
            UserRelation.active.is_(True),
        )
    )

    return ClientDetail(
        id=user.id,
        full_name=user.full_name,
        email=user.email,
        username=user.username,
        personal_number=user.personal_number,
        description=user.description,
        birth_date=user.birth_date,
        measures=user.measures or {},
        relation_type=relation.relation_type if relation else None,
        relation_description=relation.description if relation else None,
    )


@router.post("/{client_id}/transfer", response_model=ClientDetail)
def transfer_client(
    client_id: int,
    payload: ClientTransfer,
    current_user: User = Depends(get_authenticated_user),
    db: Session = Depends(get_db),
) -> ClientDetail:
    """Reassign a client from their current trainer to another professional.

    Append-only model: the existing ``user_relations`` row is deactivated
    (``active=false``) and a fresh active row is inserted for the target
    professional. The old trainer immediately loses ``assert_can_access_client``
    access; the new one gains it. Existing plans keep their original
    ``professional_id`` so history stays intact — the new trainer reads
    them through the new relation.

    Path:
        client_id: User id of the client being transferred.

    Body (``ClientTransfer``):
        new_professional_id: Target trainer's user id.
        note: Optional free-text reason saved on the new relation
            (e.g. "Carlos OOO until 2026-07-01").

    Authorization:
      - Caller must be the current professional on the client's active
        relation, OR an admin. Pure clients get 403 from
        ``assert_can_access_client`` upstream.

    Validation:
      - 400 if ``new_professional_id`` equals the current trainer (no-op).
      - 404 if the target user doesn't exist / is inactive.
      - 400 if the target has no active non-client role.
      - 404 if the client has no active trainer relation to transfer from.
    """
    assert_can_access_client(db, current_user, client_id)

    client = db.get(User, client_id)
    if client is None or not client.active:
        raise HTTPException(status_code=404, detail="Client not found.")

    current_relation = db.scalar(
        select(UserRelation).where(
            UserRelation.client_id == client_id,
            UserRelation.active.is_(True),
        )
    )
    if current_relation is None:
        raise HTTPException(
            status_code=404,
            detail="This client has no active trainer relation to transfer.",
        )

    if (
        current_user.id != current_relation.professional_id
        and not actor_is_admin(current_user)
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the assigned trainer or an admin can transfer this client.",
        )

    if payload.new_professional_id == current_relation.professional_id:
        raise HTTPException(
            status_code=400,
            detail="The client is already assigned to that trainer.",
        )

    target = db.get(User, payload.new_professional_id)
    if target is None or not target.active:
        raise HTTPException(status_code=404, detail="Target trainer not found.")

    target_roles = {ur.role.name for ur in target.roles if ur.role.active}
    if not target_roles - {"client"}:
        raise HTTPException(
            status_code=400,
            detail="Target user is not a professional and cannot manage clients.",
        )

    now = datetime.now(UTC)
    current_relation.active = False
    current_relation.updated_at = now

    new_relation = UserRelation(
        professional_id=target.id,
        client_id=client.id,
        relation_type=current_relation.relation_type,
        description=(payload.note.strip() if payload.note else current_relation.description),
        active=True,
    )
    db.add(new_relation)
    db.commit()
    db.refresh(client)
    db.refresh(new_relation)

    return ClientDetail(
        id=client.id,
        full_name=client.full_name,
        email=client.email,
        username=client.username,
        personal_number=client.personal_number,
        description=client.description,
        birth_date=client.birth_date,
        measures=client.measures or {},
        relation_type=new_relation.relation_type,
        relation_description=new_relation.description,
    )


@router.post("/{client_id}/coach-chat", response_model=CoachChatResponse)
def coach_chat(
    client_id: int,
    payload: CoachChatRequest,
    current_user: User = Depends(get_authenticated_user),
    db: Session = Depends(get_db),
) -> CoachChatResponse:
    """Multi-turn chat with the LLM plan-design assistant for one client.

    The frontend keeps conversation history client-side and sends the full
    message list each turn. The assistant may emit a structured plan JSON
    block (when it has enough info); the server parses and returns it in
    the ``plan`` field, ready for "Apply" to call ``POST /api/plans/``.

    Path:
        client_id: The client this conversation is about.

    Body (``CoachChatRequest``):
        messages: List of {role, content}, 1..40 messages.

    Returns the assistant's next ``ChatMessage`` (plan JSON stripped) plus
    an optional ``PlanDraft``. When the AI key isn't configured or the API
    call fails, returns a placeholder assistant message and ``reason``.
    """
    from app.core.config import settings

    assert_can_access_client(db, current_user, client_id)

    client = db.get(User, client_id)
    if client is None or not client.active:
        raise HTTPException(status_code=404, detail="Client not found.")

    if not settings.ai_api_key:
        return CoachChatResponse(
            message=ChatMessage(
                role="assistant",
                content="AI is not configured. Set AI_API_KEY in the backend .env to enable the plan coach.",
            ),
            reason="no_api_key",
        )

    try:
        text, plan = plan_coach_chat(
            messages=payload.messages,
            client=client,
            db=db,
            api_key=settings.ai_api_key,
            model=settings.ai_model,
            language=settings.ai_language,
        )
    except Exception as exc:  # noqa: BLE001
        return CoachChatResponse(
            message=ChatMessage(
                role="assistant",
                content="There was a problem reaching the AI service. Try again in a moment.",
            ),
            reason=f"generation_failed: {exc}",
        )

    return CoachChatResponse(
        message=ChatMessage(role="assistant", content=text or "(no response)"),
        plan=plan,
    )


@router.get("/{client_id}/plans", response_model=list[PlanRead])
def list_client_plans(
    client_id: int,
    current_user: User = Depends(get_authenticated_user),
    db: Session = Depends(get_db),
) -> list[Plan]:
    """List a client's active plans, newest first.

    Excludes soft-deleted plans (``active = false``). When the caller is the
    client themselves (and not an admin), drafts are also hidden — clients
    only see plans their professional has approved. Trainers and admins
    see every active plan regardless of status.

    Auth via ``assert_can_access_client``.
    """
    assert_can_access_client(db, current_user, client_id)

    stmt = select(Plan).where(Plan.client_id == client_id, Plan.active.is_(True))

    viewing_own_as_client = (
        current_user.id == client_id and not actor_is_admin(current_user)
    )
    if viewing_own_as_client:
        stmt = stmt.where(Plan.status != "draft")

    return list(db.scalars(stmt.order_by(Plan.created_at.desc())))
