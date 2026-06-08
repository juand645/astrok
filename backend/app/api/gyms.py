"""Admin endpoints to create and inspect gym tenants.

The ``gyms`` table is the tenant root — it's not gym-scoped, so the ORM auto-
filter (see ``app.core.tenancy``) doesn't touch SELECT/INSERT here. Any admin
of any gym can list and create new gyms; treat that as the temporary MVP
posture and tighten with a ``super_admin`` role when the operator base grows.

The login path resolves a gym from the ``X-Gym-Slug`` header. After creating
a new gym via this endpoint, point the frontend (or curl) at the new slug
and authenticate as the bootstrap admin returned in the response body.
"""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import actor_is_admin, get_authenticated_user
from app.core.database import get_db
from app.core.security import hash_password
from app.models.gym import Gym
from app.models.user import Role, User, UserRole
from app.schemas.gym import GymCreate, GymRead, GymUpdate

router = APIRouter()


def _require_admin(actor: User) -> None:
    if not actor_is_admin(actor):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can manage gyms.",
        )


@router.get("/", response_model=list[GymRead])
def list_gyms(
    current_user: User = Depends(get_authenticated_user),
    db: Session = Depends(get_db),
) -> list[Gym]:
    """List every gym on the platform (admin-only)."""
    _require_admin(current_user)
    return list(db.scalars(select(Gym).order_by(Gym.name)))


@router.get("/me", response_model=GymRead)
def get_my_gym(
    current_user: User = Depends(get_authenticated_user),
    db: Session = Depends(get_db),
) -> Gym:
    """Return the caller's own gym (any authenticated user).

    Used by the frontend to render the gym name + branding (logo, color) in
    the header. No admin role required — every authenticated user belongs to
    exactly one gym, and exposing only that gym's metadata is safe.
    """
    gym = db.get(Gym, current_user.gym_id)
    if gym is None:  # pragma: no cover — would mean FK is broken
        raise HTTPException(status_code=404, detail="Gym not found.")
    return gym


@router.post("/", response_model=GymRead, status_code=status.HTTP_201_CREATED)
def create_gym(
    payload: GymCreate,
    current_user: User = Depends(get_authenticated_user),
    db: Session = Depends(get_db),
) -> Gym:
    """Create a new gym + its bootstrap admin in one atomic transaction.

    Without the bootstrap admin the gym would be unreachable — no one could
    log in to it. The new admin is created in the new gym (``gym_id`` set to
    the new row's id), so existing-gym users are unaffected.

    Raises:
        403: Caller is not an admin.
        409: A gym with this slug already exists.
        500: The 'admin' role is missing from the seed data.
    """
    _require_admin(current_user)

    existing_slug = db.scalar(select(Gym).where(Gym.slug == payload.slug))
    if existing_slug is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A gym with this slug already exists.",
        )

    admin_role = db.scalar(select(Role).where(Role.name == "admin", Role.active.is_(True)))
    if admin_role is None:
        raise HTTPException(
            status_code=500,
            detail="The 'admin' role is not configured. Seed it before creating gyms.",
        )

    gym = Gym(
        slug=payload.slug,
        name=payload.name.strip(),
        brand_color=payload.brand_color,
        logo_url=payload.logo_url,
    )
    db.add(gym)
    db.flush()  # populate gym.id

    bootstrap_admin = User(
        gym_id=gym.id,
        full_name=payload.admin.full_name.strip(),
        email=str(payload.admin.email),
        username=payload.admin.username.strip(),
        password_hash=hash_password(payload.admin.password),
    )
    bootstrap_admin.roles = [UserRole(role=admin_role)]
    db.add(bootstrap_admin)

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Could not create gym — slug or admin credentials clash.",
        ) from exc

    db.refresh(gym)
    return gym


@router.patch("/{gym_id}", response_model=GymRead)
def update_gym(
    gym_id: int,
    payload: GymUpdate,
    current_user: User = Depends(get_authenticated_user),
    db: Session = Depends(get_db),
) -> Gym:
    """Patch a gym's display fields. Admin-only.

    Only the caller's own gym can be updated unless the caller is an admin of
    that gym. (Today every admin is gym-scoped, so this naturally restricts
    cross-gym editing — when a ``super_admin`` role lands later, relax this.)
    """
    _require_admin(current_user)

    if gym_id != current_user.gym_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only manage your own gym.",
        )

    gym = db.get(Gym, gym_id)
    if gym is None:
        raise HTTPException(status_code=404, detail="Gym not found.")

    if payload.name is not None:
        gym.name = payload.name.strip()
    if payload.brand_color is not None:
        gym.brand_color = payload.brand_color
    if payload.logo_url is not None:
        gym.logo_url = payload.logo_url
    if payload.active is not None:
        gym.active = payload.active

    gym.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(gym)
    return gym
