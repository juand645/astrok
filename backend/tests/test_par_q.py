"""Tests for the PAR-Q submission endpoint."""

from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.par_q_assessment import ParQAssessment
from app.models.user import User
from app.models.user_relation import UserRelation
from app.schemas.par_q import PAR_Q_QUESTIONS
from tests.conftest import auth_headers, make_user


def _all_no_answers() -> list[dict[str, Any]]:
    """Build a valid payload where the client answered ``no`` to every question."""
    return [{"id": q["id"], "text": q["text"], "answer": "no"} for q in PAR_Q_QUESTIONS]


def _seed_assessment(db: Session, trainer: User, member: User) -> ParQAssessment:
    db.add(
        UserRelation(
            professional_id=trainer.id,
            client_id=member.id,
            relation_type="trainer",
            active=True,
        )
    )
    assessment = ParQAssessment(
        client_id=member.id,
        requested_by=trainer.id,
        status="requested",
    )
    db.add(assessment)
    db.commit()
    db.refresh(assessment)
    return assessment


def test_client_submits_all_no_answers(
    client: TestClient,
    db: Session,
    seed_roles: dict,
) -> None:
    trainer = make_user(db, username="alice", password="Hunter2!!", roles=("trainer",))
    member = make_user(db, username="charlie", password="Hunter2!!", roles=("client",))
    assessment = _seed_assessment(db, trainer, member)

    headers = auth_headers(client, "charlie", "Hunter2!!")
    response = client.post(
        f"/api/par-q/{assessment.id}/respond",
        headers=headers,
        json={
            "answers": _all_no_answers(),
            "client_acknowledgement": "Confirmo que mis respuestas son veraces.",
        },
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "completed"
    assert body["responses"]["any_yes"] is False
    assert len(body["responses"]["questions"]) == len(PAR_Q_QUESTIONS)


def test_any_yes_flag_flips_when_one_answer_is_yes(
    client: TestClient,
    db: Session,
    seed_roles: dict,
) -> None:
    trainer = make_user(db, username="alice", password="Hunter2!!", roles=("trainer",))
    member = make_user(db, username="charlie", password="Hunter2!!", roles=("client",))
    assessment = _seed_assessment(db, trainer, member)

    answers = _all_no_answers()
    answers[2]["answer"] = "yes"
    answers[2]["follow_up"] = "Dolor leve después del esfuerzo."

    headers = auth_headers(client, "charlie", "Hunter2!!")
    response = client.post(
        f"/api/par-q/{assessment.id}/respond",
        headers=headers,
        json={
            "answers": answers,
            "client_acknowledgement": "Confirmo.",
        },
    )

    assert response.status_code == 200, response.text
    assert response.json()["responses"]["any_yes"] is True


def test_missing_question_id_rejected(
    client: TestClient,
    db: Session,
    seed_roles: dict,
) -> None:
    trainer = make_user(db, username="alice", password="Hunter2!!", roles=("trainer",))
    member = make_user(db, username="charlie", password="Hunter2!!", roles=("client",))
    assessment = _seed_assessment(db, trainer, member)

    headers = auth_headers(client, "charlie", "Hunter2!!")
    response = client.post(
        f"/api/par-q/{assessment.id}/respond",
        headers=headers,
        json={
            "answers": _all_no_answers()[:-1],  # 6 of 7 questions
            "client_acknowledgement": "Confirmo.",
        },
    )

    assert response.status_code == 400
    assert "every PAR-Q question" in response.json()["detail"]


def test_duplicate_question_id_rejected(
    client: TestClient,
    db: Session,
    seed_roles: dict,
) -> None:
    trainer = make_user(db, username="alice", password="Hunter2!!", roles=("trainer",))
    member = make_user(db, username="charlie", password="Hunter2!!", roles=("client",))
    assessment = _seed_assessment(db, trainer, member)

    duplicated = _all_no_answers()
    duplicated[1] = duplicated[0]  # two answers with the same id, one missing

    headers = auth_headers(client, "charlie", "Hunter2!!")
    response = client.post(
        f"/api/par-q/{assessment.id}/respond",
        headers=headers,
        json={
            "answers": duplicated,
            "client_acknowledgement": "Confirmo.",
        },
    )

    assert response.status_code == 400


def test_trainer_cannot_submit_on_behalf_of_client(
    client: TestClient,
    db: Session,
    seed_roles: dict,
) -> None:
    """The trainer who requested the PAR-Q can't fill it in for the client."""
    trainer = make_user(db, username="alice", password="Hunter2!!", roles=("trainer",))
    member = make_user(db, username="charlie", password="Hunter2!!", roles=("client",))
    assessment = _seed_assessment(db, trainer, member)

    headers = auth_headers(client, "alice", "Hunter2!!")
    response = client.post(
        f"/api/par-q/{assessment.id}/respond",
        headers=headers,
        json={
            "answers": _all_no_answers(),
            "client_acknowledgement": "Confirmo.",
        },
    )

    assert response.status_code == 403


def test_cannot_submit_already_completed_assessment(
    client: TestClient,
    db: Session,
    seed_roles: dict,
) -> None:
    trainer = make_user(db, username="alice", password="Hunter2!!", roles=("trainer",))
    member = make_user(db, username="charlie", password="Hunter2!!", roles=("client",))
    assessment = _seed_assessment(db, trainer, member)

    headers = auth_headers(client, "charlie", "Hunter2!!")
    payload = {
        "answers": _all_no_answers(),
        "client_acknowledgement": "Confirmo.",
    }
    first = client.post(f"/api/par-q/{assessment.id}/respond", headers=headers, json=payload)
    assert first.status_code == 200

    second = client.post(f"/api/par-q/{assessment.id}/respond", headers=headers, json=payload)
    assert second.status_code == 400
    assert "already" in second.json()["detail"]
