from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
from passlib.context import CryptContext

from app.core.config import settings

password_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    """Hash a plain-text password using bcrypt for storage in `users.password_hash`.

    Args:
        password: Plain text password chosen by the user.

    Returns:
        A bcrypt hash string safe to persist.
    """
    return password_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    """Check whether a plain password matches its previously-stored bcrypt hash.

    Args:
        password: The candidate password supplied at login.
        password_hash: The hash stored in `users.password_hash`.

    Returns:
        True on a match, False otherwise.
    """
    return password_context.verify(password, password_hash)


def create_access_token(subject: str, extra_claims: dict[str, Any] | None = None) -> str:
    """Issue a signed JWT for the given subject with a configured expiry.

    Args:
        subject: Stored in the `sub` claim (we use the user id as a string).
        extra_claims: Optional additional claims merged into the payload
            (e.g. `username` for convenience).

    Returns:
        The encoded JWT string, signed with `settings.jwt_secret_key`.
    """
    expires_at = datetime.now(UTC) + timedelta(minutes=settings.access_token_expire_minutes)
    payload: dict[str, Any] = {"sub": subject, "exp": expires_at}

    if extra_claims:
        payload.update(extra_claims)

    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict[str, Any]:
    """Verify a JWT's signature and expiry, returning its decoded payload.

    Args:
        token: The raw bearer token string from the Authorization header.

    Returns:
        The decoded JWT claims as a dict.

    Raises:
        jwt.InvalidTokenError: If the token is malformed, expired, or signed
            with a different key.
    """
    return jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
