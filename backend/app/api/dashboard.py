from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from app.api.deps import actor_can_create_clients, get_authenticated_user
from app.core.database import get_db
from app.models.appointment import Appointment, AppointmentStatus
from app.models.par_q_assessment import ParQAssessment
from app.models.plan import Plan
from app.models.user import User
from app.models.user_relation import UserRelation
from app.models.workout_session import WorkoutSession
from app.schemas.dashboard import (
    DashboardAppointment,
    DashboardDraftPlan,
    DashboardParQAlert,
    DashboardStats,
    TrainerDashboard,
)


router = APIRouter()


def _iso_week_bounds_utc(now: datetime) -> tuple[datetime, datetime]:
    """Return (monday_00:00, next_monday_00:00) in UTC for the week containing ``now``."""
    start_date = (now - timedelta(days=now.weekday())).date()
    start = datetime(start_date.year, start_date.month, start_date.day, tzinfo=UTC)
    return start, start + timedelta(days=7)


@router.get("/trainer", response_model=TrainerDashboard)
def trainer_dashboard(
    current_user: User = Depends(get_authenticated_user),
    db: Session = Depends(get_db),
) -> TrainerDashboard:
    """Aggregated dashboard for trainers/admins/etc.: stats + actionable lists.

    Authorization: any caller with at least one active non-client role.
    Pure clients get 403 (they have their own dashboard).

    Bundles four pieces of data so the frontend only needs one round-trip on
    mount:
      - ``stats``: counts for active clients (per the caller), active plans,
        sessions logged this ISO week (Mon-Sun, UTC), and appointments this
        week.
      - ``upcoming_appointments``: every confirmed/requested/completed
        appointment whose ``starts_at`` falls in the next 48 hours. The
        frontend buckets these into "today" vs "tomorrow" using its local
        timezone.
      - ``draft_plans``: every active plan owned by the caller with
        ``status='draft'``, newest first — the trainer's review queue.
      - ``par_q_alerts``: clients whose most recent completed PAR-Q has
        ``any_yes=true`` (medical clearance recommended). Limited to clients
        currently assigned to the caller via ``user_relations``.
    """
    if not actor_can_create_clients(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Trainer dashboard is only available to professional roles.",
        )

    now = datetime.now(UTC)
    week_start, week_end = _iso_week_bounds_utc(now)
    horizon_end = now + timedelta(hours=48)

    client_id_rows = db.scalars(
        select(UserRelation.client_id).where(
            UserRelation.professional_id == current_user.id,
            UserRelation.active.is_(True),
        )
    ).all()
    client_ids = list(client_id_rows)

    active_clients = (
        db.scalar(
            select(func.count())
            .select_from(UserRelation)
            .join(User, User.id == UserRelation.client_id)
            .where(
                UserRelation.professional_id == current_user.id,
                UserRelation.active.is_(True),
                User.active.is_(True),
            )
        )
        or 0
    )

    active_plans = (
        db.scalar(
            select(func.count(Plan.id)).where(
                Plan.professional_id == current_user.id,
                Plan.active.is_(True),
            )
        )
        or 0
    )

    sessions_this_week = (
        db.scalar(
            select(func.count(WorkoutSession.id))
            .join(Plan, Plan.id == WorkoutSession.plan_id)
            .where(
                Plan.professional_id == current_user.id,
                WorkoutSession.session_date >= week_start.date(),
                WorkoutSession.session_date < week_end.date(),
            )
        )
        or 0
    )

    appointments_this_week = (
        db.scalar(
            select(func.count(Appointment.id)).where(
                Appointment.professional_id == current_user.id,
                Appointment.status != AppointmentStatus.cancelled,
                Appointment.starts_at >= week_start,
                Appointment.starts_at < week_end,
            )
        )
        or 0
    )

    upcoming_rows = db.execute(
        select(Appointment, User)
        .join(User, User.id == Appointment.client_id)
        .where(
            Appointment.professional_id == current_user.id,
            Appointment.status != AppointmentStatus.cancelled,
            Appointment.starts_at >= now,
            Appointment.starts_at < horizon_end,
        )
        .order_by(Appointment.starts_at)
    ).all()

    upcoming_appointments = [
        DashboardAppointment(
            id=appointment.id,
            starts_at=appointment.starts_at,
            ends_at=appointment.ends_at,
            status=appointment.status,
            focus=appointment.focus,
            client_id=client.id,
            client_name=client.full_name,
            client_username=client.username,
        )
        for appointment, client in upcoming_rows
    ]

    draft_rows = db.execute(
        select(Plan, User)
        .join(User, User.id == Plan.client_id)
        .where(
            Plan.professional_id == current_user.id,
            Plan.active.is_(True),
            Plan.status == "draft",
        )
        .order_by(Plan.updated_at.desc())
    ).all()

    draft_plans = [
        DashboardDraftPlan(
            id=plan.id,
            title=plan.title,
            updated_at=plan.updated_at,
            client_id=client.id,
            client_name=client.full_name,
        )
        for plan, client in draft_rows
    ]

    par_q_alerts: list[DashboardParQAlert] = []
    if client_ids:
        latest_completed_subq = (
            select(
                ParQAssessment.client_id,
                func.max(ParQAssessment.completed_at).label("latest_completed_at"),
            )
            .where(
                ParQAssessment.client_id.in_(client_ids),
                ParQAssessment.status == "completed",
            )
            .group_by(ParQAssessment.client_id)
            .subquery()
        )

        latest_rows = db.execute(
            select(ParQAssessment, User)
            .join(
                latest_completed_subq,
                and_(
                    ParQAssessment.client_id == latest_completed_subq.c.client_id,
                    ParQAssessment.completed_at == latest_completed_subq.c.latest_completed_at,
                ),
            )
            .join(User, User.id == ParQAssessment.client_id)
            .order_by(ParQAssessment.completed_at.desc())
        ).all()

        for assessment, client in latest_rows:
            responses = assessment.responses or {}
            if responses.get("any_yes") is True:
                par_q_alerts.append(
                    DashboardParQAlert(
                        assessment_id=assessment.id,
                        completed_at=assessment.completed_at,
                        client_id=client.id,
                        client_name=client.full_name,
                    )
                )

    return TrainerDashboard(
        stats=DashboardStats(
            active_clients=int(active_clients),
            active_plans=int(active_plans),
            sessions_this_week=int(sessions_this_week),
            appointments_this_week=int(appointments_this_week),
        ),
        upcoming_appointments=upcoming_appointments,
        draft_plans=draft_plans,
        par_q_alerts=par_q_alerts,
    )
