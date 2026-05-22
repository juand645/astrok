from datetime import UTC, date, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.api.deps import assert_can_access_client, get_authenticated_user
from app.core.database import get_db
from app.models.plan import Plan
from app.models.user import User
from app.models.workout_session import WorkoutSession
from app.schemas.workout_session import WorkoutSessionInput, WorkoutSessionRead

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
