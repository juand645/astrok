import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import decode_access_token
from app.core.tenancy import apply_gym_scope
from app.models.user import User
from app.models.user_relation import UserRelation

bearer_scheme = HTTPBearer(auto_error=False)


def get_authenticated_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    """FastAPI dependency: decode the Bearer token and return the ORM ``User``.

    Wired into endpoints as ``current_user: User = Depends(get_authenticated_user)``.

    The token's ``gym_id`` claim must match the user's current ``gym_id``.
    Mismatches (revoked tokens, gym transferred users, forged tokens) are
    treated as 401 — never silently downgraded to "ignore gym scoping".

    Tokens issued before the multi-tenant rollout don't carry ``gym_id``;
    they're accepted only if the resolved user's ``gym_id`` resolves cleanly,
    so existing sessions keep working through the migration window.

    Args:
        credentials: Auto-populated by FastAPI from the ``Authorization`` header.
            ``None`` when the header is missing.
        db: Session injected by the ``get_db`` dependency.

    Returns:
        The active ``User`` row matching the token's ``sub`` claim.

    Raises:
        HTTPException (401): If the token is missing, expired, malformed, or
            the user is inactive / deleted / belongs to a different gym.
    """
    invalid = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired authentication token.",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if credentials is None:
        raise invalid

    try:
        payload = decode_access_token(credentials.credentials)
        user_id = int(payload["sub"])
    except (KeyError, ValueError, jwt.InvalidTokenError) as exc:
        raise invalid from exc

    # Apply the gym scope from the token BEFORE looking up the user. With RLS
    # on (Postgres prod), the users table is gym-filtered — without setting the
    # scope first, the db.get() below would see zero rows and treat a valid
    # token as invalid. Tokens issued before the multi-tenant rollout don't
    # carry gym_id; those naturally fail the user lookup and the user has to
    # re-authenticate, which is the right thing to happen post-migration.
    token_gym_id_raw = payload.get("gym_id")
    if token_gym_id_raw is None:
        raise invalid
    try:
        token_gym_id = int(token_gym_id_raw)
    except (TypeError, ValueError) as exc:
        raise invalid from exc
    apply_gym_scope(db, token_gym_id)

    user = db.get(User, user_id)
    if not user or not user.active:
        raise invalid

    # Defense in depth: if a user was moved to a different gym after the token
    # was issued, the token's gym_id will disagree with the user's current
    # gym_id. Reject so the user has to re-login under the new tenancy.
    if user.gym_id != token_gym_id:
        raise invalid

    return user


def get_current_gym_id(current_user: User = Depends(get_authenticated_user)) -> int:
    """Return the caller's gym_id — the canonical handle for tenant scoping.

    Wired into endpoints as ``gym_id: int = Depends(get_current_gym_id)`` to
    make the dependency explicit at the signature level. Equivalent to
    reading ``current_user.gym_id`` directly, but stronger as a code-review
    signal that the endpoint is gym-aware.
    """
    return current_user.gym_id


def actor_is_admin(actor: User) -> bool:
    """Return True iff ``actor`` has an active ``admin`` role assignment.

    ``admin`` is the gym-scoped role — every gym has at least one. Use
    ``actor_is_super_admin`` for cross-gym platform operations.
    """
    return any(ur.role.name == "admin" for ur in actor.roles if ur.role.active)


def actor_is_super_admin(actor: User) -> bool:
    """Return True iff ``actor`` has an active ``super_admin`` role assignment.

    ``super_admin`` is the global platform-operator role: only super_admins
    can create new gyms, list every gym on the platform, or edit gyms they
    don't belong to. Gym-internal admin operations stay on ``admin`` so
    the principle of least privilege holds.
    """
    return any(ur.role.name == "super_admin" for ur in actor.roles if ur.role.active)


def actor_can_create_clients(actor: User) -> bool:
    """Return True when ``actor`` holds at least one active non-client role.

    Used to gate ``POST /api/clients/`` so pure clients cannot create other
    clients. Trainers, admins, doctors, nutritionists, etc. all qualify.
    """
    active_role_names = {ur.role.name for ur in actor.roles if ur.role.active}
    return bool(active_role_names - {"client"})


def assert_can_access_client(db: Session, actor: User, client_id: int) -> None:
    """Raise 403 unless the caller has authority to read/write this client.

    The caller is allowed when any of:
      - the caller IS the client (``actor.id == client_id``);
      - the caller has an active ``user_relations`` row with the client as
        ``client_id`` and the caller as ``professional_id`` (relation is
        within the same gym — enforced by the auto-injected gym filter);
      - the caller has the ``admin`` role AND the client is in the caller's
        gym.

    The admin branch does its own gym check rather than relying solely on the
    ORM auto-filter, because some endpoints subsequently call ``db.get(User,
    client_id)`` which bypasses ``with_loader_criteria`` (it uses the primary-
    key fast path). Putting the check here makes cross-gym access fail at the
    gateway, regardless of how the downstream lookup is implemented.

    Args:
        db: Session for the relation lookup.
        actor: The authenticated caller.
        client_id: The id of the user being accessed.

    Raises:
        HTTPException (403): When none of the access conditions match.
    """
    if actor.id == client_id:
        return

    if actor_is_admin(actor):
        same_gym_client = db.scalar(
            select(User.id).where(
                User.id == client_id,
                User.gym_id == actor.gym_id,
            )
        )
        if same_gym_client is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have access to this client.",
            )
        return

    related = db.scalar(
        select(UserRelation.id).where(
            UserRelation.professional_id == actor.id,
            UserRelation.client_id == client_id,
            UserRelation.active.is_(True),
        )
    )
    if related is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this client.",
        )
