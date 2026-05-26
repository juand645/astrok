from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.api.deps import actor_can_create_clients, get_authenticated_user
from app.core.database import get_db
from app.core.security import hash_password
from app.models.user import Role, User, UserRole
from app.schemas.user import UserCreate, UserRead, UserSummary
from app.api.auth import serialize_user

router = APIRouter()


@router.get("/professionals", response_model=list[UserSummary])
def list_professionals(
    current_user: User = Depends(get_authenticated_user),
    db: Session = Depends(get_db),
) -> list[UserSummary]:
    """Return every active user that holds at least one non-client active role.

    Used by the "Transfer client" flow to populate the target-trainer
    dropdown. The caller themselves is excluded so trainers can't transfer
    to themselves. Only available to callers who can act on clients
    (trainers / admins / etc.); pure clients get 403.

    Returns a slim summary ({id, full_name, username, roles}) — enough for
    the picker without leaking emails / personal numbers.
    """
    if not actor_can_create_clients(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only professionals can list other professionals.",
        )

    rows = list(
        db.scalars(
            select(User)
            .where(User.active.is_(True), User.id != current_user.id)
            .order_by(User.full_name)
        )
    )

    summaries: list[UserSummary] = []
    for user in rows:
        active_roles = [ur.role.name for ur in user.roles if ur.role.active]
        if not set(active_roles) - {"client"}:
            continue
        summaries.append(
            UserSummary(
                id=user.id,
                full_name=user.full_name,
                username=user.username,
                roles=active_roles,
            )
        )
    return summaries


@router.get("/", response_model=list[UserRead])
def list_users(db: Session = Depends(get_db)) -> list[User]:
    """Return every user in the system, ordered by full name.

    NOTE: Currently unauthenticated — exposes the user directory to anyone
    who can reach the API. See the README's "Known limitations" section.
    """
    users = list(db.scalars(select(User).order_by(User.full_name)))
    return [serialize_user(user, db) for user in users]


@router.post("/", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def create_user(payload: UserCreate, db: Session = Depends(get_db)) -> User:
    """Create a user with the given roles. Generic flavor of "register".

    Body fields:
        full_name: Display name.
        email: Unique; the bcrypt-hashed password is stored.
        username: Unique handle.
        password: Plain text, ≥8 chars (enforced by the schema).
        role_names: Names of roles to assign. Default ``["client"]``.

    Returns the serialized new user.

    Raises:
        409: If the email or username already exists.
        400: If any requested role does not exist or is inactive.
    """
    existing = db.scalar(
        select(User).where(or_(User.email == payload.email, User.username == payload.username))
    )
    if existing:
        raise HTTPException(status_code=409, detail="A user with this email or username already exists.")

    roles = list(db.scalars(select(Role).where(Role.name.in_(payload.role_names), Role.active.is_(True))))
    missing_roles = set(payload.role_names) - {role.name for role in roles}
    if missing_roles:
        raise HTTPException(
            status_code=400,
            detail=f"These roles do not exist or are inactive: {', '.join(sorted(missing_roles))}.",
        )

    user = User(
        full_name=payload.full_name,
        email=str(payload.email),
        username=payload.username,
        password_hash=hash_password(payload.password),
        personal_number=(payload.personal_number or None),
    )
    user.roles = [UserRole(role=role) for role in roles]
    db.add(user)
    db.commit()
    db.refresh(user)
    return serialize_user(user, db)
