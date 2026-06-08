"""Tests that the tenant ContextVar + do_orm_execute event listener prevent
cross-gym data leaks at the ORM layer."""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.gym import Gym
from app.models.user import User
from app.models.user_relation import UserRelation
from tests.conftest import auth_headers, make_user


def _second_gym(db: Session) -> Gym:
    gym = Gym(slug="other", name="Other Gym")
    db.add(gym)
    db.commit()
    db.refresh(gym)
    return gym


def test_trainer_in_gym_a_does_not_see_gym_b_clients(
    client: TestClient,
    db: Session,
    seed_roles: dict,
) -> None:
    """A trainer in the default gym must not see clients from another gym.

    GET /api/clients/ — the response must omit any user whose gym_id differs
    from the caller's. The do_orm_execute hook in app.core.tenancy is what
    makes this hold even though list_my_clients itself doesn't add a manual
    gym filter.
    """
    other_gym = _second_gym(db)

    # Default-gym trainer with one default-gym client.
    trainer_a = make_user(db, username="alice", password="Hunter2!!", roles=("trainer",))
    client_a = make_user(db, username="charlie", password="Hunter2!!", roles=("client",))
    db.add(
        UserRelation(
            gym_id=trainer_a.gym_id,
            professional_id=trainer_a.id,
            client_id=client_a.id,
            relation_type="trainer",
            active=True,
        )
    )

    # Other-gym trainer + client, fully wired.
    trainer_b = make_user(
        db,
        username="bob",
        password="Hunter2!!",
        roles=("trainer",),
        gym_id=other_gym.id,
    )
    client_b = make_user(
        db,
        username="diana",
        password="Hunter2!!",
        roles=("client",),
        gym_id=other_gym.id,
    )
    db.add(
        UserRelation(
            gym_id=other_gym.id,
            professional_id=trainer_b.id,
            client_id=client_b.id,
            relation_type="trainer",
            active=True,
        )
    )
    db.commit()

    headers = auth_headers(client, "alice", "Hunter2!!")
    response = client.get("/api/clients/", headers=headers)

    assert response.status_code == 200, response.text
    returned_ids = {row["id"] for row in response.json()}
    assert client_a.id in returned_ids
    assert client_b.id not in returned_ids


def test_admin_in_gym_a_cannot_read_gym_b_client_by_id(
    client: TestClient,
    db: Session,
    seed_roles: dict,
) -> None:
    """Even an admin should be scoped to their own gym for now.

    An admin in gym A hitting GET /api/clients/{id} for a client in gym B
    must get a 404 (the ORM filter makes the row invisible), not 200.
    """
    other_gym = _second_gym(db)

    make_user(db, username="root", password="Hunter2!!", roles=("admin",))
    other_client = make_user(
        db,
        username="diana",
        password="Hunter2!!",
        roles=("client",),
        gym_id=other_gym.id,
    )

    headers = auth_headers(client, "root", "Hunter2!!")
    response = client.get(f"/api/clients/{other_client.id}", headers=headers)

    # The endpoint either 403s (assert_can_access_client) or 404s (db.get returns
    # None because of the gym filter). Both are acceptable — the row must NOT
    # leak across gyms.
    assert response.status_code in (403, 404), response.text


def test_trainer_in_gym_a_cannot_login_into_gym_b(
    client: TestClient,
    db: Session,
    seed_roles: dict,
) -> None:
    """Sharing a username across gyms must not let users log into the wrong tenant.

    Both gyms have a trainer named ``alice`` with the same password (the
    composite UNIQUE on users.(gym_id, username) makes this possible). The
    login with X-Gym-Slug:default must resolve gym A's alice, never gym B's.
    """
    other_gym = _second_gym(db)

    alice_a = make_user(db, username="alice", password="DefaultPw1!", roles=("trainer",))
    alice_b = make_user(
        db,
        username="alice",
        password="OtherPw2!!",
        roles=("trainer",),
        gym_id=other_gym.id,
    )
    assert alice_a.gym_id != alice_b.gym_id

    # Default-gym password works for default-gym alice.
    ok = client.post(
        "/api/auth/login",
        headers={"X-Gym-Slug": "default"},
        json={"identifier": "alice", "password": "DefaultPw1!"},
    )
    assert ok.status_code == 200, ok.text
    assert ok.json()["user"]["id"] == alice_a.id

    # Other-gym password used against the default-gym slug must fail —
    # gym A's alice doesn't have that password.
    cross = client.post(
        "/api/auth/login",
        headers={"X-Gym-Slug": "default"},
        json={"identifier": "alice", "password": "OtherPw2!!"},
    )
    assert cross.status_code == 401

    # The reverse also works — other-gym slug + other-gym password resolves bob's twin.
    other = client.post(
        "/api/auth/login",
        headers={"X-Gym-Slug": "other"},
        json={"identifier": "alice", "password": "OtherPw2!!"},
    )
    assert other.status_code == 200, other.text
    assert other.json()["user"]["id"] == alice_b.id


def test_orm_select_user_does_not_return_cross_gym_rows(
    db: Session,
    seed_roles: dict,
) -> None:
    """Direct ORM check: when the ContextVar is set, SELECT skips cross-gym rows."""
    from app.core.tenancy import clear_current_gym_id, set_current_gym_id

    other_gym = _second_gym(db)
    default_user = make_user(db, username="alice", password="Hunter2!!")
    other_user = make_user(
        db,
        username="bob",
        password="Hunter2!!",
        gym_id=other_gym.id,
    )

    # No tenant context — both rows visible (this is how get_authenticated_user
    # finds the user before scoping kicks in).
    clear_current_gym_id()
    everyone = db.scalars(select(User)).all()
    assert {u.id for u in everyone} >= {default_user.id, other_user.id}

    # Scoped to default gym — only default_user is visible.
    set_current_gym_id(default_user.gym_id)
    scoped = db.scalars(select(User)).all()
    visible_ids = {u.id for u in scoped}
    assert default_user.id in visible_ids
    assert other_user.id not in visible_ids
