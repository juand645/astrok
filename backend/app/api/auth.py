from datetime import UTC, datetime

from fastapi import APIRouter, Depends, File, Header, HTTPException, UploadFile, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.api.deps import get_authenticated_user
from app.core.database import get_db
from app.core.security import create_access_token, hash_password, verify_password
from app.core.tenancy import apply_gym_scope
from app.models.gym import DEFAULT_GYM_SLUG, Gym
from app.models.user import User
from app.models.user_relation import UserRelation
from app.schemas.auth import (
    LoginRequest,
    PasswordChange,
    ProfileUpdate,
    TokenResponse,
)
from app.schemas.user import UserRead
from app.services.storage import (
    InvalidImageError,
    StorageNotConfiguredError,
    delete_avatar,
    storage_is_configured,
    upload_avatar,
)

router = APIRouter()


@router.post("/login", response_model=TokenResponse)
def login(
    payload: LoginRequest,
    db: Session = Depends(get_db),
    x_gym_slug: str | None = Header(default=None, alias="X-Gym-Slug"),
) -> TokenResponse:
    """Authenticate by username/email + password (within a gym) and issue a JWT.

    Body:
        identifier: Username OR email — matched with an OR clause.
        password: Plain text; compared with the bcrypt hash on the user.

    Header:
        X-Gym-Slug: The gym slug the user is signing into. Optional; falls back
            to the ``default`` gym so single-tenant deploys and existing
            frontends keep working until they're updated to send the header.

    The user lookup is scoped by ``gym_id``, so two gyms can each have a user
    named ``admin`` without collision. The issued JWT carries ``gym_id`` in
    its claims; every authenticated request later validates the user's
    current ``gym_id`` against the token's ``gym_id`` (defense in depth).
    """
    gym_slug = (x_gym_slug or DEFAULT_GYM_SLUG).strip()
    gym = db.scalar(select(Gym).where(Gym.slug == gym_slug, Gym.active.is_(True)))
    if gym is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password.",
        )

    # Establish gym scope before the user lookup. With RLS on (Postgres prod),
    # this is what makes the user SELECT actually return a row — without the
    # GUC set, the policy hides every users row.
    apply_gym_scope(db, gym.id)

    user = db.scalar(
        select(User).where(
            User.gym_id == gym.id,
            or_(
                User.username == payload.identifier,
                User.email == payload.identifier,
            ),
        )
    )

    if not user or not user.active or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password.",
        )

    access_token = create_access_token(
        subject=str(user.id),
        extra_claims={"username": user.username, "gym_id": user.gym_id},
    )
    return TokenResponse(access_token=access_token, user=serialize_user(user, db))


@router.get("/me", response_model=UserRead)
def get_current_user(
    current_user: User = Depends(get_authenticated_user),
    db: Session = Depends(get_db),
) -> UserRead:
    """Resolve the JWT in the Authorization header to the caller's profile.

    Used by the frontend on app load to validate the stored token and rehydrate
    the session (currentUser + the client's professional_id, if any).

    Delegates to ``get_authenticated_user`` so the gym scope (RLS + ORM filter)
    is set BEFORE any user lookup. The endpoint used to duplicate the token
    decoding + ``db.get(User, ...)`` here, which silently broke once RLS was
    enabled — the user SELECT ran against a session with no gym context and
    the policy hid the row, producing a 401 on every valid token.
    """
    return serialize_user(current_user, db)


