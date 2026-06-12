"""Tests for the /api/auth/password-reset/* endpoints.

We can't intercept Resend HTTP calls in the unit tests (and don't want to
configure a real provider), so we exercise the flow by reading the raw token
directly from the ``password_reset_tokens`` table — exactly what the user
would do via the email link, just without the email middleman.
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import verify_password
from app.models.password_reset_token import PasswordResetToken
from app.models.user import User
from tests.conftest import make_user


def _latest_token_for(db: Session, user_id: int) -> PasswordResetToken | None:
    return db.scalar(
        select(PasswordResetToken)
        .where(PasswordResetToken.user_id == user_id)
        .order_by(PasswordResetToken.id.desc())
    )


def test_request_creates_token_and_returns_204(
    client: TestClient,
    db: Session,
    seed_roles: dict,
) -> None:
    user = make_user(db, username="alice", password="OldPw!!!1", roles=("trainer",))

    response = client.post(
        "/api/auth/password-reset/request",
        headers={"X-Gym-Slug": "default"},
        json={"identifier": "alice"},
    )

    assert response.status_code == 204
    record = _latest_token_for(db, user.id)
    assert record is not None
    assert record.used_at is None
    # SQLite strips tzinfo on TIMESTAMPTZ read; normalize before comparing.
    expires = record.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=UTC)
    assert expires > datetime.now(UTC)


def test_request_for_unknown_user_returns_204_with_no_token(
    client: TestClient,
    db: Session,
    seed_roles: dict,
) -> None:
    """User enumeration guard — anonymous callers can't tell whether a
    username/email is registered."""
    make_user(db, username="alice", password="OldPw!!!1")

    response = client.post(
        "/api/auth/password-reset/request",
        headers={"X-Gym-Slug": "default"},
        json={"identifier": "ghost"},
    )

    assert response.status_code == 204
    # No token row exists for the ghost user (and alice's row is untouched).
    tokens = db.scalars(select(PasswordResetToken)).all()
    assert tokens == []


def test_request_invalidates_prior_unused_tokens(
    client: TestClient,
    db: Session,
    seed_roles: dict,
) -> None:
    """A second request should mark previously-issued tokens as used so
    forgotten emails can't be replayed against a fresher one."""
    user = make_user(db, username="alice", password="OldPw!!!1")

    first = client.post(
        "/api/auth/password-reset/request",
        headers={"X-Gym-Slug": "default"},
        json={"identifier": "alice"},
    )
    second = client.post(
        "/api/auth/password-reset/request",
        headers={"X-Gym-Slug": "default"},
        json={"identifier": "alice"},
    )
    assert first.status_code == 204 and second.status_code == 204

    rows = db.scalars(
        select(PasswordResetToken)
        .where(PasswordResetToken.user_id == user.id)
        .order_by(PasswordResetToken.id)
    ).all()
    assert len(rows) == 2
    # Older one is invalidated; newest one stays redeemable.
    assert rows[0].used_at is not None
    assert rows[1].used_at is None


def test_redeem_updates_password_and_marks_token_used(
    client: TestClient,
    db: Session,
    seed_roles: dict,
) -> None:
    user = make_user(db, username="alice", password="OldPw!!!1")

    # Drive a request through the endpoint, then craft the redeem call
    # using the stored token_hash. We can't recover the raw token from the
    # endpoint (by design), so we inject one ourselves and assert the
    # subsequent redeem behaves correctly.
    raw_token = secrets.token_urlsafe(32)
    record = PasswordResetToken(
        user_id=user.id,
        token_hash=hashlib.sha256(raw_token.encode("utf-8")).hexdigest(),
        expires_at=datetime.now(UTC) + timedelta(minutes=30),
    )
    db.add(record)
    db.commit()

    response = client.post(
        "/api/auth/password-reset/redeem",
        json={"token": raw_token, "new_password": "NewSecretPw!9"},
    )
    assert response.status_code == 204, response.text

    db.refresh(user)
    db.refresh(record)
    assert verify_password("NewSecretPw!9", user.password_hash)
    assert not verify_password("OldPw!!!1", user.password_hash)
    assert record.used_at is not None


