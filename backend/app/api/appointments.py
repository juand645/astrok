from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.api.deps import (
    actor_can_create_clients,
    actor_is_admin,
    assert_can_access_client,
    get_authenticated_user,
)
from app.core.database import get_db
from app.models.appointment import Appointment, AppointmentStatus
from app.models.user import User
from app.models.user_relation import UserRelation
from app.schemas.appointment import (
    AppointmentCreate,
    AppointmentRead,
    AppointmentStatusUpdate,
    AvailabilitySlot,
)

router = APIRouter()

SCHEDULE_OPEN_HOUR = 5
SCHEDULE_LAST_START_HOUR = 18  # last bookable start hour; slot ends at 19:00
MAX_DAYS_AHEAD = 28


@router.get("/me", response_model=list[AppointmentRead])
def list_my_appointments(
    current_user: User = Depends(get_authenticated_user),
    db: Session = Depends(get_db),
    starts_after: Annotated[datetime | None, Query()] = None,
    starts_before: Annotated[datetime | None, Query()] = None,
) -> list[Appointment]:
    stmt = select(Appointment).where(
        or_(
            Appointment.client_id == current_user.id,
            Appointment.professional_id == current_user.id,
        ),
        Appointment.status != AppointmentStatus.cancelled,
    )
    if starts_after is not None:
        stmt = stmt.where(Appointment.starts_at >= starts_after)
    if starts_before is not None:
        stmt = stmt.where(Appointment.starts_at < starts_before)
    stmt = stmt.order_by(Appointment.starts_at)
    return list(db.scalars(stmt))


@router.get("/availability/{professional_id}", response_model=list[AvailabilitySlot])
def professional_availability(
    professional_id: int,
    current_user: User = Depends(get_authenticated_user),
    db: Session = Depends(get_db),
    starts_after: Annotated[datetime | None, Query()] = None,
    starts_before: Annotated[datetime | None, Query()] = None,
) -> list[AvailabilitySlot]:
    if current_user.id != professional_id and not actor_is_admin(current_user):
        relation = db.scalar(
            select(UserRelation).where(
                UserRelation.client_id == current_user.id,
                UserRelation.professional_id == professional_id,
                UserRelation.active.is_(True),
            )
        )
        if relation is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have access to this professional's calendar.",
            )

    stmt = select(Appointment).where(
        Appointment.professional_id == professional_id,
        Appointment.status != AppointmentStatus.cancelled,
    )
    if starts_after is not None:
        stmt = stmt.where(Appointment.starts_at >= starts_after)
    if starts_before is not None:
        stmt = stmt.where(Appointment.starts_at < starts_before)

    return [
        AvailabilitySlot(starts_at=row.starts_at, ends_at=row.ends_at)
        for row in db.scalars(stmt)
    ]


@router.post("/", response_model=AppointmentRead, status_code=status.HTTP_201_CREATED)
def create_appointment(
    payload: AppointmentCreate,
    current_user: User = Depends(get_authenticated_user),
    db: Session = Depends(get_db),
) -> Appointment:
    starts_at = payload.starts_at
    if starts_at.tzinfo is None:
        raise HTTPException(
            status_code=400,
            detail="starts_at must include a timezone (ISO with offset).",
        )

    if starts_at.minute != 0 or starts_at.second != 0 or starts_at.microsecond != 0:
        raise HTTPException(status_code=400, detail="starts_at must be on the hour.")

    local_hour = starts_at.astimezone(starts_at.tzinfo).hour
    if local_hour < SCHEDULE_OPEN_HOUR or local_hour > SCHEDULE_LAST_START_HOUR:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Bookings can only start between {SCHEDULE_OPEN_HOUR}:00 and "
                f"{SCHEDULE_LAST_START_HOUR}:00 (the last slot ends at 19:00)."
            ),
        )

    now_utc = datetime.now(UTC)
    if starts_at <= now_utc:
        raise HTTPException(status_code=400, detail="Cannot book in the past.")
    if starts_at > now_utc + timedelta(days=MAX_DAYS_AHEAD):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot book more than {MAX_DAYS_AHEAD} days ahead.",
        )

    can_book_for_others = actor_can_create_clients(current_user)

    if can_book_for_others:
        if payload.client_id is None:
            raise HTTPException(
                status_code=400, detail="client_id is required when booking for a client."
            )
        client_id = payload.client_id
        assert_can_access_client(db, current_user, client_id)
        professional_id = payload.professional_id or current_user.id
        if professional_id != current_user.id and not actor_is_admin(current_user):
            raise HTTPException(
                status_code=403,
                detail="You can only book on behalf of yourself as the professional.",
            )
    else:
        client_id = current_user.id
        relation = db.scalar(
            select(UserRelation)
            .where(
                UserRelation.client_id == current_user.id,
                UserRelation.active.is_(True),
            )
            .order_by(UserRelation.created_at.desc())
            .limit(1)
        )
        if relation is None:
            raise HTTPException(
                status_code=400, detail="You don't have an assigned professional yet."
            )
        professional_id = relation.professional_id

    ends_at = starts_at + timedelta(hours=1)

    conflict = db.scalar(
        select(Appointment).where(
            Appointment.professional_id == professional_id,
            Appointment.starts_at < ends_at,
            Appointment.ends_at > starts_at,
            Appointment.status != AppointmentStatus.cancelled,
        )
    )
    if conflict:
        raise HTTPException(status_code=409, detail="This slot is already booked.")

    appointment = Appointment(
        client_id=client_id,
        professional_id=professional_id,
        starts_at=starts_at,
        ends_at=ends_at,
        status=AppointmentStatus.confirmed,
        focus=payload.focus or "Personal training",
        notes=payload.notes,
    )
    db.add(appointment)
    db.commit()
    db.refresh(appointment)
    return appointment


@router.patch("/{appointment_id}", response_model=AppointmentRead)
def update_appointment_status(
    appointment_id: int,
    payload: AppointmentStatusUpdate,
    current_user: User = Depends(get_authenticated_user),
    db: Session = Depends(get_db),
) -> Appointment:
    appointment = db.get(Appointment, appointment_id)
    if appointment is None:
        raise HTTPException(status_code=404, detail="Appointment not found.")

    if (
        current_user.id != appointment.client_id
        and current_user.id != appointment.professional_id
        and not actor_is_admin(current_user)
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have access to this appointment.",
        )

    if (
        payload.status == AppointmentStatus.cancelled
        and current_user.id == appointment.client_id
        and current_user.id != appointment.professional_id
    ):
        pass

    appointment.status = payload.status
    db.commit()
    db.refresh(appointment)
    return appointment