@router.patch("/me", response_model=UserRead)
def update_my_profile(
    payload: ProfileUpdate,
    current_user: User = Depends(get_authenticated_user),
    db: Session = Depends(get_db),
) -> UserRead:
    """Update the caller's own profile fields.

    Body (``ProfileUpdate``) — any subset of:
        full_name, email, personal_number, birth_date, description.

    Username is intentionally not editable. Email changes are checked for
    uniqueness (409 if already taken by another user). Empty/whitespace
    strings clear ``personal_number`` and ``description``; ``full_name``
    cannot be cleared.

    Returns the refreshed ``UserRead`` (including the recomputed
    ``professional_id`` for clients).
    """
    if payload.email is not None and payload.email != current_user.email:
        clash = db.scalar(
            select(User).where(User.email == str(payload.email), User.id != current_user.id)
        )
        if clash:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="That email is already in use by another account.",
            )
        current_user.email = str(payload.email)

    if payload.full_name is not None:
        trimmed = payload.full_name.strip()
        if trimmed:
            current_user.full_name = trimmed
    if payload.personal_number is not None:
        current_user.personal_number = payload.personal_number.strip() or None
    if payload.id_number is not None:
        current_user.id_number = payload.id_number.strip() or None
    if payload.birth_date is not None:
        current_user.birth_date = payload.birth_date
    if payload.description is not None:
        current_user.description = payload.description.strip() or None

    current_user.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(current_user)
    return serialize_user(current_user, db)


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    payload: PasswordChange,
    current_user: User = Depends(get_authenticated_user),
    db: Session = Depends(get_db),
) -> None:
    """Verify the caller's current password and set a new one.

    Body (``PasswordChange``):
        current_password: Plain text. Must match the stored hash.
        new_password: Plain text, min 8 chars.

    Existing JWTs remain valid (they're not invalidated server-side).
    Returns 204 on success; 400 if ``current_password`` doesn't match.
    """
    if not verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect.",
        )

    current_user.password_hash = hash_password(payload.new_password)
    current_user.updated_at = datetime.now(UTC)
    db.commit()


@router.post("/me/avatar", response_model=UserRead)
async def upload_my_avatar(
    file: UploadFile = File(...),
    current_user: User = Depends(get_authenticated_user),
    db: Session = Depends(get_db),
) -> UserRead:
    """Replace the caller's profile picture.

    Body: multipart/form-data, ``file`` field. Accepts any common image
    format (JPEG/PNG/WebP/HEIC). The server center-crops to a square,
    resizes to 256×256, encodes as WebP, and stores at
    ``avatars/<user_id>.webp`` on the configured object store.

    Returns the refreshed ``UserRead`` (``photo_url`` is the new public URL).
    """
    if not storage_is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Avatar uploads are not configured on this server.",
        )

    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty upload.")

    try:
        url = upload_avatar(user_id=current_user.id, raw=raw)
    except InvalidImageError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except StorageNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    current_user.photo_url = url
    current_user.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(current_user)
    return serialize_user(current_user, db)


@router.delete("/me/avatar", response_model=UserRead)
def delete_my_avatar(
    current_user: User = Depends(get_authenticated_user),
    db: Session = Depends(get_db),
) -> UserRead:
    """Clear the caller's profile picture (deletes the object + nulls the URL)."""
    if current_user.photo_url:
        try:
            delete_avatar(current_user.id)
        except Exception:  # noqa: BLE001
            # Storage errors here shouldn't block clearing the DB pointer.
            pass
    current_user.photo_url = None
    current_user.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(current_user)
    return serialize_user(current_user, db)


def serialize_user(user: User, db: Session | None = None) -> UserRead:
    """Build the API-facing ``UserRead`` from an ORM ``User``.

    When ``db`` is provided, also resolves ``professional_id`` by looking up
    the user's most recent active ``user_relations`` row (the assigned trainer
    for clients). Pass ``db`` whenever you have a session — the field is
    important to the frontend.

    Args:
        user: The ORM user to serialize.
        db: Optional session; without it, ``professional_id`` is ``None``.

    Returns:
        A ``UserRead`` Pydantic model.
    """
    professional_id: int | None = None
    if db is not None:
        relation = db.scalar(
            select(UserRelation)
            .where(
                UserRelation.client_id == user.id,
                UserRelation.active.is_(True),
            )
            .order_by(UserRelation.created_at.desc())
            .limit(1)
        )
        professional_id = relation.professional_id if relation is not None else None

    return UserRead(
        id=user.id,
        full_name=user.full_name,
        email=user.email,
        username=user.username,
        personal_number=user.personal_number,
        id_number=user.id_number,
        birth_date=user.birth_date,
        description=user.description,
        photo_url=user.photo_url,
        active=user.active,
        roles=[user_role.role.name for user_role in user.roles if user_role.role.active],
        professional_id=professional_id,
    )
