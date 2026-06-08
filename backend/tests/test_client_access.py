"""Tests for ``assert_can_access_client`` — multi-tenant scoping on /api/clients/{id}."""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.user import User
from app.models.user_relation import UserRelation

from tests.conftest import auth_headers, make_user


def _link(db: Session, trainer: User, client: User) -> None:
    """Insert an active user_relations row tying trainer → client."""
    db.add(
        UserRelation(
            gym_id=trainer.gym_id,
            professional_id=trainer.id,
            client_id=client.id,
            relation_type="trainer",
            active=True,
        )
    )
    db.commit()


def test_assigned_trainer_can_read_their_client(
    client: TestClient,
    db: Session,
    seed_roles: dict,
) -> None:
    trainer = make_user(db, username="alice", password="Hunter2!!", roles=("trainer",))
    member = make_user(db, username="charlie", password="Hunter2!!", roles=("client",))
    _link(db, trainer=trainer, client=member)

    headers = auth_headers(client, "alice", "Hunter2!!")
    response = client.get(f"/api/clients/{member.id}", headers=headers)

    assert response.status_code == 200
    assert response.json()["id"] == member.id


def test_unrelated_trainer_is_forbidden(
    client: TestClient,
    db: Session,
    seed_roles: dict,
) -> None:
    """A trainer with no relation row to the client must be 403'd."""
    alice = make_user(db, username="alice", password="Hunter2!!", roles=("trainer",))
    bob = make_user(db, username="bob", password="Hunter2!!", roles=("trainer",))
    member = make_user(db, username="charlie", password="Hunter2!!", roles=("client",))
    _link(db, trainer=alice, client=member)  # member belongs to alice, not bob

    headers = auth_headers(client, bob.username, "Hunter2!!")
    response = client.get(f"/api/clients/{member.id}", headers=headers)

    assert response.status_code == 403


def test_admin_can_read_any_client(
    client: TestClient,
    db: Session,
    seed_roles: dict,
) -> None:
    make_user(db, username="root", password="Hunter2!!", roles=("admin",))
    member = make_user(db, username="charlie", password="Hunter2!!", roles=("client",))

    headers = auth_headers(client, "root", "Hunter2!!")
    response = client.get(f"/api/clients/{member.id}", headers=headers)

    assert response.status_code == 200


def test_client_can_read_themselves(
    client: TestClient,
    db: Session,
    seed_roles: dict,
) -> None:
    member = make_user(db, username="charlie", password="Hunter2!!", roles=("client",))

    headers = auth_headers(client, "charlie", "Hunter2!!")
    response = client.get(f"/api/clients/{member.id}", headers=headers)

    assert response.status_code == 200
