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

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import actor_is_admin, actor_is_super_admin, get_authenticated_user
from app.core.database import get_db
from app.core.security import hash_password
from app.core.tenancy import apply_gym_scope
from app.models.gym import Gym
from app.models.user import Role, User, UserRole
from app.schemas.gym import GymCreate, GymRead, GymUpdate
from app.services.storage import (
    InvalidImageError,
    StorageNotConfiguredError,
    delete_gym_logo,
    storage_is_configured,
    upload_gym_logo,
)

router = APIRouter()


def _require_super_admin(actor: User) -> None:
    if not actor_is_super_admin(actor):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only platform super-admins can manage gyms.",
        )


@router.get("/", response_model=list[GymRead])
def list_gyms(
    current_user: User = Depends(get_authenticated_user),
    db: Session = Depends(get_db),
) -> list[Gym]:
    """List every gym on the platform. Super-admin only."""
    _require_super_admin(current_user)
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
    the new row's id) with the ``admin`` role, NOT ``super_admin``: every
    gym is supposed to have its own admin, but only platform operators get
    cross-gym powers.

    Raises:
        403: Caller is not a super-admin.
        409: A gym with this slug already exists.
        500: The 'admin' role is missing from the seed data.
    """
    _require_super_admin(current_user)

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

    # Switch the request's gym scope to the NEW gym before inserting the
    # bootstrap admin. Reason: SQLAlchemy emits ``INSERT ... RETURNING id`` to
    # fetch the auto-generated PK, and Postgres evaluates BOTH the INSERT
    # WITH CHECK clause AND the SELECT USING clause against the new row when
    # RETURNING is involved. Our INSERT policy is permissive, but the SELECT
    # policy filters by ``gym_id = current_setting('app.current_gym_id')``.
    # Without switching the GUC, the SELECT-for-RETURNING fails with
    # "new record violates row-security policy".
    #
    # We don't restore the original scope after — the transaction commits
    # right after this and the request is done with tenant data. The next
    # request gets a fresh scope from get_authenticated_user anyway.
    apply_gym_scope(db, gym.id)

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


def _assert_can_manage_gym(actor: User, gym_id: int) -> None:
    """Caller must be a super_admin OR the local admin of the target gym."""
    is_super = actor_is_super_admin(actor)
    is_local_admin = actor_is_admin(actor) and gym_id == actor.gym_id
    if not (is_super or is_local_admin):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only manage your own gym.",
        )


@router.patch("/{gym_id}", response_model=GymRead)
def update_gym(
    gym_id: int,
    payload: GymUpdate,
    current_user: User = Depends(get_authenticated_user),
    db: Session = Depends(get_db),
) -> Gym:
    """Patch a gym's display fields.

    Access rules:
      * ``super_admin``: may patch any gym.
      * ``admin``: may patch only their own gym (rename, recolor logo, etc.).
      * Anyone else: 403.
    """
    _assert_can_manage_gym(current_user, gym_id)

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


@router.post("/{gym_id}/logo", response_model=GymRead)
async def upload_logo(
    gym_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_authenticated_user),
    db: Session = Depends(get_db),
) -> Gym:
    """Replace the gym's logo image.

    Body: multipart/form-data with a ``file`` field. Any common image format
    (JPEG/PNG/WebP/HEIC) works. The server center-crops to a square, resizes
    to 256×256, encodes as WebP, and stores at ``gym-logos/<gym_id>.webp``
    on the object store. The cache-busted URL is written back to
    ``gyms.logo_url``.

    Access rules mirror PATCH: super_admin can upload to any gym; gym-level
    admins can only upload to their own gym.
    """
    _assert_can_manage_gym(current_user, gym_id)

    if not storage_is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Logo uploads are not configured on this server.",
        )

    gym = db.get(Gym, gym_id)
    if gym is None:
        raise HTTPException(status_code=404, detail="Gym not found.")

    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty upload.")

    try:
        url = upload_gym_logo(gym_id=gym.id, raw=raw)
    except InvalidImageError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except StorageNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    gym.logo_url = url
    gym.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(gym)
    return gym


@router.delete("/{gym_id}/logo", response_model=GymRead)
def remove_logo(
    gym_id: int,
    current_user: User = Depends(get_authenticated_user),
    db: Session = Depends(get_db),
) -> Gym:
    """Clear the gym's logo (delete the object + null the URL).

    Storage delete is best-effort: failures there don't block the DB write,
    since a stale object with no DB pointer is harmless and the user can
    re-upload to overwrite anyway.
    """
    _assert_can_manage_gym(current_user, gym_id)

    gym = db.get(Gym, gym_id)
    if gym is None:
        raise HTTPException(status_code=404, detail="Gym not found.")

    if gym.logo_url:
        try:
            delete_gym_logo(gym.id)
        except Exception:  # noqa: BLE001
            pass

    gym.logo_url = None
    gym.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(gym)
    return gym
