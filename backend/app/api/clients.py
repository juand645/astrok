from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.api.deps import (
    actor_can_create_clients,
    assert_can_access_client,
    get_authenticated_user,
)
from app.core.database import get_db
from app.core.security import hash_password
from app.models.plan import Plan
from app.models.user import Role, User, UserRole
from app.models.user_relation import UserRelation
from app.schemas.client import ClientCreate, ClientDetail, ClientRead, ClientUpdate
from app.schemas.plan import PlanRead
from app.services.history import create_plan_with_initial_version, record_measurements

router = APIRouter()


@router.post("/", response_model=ClientDetail, status_code=status.HTTP_201_CREATED)
def create_client(
    payload: ClientCreate,
    current_user: User = Depends(get_authenticated_user),
    db: Session = Depends(get_db),
) -> ClientDetail:
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
    rows = db.execute(
        select(User, UserRelation.relation_type, UserRelation.description)
        .join(UserRelation, UserRelation.client_id == User.id)
        .where(
            UserRelation.professional_id == current_user.id,
            UserRelation.active.is_(True),
            User.active.is_(True),
        )
        .order_by(User.full_name)
    ).all()

    return [
        ClientRead(
            id=user.id,
            full_name=user.full_name,
            email=user.email,
            username=user.username,
            description=user.description,
            birth_date=user.birth_date,
            relation_type=relation_type,
            relation_description=relation_description,
        )
        for user, relation_type, relation_description in rows
    ]


@router.get("/{client_id}", response_model=ClientDetail)
def get_client_detail(
    client_id: int,
    current_user: User = Depends(get_authenticated_user),
    db: Session = Depends(get_db),
) -> ClientDetail:
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
    assert_can_access_client(db, current_user, client_id)

    user = db.get(User, client_id)
    if user is None or not user.active:
        raise HTTPException(status_code=404, detail="Client not found.")

    if payload.description is not None:
        user.description = payload.description.strip() or None
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
        description=user.description,
        birth_date=user.birth_date,
        measures=user.measures or {},
        relation_type=relation.relation_type if relation else None,
        relation_description=relation.description if relation else None,
    )


@router.get("/{client_id}/plans", response_model=list[PlanRead])
def list_client_plans(
    client_id: int,
    current_user: User = Depends(get_authenticated_user),
    db: Session = Depends(get_db),
) -> list[Plan]:
    assert_can_access_client(db, current_user, client_id)

    return list(
        db.scalars(
            select(Plan)
            .where(Plan.client_id == client_id, Plan.active.is_(True))
            .order_by(Plan.created_at.desc())
        )
    )
