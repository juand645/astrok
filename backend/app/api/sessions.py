from datetime import UTC, date, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.api.deps import assert_can_access_client, get_authenticated_user
from app.core.config import settings
from app.core.database import get_db
from app.models.plan import Plan
from app.models.user import User
from app.models.workout_session import WorkoutSession
from app.schemas.workout_session import (
    CoachMessageResponse,
    WorkoutSessionInput,
    WorkoutSessionRead,
)
from app.services.coach import compute_session_insights, generate_coach_message

router = APIRouter()

SESSION_HISTORY_LIMIT = 2


@router.post(
    "/clients/{client_id}/sessions",
    response_model=WorkoutSessionRead,
    status_code=status.HTTP_201_CREATED,
)
def log_session(
    client_id: int,
    payload: WorkoutSessionInput,
    current_user: User = Depends(get_authenticated_user),
    db: Session = Depends(get_db),
) -> WorkoutSession:
    """Save a workout session — overwrite the in-progress one for this week, or insert new.

    Path:
        client_id: Owner of the session.

    Body (``WorkoutSessionInput``):
        plan_id, day_key: Which plan + day this session belongs to.
        performance: Array of {ejercicio, peso, repeticiones, ...}.
        completed: Mark the session "done" (also stamps ``completed_at``).
        rating: Optional 1-5 star feeling.
        notes: Optional text.
        session_date: Defaults to today.

    Behavior:
      - If there's an in-progress session for the same (plan, day) in the
        same ISO week, that row is MUTATED in place. Once a session is
        completed, subsequent saves create a new row instead.
      - After save, the cap-2 trim keeps the two most recent rows per
        (plan, day) by deleting older ones.

    Caller must have access to the client via ``assert_can_access_client``.
    """
    assert_can_access_client(db, current_user, client_id)

    plan = db.get(Plan, payload.plan_id)
    if plan is None or plan.client_id != client_id or not plan.active:
        raise HTTPException(status_code=404, detail="Plan not found for this client.")

    now = datetime.now(UTC)
    day_key = payload.day_key.strip()
    session_date_value = payload.session_date or date.today()
    week_start = session_date_value - timedelta(days=session_date_value.weekday())
    week_end = week_start + timedelta(days=7)

    existing = db.scalar(
        select(WorkoutSession)
        .where(
            WorkoutSession.client_id == client_id,
            WorkoutSession.plan_id == payload.plan_id,
            WorkoutSession.day_key == day_key,
            WorkoutSession.completed.is_(False),
            WorkoutSession.session_date >= week_start,
            WorkoutSession.session_date < week_end,
        )
        .order_by(
            WorkoutSession.session_date.desc(),
            WorkoutSession.id.desc(),
        )
    )

    if existing is not None:
        existing.performance = payload.performance
        existing.completed = payload.completed
        existing.completed_at = now if payload.completed else None
        existing.rating = payload.rating
        existing.notes = payload.notes
        existing.recorded_by = current_user.id
        existing.session_date = session_date_value
        existing.updated_at = now
        flag_modified(existing, "performance")
        session = existing
    else:
        session = WorkoutSession(
            plan_id=payload.plan_id,
            client_id=client_id,
            recorded_by=current_user.id,
            day_key=day_key,
            session_date=session_date_value,
            performance=payload.performance,
            completed=payload.completed,
            completed_at=now if payload.completed else None,
            rating=payload.rating,
            notes=payload.notes,
        )
        db.add(session)
    db.flush()

    other_rows = list(
        db.scalars(
            select(WorkoutSession)
            .where(
                WorkoutSession.client_id == client_id,
                WorkoutSession.plan_id == payload.plan_id,
                WorkoutSession.day_key == day_key,
                WorkoutSession.id != session.id,
            )
            .order_by(
                WorkoutSession.session_date.desc(),
                WorkoutSession.id.desc(),
            )
        )
    )
    for stale in other_rows[SESSION_HISTORY_LIMIT - 1 :]:
        db.delete(stale)

    db.commit()
    db.refresh(session)
    return session


@router.get(
    "/clients/{client_id}/sessions/{session_id}/coach-message",
    response_model=CoachMessageResponse,
)
def coach_message_for_session(
    client_id: int,
    session_id: int,
    current_user: User = Depends(get_authenticated_user),
    db: Session = Depends(get_db),
) -> CoachMessageResponse:
    """Return (and cache) the AI coach message for a completed session.

    Path:
        client_id, session_id: Identify the session.

    Idempotent: if ``ai_response`` is already on the row, returns it with
    ``cached=true``. Otherwise computes the structured insights, calls the
    LLM, persists the message on the session row, and returns it.

    Returns a placeholder with ``reason`` when:
      - the user has opted out via ``coach_messages_enabled = false``
      - ``AI_API_KEY`` is not configured
      - the LLM call raised (full error in ``reason``)
    """
    assert_can_access_client(db, current_user, client_id)

    session = db.get(WorkoutSession, session_id)
    if session is None or session.client_id != client_id:
        raise HTTPException(status_code=404, detail="Session not found.")
    if not session.completed:
        raise HTTPException(
            status_code=400,
            detail="Coach messages are only generated for completed sessions.",
        )

    client = db.get(User, client_id)
    if client is None:
        raise HTTPException(status_code=404, detail="Client not found.")
    if not getattr(client, "coach_messages_enabled", True):
        return CoachMessageResponse(message=None, reason="disabled")

    if session.ai_response:
        return CoachMessageResponse(message=session.ai_response, cached=True)

    if not settings.ai_api_key:
        return CoachMessageResponse(message=None, reason="no_api_key")

    plan = db.get(Plan, session.plan_id)
    if plan is None:
        raise HTTPException(status_code=404, detail="Plan not found.")

    insights = compute_session_insights(session, plan, client, db)

    try:
        message = generate_coach_message(
            insights,
            api_key=settings.ai_api_key,
            model=settings.ai_model,
            language=settings.ai_language,
        )
    except Exception as exc:  # noqa: BLE001
        return CoachMessageResponse(message=None, reason=f"generation_failed: {exc}")

    if not message:
        return CoachMessageResponse(message=None, reason="empty_response")

    session.ai_response = message
    db.commit()
    db.refresh(session)
    return CoachMessageResponse(message=session.ai_response, cached=False)


@router.get(
    "/clients/{client_id}/sessions",
    response_model=list[WorkoutSessionRead],
)
def list_sessions(
    client_id: int,
    current_user: User = Depends(get_authenticated_user),
    db: Session = Depends(get_db),
    plan_id: Annotated[int | None, Query()] = None,
    day_key: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 30,
) -> list[WorkoutSession]:
    """List recent sessions for a client, optionally filtered by plan + day.

    Path:
        client_id: Whose sessions.

    Query:
        plan_id: Restrict to one plan.
        day_key: Restrict to one day (e.g. ``dia_1``).
        limit: Max rows (1-100, default 30).

    Ordered by ``session_date`` then ``id`` descending — newest first.
    """
    assert_can_access_client(db, current_user, client_id)

    stmt = select(WorkoutSession).where(WorkoutSession.client_id == client_id)
    if plan_id is not None:
        stmt = stmt.where(WorkoutSession.plan_id == plan_id)
    if day_key is not None:
        stmt = stmt.where(WorkoutSession.day_key == day_key.strip())

    stmt = stmt.order_by(
        WorkoutSession.session_date.desc(), WorkoutSession.id.desc()
    ).limit(limit)

    return list(db.scalars(stmt))
