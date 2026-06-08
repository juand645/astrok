"""Tests for the /api/gyms endpoints (create / list / me / patch)."""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from tests.conftest import auth_headers, make_user


def _create_gym_payload(slug: str = "iron-temple") -> dict:
    return {
        "slug": slug,
        "name": "Iron Temple",
        "brand_color": "#222",
        "admin": {
            "full_name": "Iron Admin",
            "email": "iron@example.com",
            "username": "ironadmin",
            "password": "BootstrapPw1!",
        },
    }


def test_admin_can_create_gym_with_bootstrap_admin(
    client: TestClient,
    db: Session,
    seed_roles: dict,
) -> None:
    make_user(db, username="root", password="Hunter2!!", roles=("admin",))
    headers = auth_headers(client, "root", "Hunter2!!")

    response = client.post("/api/gyms/", headers=headers, json=_create_gym_payload())

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["slug"] == "iron-temple"
    assert body["name"] == "Iron Temple"
    assert body["active"] is True


def test_bootstrap_admin_can_log_into_new_gym(
    client: TestClient,
    db: Session,
    seed_roles: dict,
) -> None:
    """End-to-end: create a gym, then the new admin can authenticate against
    it via X-Gym-Slug + their credentials."""
    make_user(db, username="root", password="Hunter2!!", roles=("admin",))
    headers = auth_headers(client, "root", "Hunter2!!")

    creation = client.post("/api/gyms/", headers=headers, json=_create_gym_payload())
    assert creation.status_code == 201, creation.text
    new_gym_id = creation.json()["id"]

    login = client.post(
        "/api/auth/login",
        headers={"X-Gym-Slug": "iron-temple"},
        json={"identifier": "ironadmin", "password": "BootstrapPw1!"},
    )
    assert login.status_code == 200, login.text
    body = login.json()
    assert body["user"]["username"] == "ironadmin"
    assert "admin" in body["user"]["roles"]
    # The new admin lives in the new gym, not the default one.
    new_admin_headers = {"Authorization": f"Bearer {body['access_token']}"}
    me_gym = client.get("/api/gyms/me", headers=new_admin_headers)
    assert me_gym.status_code == 200
    assert me_gym.json()["id"] == new_gym_id


def test_non_admin_cannot_create_gym(
    client: TestClient,
    db: Session,
    seed_roles: dict,
) -> None:
    make_user(db, username="alice", password="Hunter2!!", roles=("trainer",))
    headers = auth_headers(client, "alice", "Hunter2!!")

    response = client.post("/api/gyms/", headers=headers, json=_create_gym_payload())

    assert response.status_code == 403


def test_create_gym_rejects_duplicate_slug(
    client: TestClient,
    db: Session,
    seed_roles: dict,
) -> None:
    make_user(db, username="root", password="Hunter2!!", roles=("admin",))
    headers = auth_headers(client, "root", "Hunter2!!")

    first = client.post("/api/gyms/", headers=headers, json=_create_gym_payload())
    assert first.status_code == 201, first.text

    payload = _create_gym_payload()
    payload["admin"]["email"] = "other@example.com"  # avoid email-collision noise
    payload["admin"]["username"] = "otheruser"
    second = client.post("/api/gyms/", headers=headers, json=payload)

    assert second.status_code == 409


def test_create_gym_validates_slug_shape(
    client: TestClient,
    db: Session,
    seed_roles: dict,
) -> None:
    make_user(db, username="root", password="Hunter2!!", roles=("admin",))
    headers = auth_headers(client, "root", "Hunter2!!")

    bad = _create_gym_payload(slug="-bad-leading-hyphen")
    response = client.post("/api/gyms/", headers=headers, json=bad)
    assert response.status_code == 422  # Pydantic pattern validation


def test_get_my_gym_returns_callers_gym(
    client: TestClient,
    db: Session,
    seed_roles: dict,
) -> None:
    make_user(db, username="alice", password="Hunter2!!", roles=("trainer",))
    headers = auth_headers(client, "alice", "Hunter2!!")

    response = client.get("/api/gyms/me", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["slug"] == "default"


def test_get_my_gym_requires_authentication(client: TestClient) -> None:
    response = client.get("/api/gyms/me")
    assert response.status_code == 401


def test_list_gyms_is_admin_only(
    client: TestClient,
    db: Session,
    seed_roles: dict,
) -> None:
    make_user(db, username="alice", password="Hunter2!!", roles=("trainer",))
    headers = auth_headers(client, "alice", "Hunter2!!")

    response = client.get("/api/gyms/", headers=headers)

    assert response.status_code == 403


def test_admin_cannot_patch_another_gym(
    client: TestClient,
    db: Session,
    seed_roles: dict,
) -> None:
    """A gym admin must not be able to edit a gym they don't belong to."""
    make_user(db, username="root", password="Hunter2!!", roles=("admin",))
    headers = auth_headers(client, "root", "Hunter2!!")

    creation = client.post("/api/gyms/", headers=headers, json=_create_gym_payload())
    assert creation.status_code == 201
    other_gym_id = creation.json()["id"]

    response = client.patch(
        f"/api/gyms/{other_gym_id}",
        headers=headers,
        json={"name": "Stolen Name"},
    )
    assert response.status_code == 403
