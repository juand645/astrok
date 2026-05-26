import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.user import User
from app.models.user_relation import UserRelation

bearer_scheme = HTTPBearer(auto_error=False)


def get_authenticated_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    """FastAPI dependency: decode the Bearer token and return the ORM ``User``.

    Wired into endpoints as ``current_user: User = Depends(get_authenticated_user)``.

    Args:
        credentials: Auto-populated by FastAPI from the ``Authorization`` header.
            ``None`` when the header is missing.
        db: Session injected by the ``get_db`` dependency.

    Returns:
        The active ``User`` row matching the token's ``sub`` claim.

    Raises:
        HTTPException (401): If the token is missing, expired, malformed, or
            the user is inactive / deleted.
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

    user = db.get(User, user_id)
    if not user or not user.active:
        raise invalid

    return user


def actor_is_admin(actor: User) -> bool:
    """Return True iff ``actor`` has an active ``admin`` role assignment."""
    return any(ur.role.name == "admin" for ur in actor.roles if ur.role.active)


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
        ``client_id`` and the caller as ``professional_id``;
      - the caller has the ``admin`` role.

    Args:
        db: Session for the relation lookup.
        actor: The authenticated caller.
        client_id: The id of the user being accessed.

    Raises:
        HTTPException (403): When none of the access conditions match.
    """
    if actor.id == client_id or actor_is_admin(actor):
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
