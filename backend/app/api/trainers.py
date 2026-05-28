from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.api.deps import actor_is_admin, get_authenticated_user
from app.core.database import get_db
from app.core.security import hash_password
from app.models.user import Role, User, UserRole
from app.models.user_relation import UserRelation
from app.schemas.trainer import (
    TrainerClientSummary,
    TrainerCreate,
    TrainerDetail,
    TrainerRead,
    TrainerUpdate,
)

router = APIRouter()


def _require_admin(actor: User) -> None:
    """Raise 403 unless ``actor`` holds the admin role."""
    if not actor_is_admin(actor):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can manage trainers.",
        )


def _load_trainer(db: Session, user_id: int) -> User:
    """Fetch a user that has the trainer role. 404 if missing or not a trainer."""
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="Trainer not found.")
    has_trainer_role = any(
        ur.role.name == "trainer" for ur in user.roles if ur.role.active
    )
    if not has_trainer_role:
        raise HTTPException(status_code=404, detail="Trainer not found.")
    return user


def _active_client_count(db: Session, trainer_id: int) -> int:
    """Count active ``user_relations`` where the trainer is the professional."""
    return (
        db.scalar(
            select(func.count(UserRelation.id)).where(
                UserRelation.professional_id == trainer_id,
                UserRelation.active.is_(True),
            )
        )
        or 0
    )


def _serialize(user: User, active_count: int) -> TrainerRead:
    return TrainerRead(
        id=user.id,
        full_name=user.full_name,
        email=user.email,
        username=user.username,
        personal_number=user.personal_number,
        id_number=user.id_number,
        birth_date=user.birth_date,
        description=user.description,
        active=user.active,
        active_client_count=active_count,
    )


@router.get("/", response_model=list[TrainerRead])
def list_trainers(
    current_user: User = Depends(get_authenticated_user),
    db: Session = Depends(get_db),
    include_inactive: Annotated[bool, Query()] = False,
) -> list[TrainerRead]:
    """List every user with the ``trainer`` role, newest first.

    Admin-only. By default returns active trainers; pass
    ``include_inactive=true`` to surface soft-deleted ones (so the admin can
    reactivate them from the UI).
    """
    _require_admin(current_user)

    trainer_role = db.scalar(select(Role).where(Role.name == "trainer", Role.active.is_(True)))
    if trainer_role is None:
        return []

    stmt = (
        select(User)
        .join(UserRole, UserRole.user_id == User.id)
        .where(UserRole.role_id == trainer_role.id)
        .order_by(User.full_name)
    )
    if not include_inactive:
        stmt = stmt.where(User.active.is_(True))

    users = list(db.scalars(stmt).unique())

    counts = {
        trainer.id: _active_client_count(db, trainer.id) for trainer in users
    }
    return [_serialize(trainer, counts.get(trainer.id, 0)) for trainer in users]


@router.get("/{trainer_id}", response_model=TrainerDetail)
def get_trainer_detail(
    trainer_id: int,
    current_user: User = Depends(get_authenticated_user),
    db: Session = Depends(get_db),
) -> TrainerDetail:
    """Fetch a trainer + the active clients currently assigned to them.

    Admin-only. The ``clients`` list helps admins see who would be left
    without a coach before they delete or reassign.
    """
    _require_admin(current_user)

    trainer = _load_trainer(db, trainer_id)
    count = _active_client_count(db, trainer.id)
    base = _serialize(trainer, count)

    rows = db.execute(
        select(User)
        .join(UserRelation, UserRelation.client_id == User.id)
        .where(
            UserRelation.professional_id == trainer.id,
            UserRelation.active.is_(True),
            User.active.is_(True),
        )
        .order_by(User.full_name)
    ).all()

    clients = [
        TrainerClientSummary(
            id=row[0].id,
            full_name=row[0].full_name,
            username=row[0].username,
            email=row[0].email,
        )
        for row in rows
    ]

    return TrainerDetail(**base.model_dump(), clients=clients)


