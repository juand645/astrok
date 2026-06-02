"""Role-based access tests against admin-only endpoints."""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from tests.conftest import auth_headers, make_user


def test_trainers_list_is_admin_only(
    client: TestClient,
    db: Session,
    seed_roles: dict,
) -> None:
    """A trainer (non-admin) must be 403'd by GET /api/trainers/."""
    make_user(db, username="alice", password="Hunter2!!", roles=("trainer",))
    headers = auth_headers(client, "alice", "Hunter2!!")

    response = client.get("/api/trainers/", headers=headers)

    assert response.status_code == 403
    assert "administrators" in response.json()["detail"].lower()


def test_trainers_list_works_for_admin(
    client: TestClient,
    db: Session,
    seed_roles: dict,
) -> None:
    make_user(db, username="root", password="Hunter2!!", roles=("admin",))
    headers = auth_headers(client, "root", "Hunter2!!")

    response = client.get("/api/trainers/", headers=headers)

    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_trainers_list_requires_authentication(client: TestClient) -> None:
    response = client.get("/api/trainers/")

    assert response.status_code == 401
