"""Integration tests for the ``/api/auth/*`` endpoints."""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from tests.conftest import auth_headers, make_user


def test_login_with_username_returns_token_and_user(
    client: TestClient,
    db: Session,
    seed_roles: dict,
) -> None:
    user = make_user(db, username="alice", password="Hunter2!!", roles=("trainer",))

    response = client.post(
        "/api/auth/login",
        json={"identifier": "alice", "password": "Hunter2!!"},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["access_token"]
    assert body["user"]["id"] == user.id
    assert body["user"]["username"] == "alice"
    assert "trainer" in body["user"]["roles"]


def test_login_with_email_also_works(
    client: TestClient,
    db: Session,
    seed_roles: dict,
) -> None:
    make_user(
        db,
        username="bob",
        email="bob@example.com",
        password="Hunter2!!",
        roles=("client",),
    )

    response = client.post(
        "/api/auth/login",
        json={"identifier": "bob@example.com", "password": "Hunter2!!"},
    )

    assert response.status_code == 200, response.text


def test_login_with_wrong_password_returns_401(
    client: TestClient,
    db: Session,
    seed_roles: dict,
) -> None:
    make_user(db, username="alice", password="Hunter2!!")

    response = client.post(
        "/api/auth/login",
        json={"identifier": "alice", "password": "not-the-password"},
    )

    assert response.status_code == 401
    assert "Invalid" in response.json()["detail"]


def test_login_for_inactive_user_returns_401(
    client: TestClient,
    db: Session,
    seed_roles: dict,
) -> None:
    """Soft-deleted users must not be able to log in even with correct credentials."""
    make_user(db, username="ghost", password="Hunter2!!", active=False)

    response = client.post(
        "/api/auth/login",
        json={"identifier": "ghost", "password": "Hunter2!!"},
    )

    assert response.status_code == 401


def test_me_returns_authenticated_user(
    client: TestClient,
    db: Session,
    seed_roles: dict,
) -> None:
    user = make_user(db, username="alice", password="Hunter2!!", roles=("trainer",))
    headers = auth_headers(client, "alice", "Hunter2!!")

    response = client.get("/api/auth/me", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == user.id
    assert body["username"] == "alice"


def test_me_without_token_returns_401(client: TestClient) -> None:
    response = client.get("/api/auth/me")

    assert response.status_code == 401
    assert response.headers.get("www-authenticate") == "Bearer"


def test_me_with_malformed_token_returns_401(client: TestClient) -> None:
    response = client.get(
        "/api/auth/me",
        headers={"Authorization": "Bearer not-a-real-jwt"},
    )

    assert response.status_code == 401
