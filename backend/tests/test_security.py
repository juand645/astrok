"""Pure unit tests for the password + JWT helpers in ``app.core.security``."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import jwt
import pytest

from app.core.config import settings
from app.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)


def test_hash_password_round_trip() -> None:
    plaintext = "Sup3rSecret!"
    hashed = hash_password(plaintext)

    assert hashed != plaintext
    assert verify_password(plaintext, hashed) is True
    assert verify_password("wrong-password", hashed) is False


def test_hash_password_produces_different_hashes_for_same_input() -> None:
    """Bcrypt salts each call — identical passwords must hash to different strings."""
    plaintext = "Sup3rSecret!"
    assert hash_password(plaintext) != hash_password(plaintext)


def test_access_token_round_trip_carries_subject_and_extra_claims() -> None:
    token = create_access_token(subject="42", extra_claims={"username": "alice"})
    decoded = decode_access_token(token)

    assert decoded["sub"] == "42"
    assert decoded["username"] == "alice"
    assert "exp" in decoded


def test_decode_access_token_rejects_tampered_signature() -> None:
    token = create_access_token(subject="42")
    tampered = token[:-2] + ("AA" if token[-2:] != "AA" else "BB")

    with pytest.raises(jwt.InvalidTokenError):
        decode_access_token(tampered)


def test_decode_access_token_rejects_expired_token() -> None:
    """A manually-issued token with exp in the past must fail to decode."""
    expired_payload = {
        "sub": "42",
        "exp": datetime.now(UTC) - timedelta(minutes=1),
    }
    expired = jwt.encode(
        expired_payload,
        settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm,
    )

    with pytest.raises(jwt.ExpiredSignatureError):
        decode_access_token(expired)