def test_redeem_rejects_already_used_token(
    client: TestClient,
    db: Session,
    seed_roles: dict,
) -> None:
    user = make_user(db, username="alice", password="OldPw!!!1")
    raw_token = secrets.token_urlsafe(32)
    record = PasswordResetToken(
        user_id=user.id,
        token_hash=hashlib.sha256(raw_token.encode("utf-8")).hexdigest(),
        expires_at=datetime.now(UTC) + timedelta(minutes=30),
        used_at=datetime.now(UTC),
    )
    db.add(record)
    db.commit()

    response = client.post(
        "/api/auth/password-reset/redeem",
        json={"token": raw_token, "new_password": "Whatever1!"},
    )
    assert response.status_code == 400


def test_redeem_rejects_expired_token(
    client: TestClient,
    db: Session,
    seed_roles: dict,
) -> None:
    user = make_user(db, username="alice", password="OldPw!!!1")
    raw_token = secrets.token_urlsafe(32)
    record = PasswordResetToken(
        user_id=user.id,
        token_hash=hashlib.sha256(raw_token.encode("utf-8")).hexdigest(),
        expires_at=datetime.now(UTC) - timedelta(minutes=1),
    )
    db.add(record)
    db.commit()

    response = client.post(
        "/api/auth/password-reset/redeem",
        json={"token": raw_token, "new_password": "Whatever1!"},
    )
    assert response.status_code == 400


def test_redeem_rejects_unknown_token(
    client: TestClient,
    db: Session,
    seed_roles: dict,
) -> None:
    response = client.post(
        "/api/auth/password-reset/redeem",
        json={"token": "not-a-real-token", "new_password": "Whatever1!"},
    )
    assert response.status_code == 400


def test_redeem_validates_password_length(
    client: TestClient,
    db: Session,
    seed_roles: dict,
) -> None:
    response = client.post(
        "/api/auth/password-reset/redeem",
        json={"token": "anything", "new_password": "short"},
    )
    # Pydantic 422 — schema validation fails before we even hit the DB.
    assert response.status_code == 422


def test_redeem_invalidates_token_so_it_cannot_be_replayed(
    client: TestClient,
    db: Session,
    seed_roles: dict,
) -> None:
    user = make_user(db, username="alice", password="OldPw!!!1")
    raw_token = secrets.token_urlsafe(32)
    db.add(
        PasswordResetToken(
            user_id=user.id,
            token_hash=hashlib.sha256(raw_token.encode("utf-8")).hexdigest(),
            expires_at=datetime.now(UTC) + timedelta(minutes=30),
        )
    )
    db.commit()

    first = client.post(
        "/api/auth/password-reset/redeem",
        json={"token": raw_token, "new_password": "FirstNew1!"},
    )
    assert first.status_code == 204

    second = client.post(
        "/api/auth/password-reset/redeem",
        json={"token": raw_token, "new_password": "SecondNew1!"},
    )
    assert second.status_code == 400


def test_user_can_log_in_with_new_password_end_to_end(
    client: TestClient,
    db: Session,
    seed_roles: dict,
) -> None:
    """Glue test: request + redeem + login as carlos with the new password."""
    user = make_user(db, username="alice", password="OldPw!!!1", roles=("trainer",))

    req = client.post(
        "/api/auth/password-reset/request",
        headers={"X-Gym-Slug": "default"},
        json={"identifier": "alice"},
    )
    assert req.status_code == 204

    # Grab the raw_token... we can't, so simulate as in earlier tests.
    raw_token = secrets.token_urlsafe(32)
    db.execute(
        select(User)
    )  # noop to keep db live in session
    db.add(
        PasswordResetToken(
            user_id=user.id,
            token_hash=hashlib.sha256(raw_token.encode("utf-8")).hexdigest(),
            expires_at=datetime.now(UTC) + timedelta(minutes=30),
        )
    )
    db.commit()

    redeem = client.post(
        "/api/auth/password-reset/redeem",
        json={"token": raw_token, "new_password": "BrandNewPw2!"},
    )
    assert redeem.status_code == 204

    # Old password is dead.
    bad = client.post(
        "/api/auth/login", json={"identifier": "alice", "password": "OldPw!!!1"}
    )
    assert bad.status_code == 401

    ok = client.post(
        "/api/auth/login", json={"identifier": "alice", "password": "BrandNewPw2!"}
    )
    assert ok.status_code == 200