@router.post("/", response_model=TrainerRead, status_code=status.HTTP_201_CREATED)
def create_trainer(
    payload: TrainerCreate,
    current_user: User = Depends(get_authenticated_user),
    db: Session = Depends(get_db),
) -> TrainerRead:
    """Create a new user with the ``trainer`` role assigned.

    Admin-only. Returns 409 if the email or username is already taken.
    Returns 500 if the ``trainer`` role isn't seeded in the DB.
    """
    _require_admin(current_user)

    existing = db.scalar(
        select(User).where(or_(User.email == str(payload.email), User.username == payload.username))
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email or username already exists.",
        )

    trainer_role = db.scalar(select(Role).where(Role.name == "trainer", Role.active.is_(True)))
    if trainer_role is None:
        raise HTTPException(
            status_code=500,
            detail="The 'trainer' role is not configured. Seed it before creating trainers.",
        )

    user = User(
        full_name=payload.full_name.strip(),
        email=str(payload.email),
        username=payload.username.strip(),
        password_hash=hash_password(payload.password),
        personal_number=(payload.personal_number.strip() or None) if payload.personal_number else None,
        id_number=(payload.id_number.strip() or None) if payload.id_number else None,
        birth_date=payload.birth_date,
        description=(payload.description.strip() or None) if payload.description else None,
    )
    user.roles = [UserRole(role=trainer_role)]
    db.add(user)
    db.commit()
    db.refresh(user)

    return _serialize(user, 0)


@router.patch("/{trainer_id}", response_model=TrainerRead)
def update_trainer(
    trainer_id: int,
    payload: TrainerUpdate,
    current_user: User = Depends(get_authenticated_user),
    db: Session = Depends(get_db),
) -> TrainerRead:
    """Patch a trainer's profile fields and/or toggle their ``active`` flag.

    Admin-only. Setting ``active=true`` is the "reactivate" action used after
    a soft-delete. Email changes are checked for uniqueness across all users.
    """
    _require_admin(current_user)

    trainer = _load_trainer(db, trainer_id)
    changed = False

    if payload.email is not None and payload.email != trainer.email:
        clash = db.scalar(
            select(User).where(User.email == str(payload.email), User.id != trainer.id)
        )
        if clash:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="That email is already in use by another account.",
            )
        trainer.email = str(payload.email)
        changed = True

    if payload.full_name is not None:
        trimmed = payload.full_name.strip()
        if trimmed:
            trainer.full_name = trimmed
            changed = True
    if payload.personal_number is not None:
        trainer.personal_number = payload.personal_number.strip() or None
        changed = True
    if payload.id_number is not None:
        trainer.id_number = payload.id_number.strip() or None
        changed = True
    if payload.birth_date is not None:
        trainer.birth_date = payload.birth_date
        changed = True
    if payload.description is not None:
        trainer.description = payload.description.strip() or None
        changed = True
    if payload.active is not None:
        trainer.active = payload.active
        changed = True

    if changed:
        trainer.updated_at = datetime.now(UTC)
        db.commit()
        db.refresh(trainer)

    return _serialize(trainer, _active_client_count(db, trainer.id))


@router.delete("/{trainer_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_trainer(
    trainer_id: int,
    current_user: User = Depends(get_authenticated_user),
    db: Session = Depends(get_db),
) -> None:
    """Soft-delete a trainer by flipping ``active`` to false.

    Admin-only. Returns 409 if the trainer still has any active client
    relations — the admin should transfer those clients first (via the
    Clients module's Transfer button) and then retry.

    To restore a soft-deleted trainer, PATCH ``{"active": true}``.
    """
    _require_admin(current_user)

    trainer = _load_trainer(db, trainer_id)
    if not trainer.active:
        return

    active_clients = _active_client_count(db, trainer.id)
    if active_clients > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"This trainer still has {active_clients} active client(s). "
                "Transfer them to another trainer before deleting."
            ),
        )

    trainer.active = False
    trainer.updated_at = datetime.now(UTC)
    db.commit()
