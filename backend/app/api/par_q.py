from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import (
    actor_can_create_clients,
    actor_is_admin,
    assert_can_access_client,
    get_authenticated_user,
)
from app.core.database import get_db
from app.models.par_q_assessment import ParQAssessment
from app.models.user import User
from app.schemas.par_q import (
    PAR_Q_QUESTION_IDS,
    ParQAssessmentRead,
    ParQQuestion,
    ParQResponseSubmit,
    question_catalog,
)

router = APIRouter()


@router.get("/par-q/questions", response_model=list[ParQQuestion])
def get_par_q_questions(
    _: User = Depends(get_authenticated_user),
) -> list[ParQQuestion]:
    """Return the canonical 7-question PAR-Q catalog.

    Used by the client-side form to render the questionnaire. The same
    question text is also stored inline with each response (see
    ``ParQResponseSubmit``) so historical answers stay readable even if
    the canonical text changes later.
    """
    return question_catalog()


@router.post(
    "/clients/{client_id}/par-q",
    response_model=ParQAssessmentRead,
    status_code=status.HTTP_201_CREATED,
)
def enable_par_q(
    client_id: int,
    current_user: User = Depends(get_authenticated_user),
    db: Session = Depends(get_db),
) -> ParQAssessment:
    """Trainer enables a PAR-Q for a client. Creates a row with status='requested'.

    Path:
        client_id: Target client.

    Authorization:
      - Caller must have at least one non-client active role
        (trainer / admin / doctor / etc.). Pure clients cannot enable
        PAR-Q for themselves or anyone else.
      - Caller must have access to this client (``assert_can_access_client``).

    Conflicts:
      - 409 if a pending (status='requested') assessment already exists
        for this client. Cancel or complete it first.
    """
    if not actor_can_create_clients(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only professionals can enable a PAR-Q.",
        )
    assert_can_access_client(db, current_user, client_id)

    client = db.get(User, client_id)
    if client is None or not client.active:
        raise HTTPException(status_code=404, detail="Client not found.")

    pending = db.scalar(
        select(ParQAssessment).where(
            ParQAssessment.client_id == client_id,
            ParQAssessment.status == "requested",
        )
    )
    if pending is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A pending PAR-Q already exists for this client.",
        )

    assessment = ParQAssessment(
        client_id=client_id,
        requested_by=current_user.id,
        status="requested",
    )
    db.add(assessment)
    db.commit()
    db.refresh(assessment)
    return assessment


@router.get("/clients/{client_id}/par-q", response_model=list[ParQAssessmentRead])
def list_client_par_q(
    client_id: int,
    current_user: User = Depends(get_authenticated_user),
    db: Session = Depends(get_db),
) -> list[ParQAssessment]:
    """List all PAR-Q assessments for a client, newest first.

    Used by both the trainer view (to show pending/completed status above
    the Plans section) and the client view (to render their pending form
    or display past completed assessments).
    """
    assert_can_access_client(db, current_user, client_id)
    return list(
        db.scalars(
            select(ParQAssessment)
            .where(ParQAssessment.client_id == client_id)
            .order_by(ParQAssessment.created_at.desc())
        )
    )


@router.get("/par-q/{assessment_id}", response_model=ParQAssessmentRead)
def get_par_q(
    assessment_id: int,
    current_user: User = Depends(get_authenticated_user),
    db: Session = Depends(get_db),
) -> ParQAssessment:
    """Fetch a single PAR-Q assessment row, including responses if completed.

    Auth: the client themselves, their assigned professional, or an admin.
    """
    assessment = db.get(ParQAssessment, assessment_id)
    if assessment is None:
        raise HTTPException(status_code=404, detail="PAR-Q not found.")
    assert_can_access_client(db, current_user, assessment.client_id)
    return assessment


@router.post(
    "/par-q/{assessment_id}/respond",
    response_model=ParQAssessmentRead,
)
def submit_par_q(
    assessment_id: int,
    payload: ParQResponseSubmit,
    current_user: User = Depends(get_authenticated_user),
    db: Session = Depends(get_db),
) -> ParQAssessment:
    """Client submits answers to a pending PAR-Q.

    Path:
        assessment_id: The pending assessment to complete.

    Body (``ParQResponseSubmit``):
        answers: A list of {id, text, answer ("yes"|"no"), follow_up?}
            covering every question in ``PAR_Q_QUESTION_IDS`` exactly once.
        client_acknowledgement: Free text confirming the answers are
            truthful (required by PAR-Q convention).

    Authorization: only the assessment's own client may submit. Admins
    cannot submit on behalf of someone else.

    Conflict:
      - 400 if the assessment is not in 'requested' state.
      - 400 if the answer set is missing or duplicates question ids.

    On success: stamps ``completed_at = now()``, sets ``status='completed'``,
    persists the answers + ``any_yes`` flag into ``responses``.
    """
    assessment = db.get(ParQAssessment, assessment_id)
    if assessment is None:
        raise HTTPException(status_code=404, detail="PAR-Q not found.")

    if current_user.id != assessment.client_id and not actor_is_admin(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the client themselves can submit this PAR-Q.",
        )

    if assessment.status != "requested":
        raise HTTPException(
            status_code=400,
            detail=f"This PAR-Q is already {assessment.status}.",
        )

    answer_ids = [a.id for a in payload.answers]
    if set(answer_ids) != PAR_Q_QUESTION_IDS or len(answer_ids) != len(PAR_Q_QUESTION_IDS):
        raise HTTPException(
            status_code=400,
            detail="Answers must cover every PAR-Q question exactly once.",
        )

    now = datetime.now(UTC)
    any_yes = any(a.answer == "yes" for a in payload.answers)

    assessment.responses = {
        "questions": [a.model_dump() for a in payload.answers],
        "any_yes": any_yes,
        "client_acknowledgement": payload.client_acknowledgement.strip(),
        "submitted_at": now.isoformat(),
    }
    assessment.completed_at = now
    assessment.status = "completed"
    assessment.updated_at = now

    db.commit()
    db.refresh(assessment)
    return assessment
