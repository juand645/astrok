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
from app.models.trainer_unavailability import TrainerUnavailability
from app.models.user import User
from app.models.user_relation import UserRelation
from app.schemas.appointment import (
    AppointmentCreate,
    AppointmentRead,
    AppointmentStatusUpdate,
    AvailabilitySlot,
)
from app.schemas.trainer_unavailability import (
    TrainerUnavailabilityCreate,
    TrainerUnavailabilityRead,
)

router = APIRouter()

SCHEDULE_OPEN_HOUR = 5
SCHEDULE_LAST_START_HOUR = 18  # last bookable start hour; slot ends at 19:00


@router.get("/me", response_model=list[AppointmentRead])
def list_my_appointments(
    current_user: User = Depends(get_authenticated_user),
    db: Session = Depends(get_db),
    starts_after: Annotated[datetime | None, Query()] = None,
    starts_before: Annotated[datetime | None, Query()] = None,
) -> list[Appointment]:
    """List appointments where the caller is either the client or the professional.

    Query:
        starts_after, starts_before: Optional ISO datetimes that bound the
            ``starts_at`` field — used by the calendar grid to fetch one
            week at a time.

    Excludes cancelled appointments. Ordered by ``starts_at`` ascending.
    """
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
    """Return the trainer's busy slots in a date range, **anonymized**.

    Used by the client booking grid to show which slots are taken without
    exposing other clients' identities. Each returned entry is just
    ``{starts_at, ends_at}`` — no client_id, no focus, no notes.

    Path:
        professional_id: The trainer being queried.

    Query:
        starts_after, starts_before: Optional time window bounds.

    Access: the professional themselves, an assigned client of theirs (via
    ``user_relations``), or an admin. Cancelled appointments are excluded.
    """
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

    appt_stmt = select(Appointment).where(
        Appointment.professional_id == professional_id,
        Appointment.status != AppointmentStatus.cancelled,
    )
    ooo_stmt = select(TrainerUnavailability).where(
        TrainerUnavailability.professional_id == professional_id,
    )
    if starts_after is not None:
        appt_stmt = appt_stmt.where(Appointment.starts_at >= starts_after)
        ooo_stmt = ooo_stmt.where(TrainerUnavailability.starts_at >= starts_after)
    if starts_before is not None:
        appt_stmt = appt_stmt.where(Appointment.starts_at < starts_before)
        ooo_stmt = ooo_stmt.where(TrainerUnavailability.starts_at < starts_before)

    slots: list[AvailabilitySlot] = [
        AvailabilitySlot(starts_at=row.starts_at, ends_at=row.ends_at)
        for row in db.scalars(appt_stmt)
    ]
    slots.extend(
        AvailabilitySlot(starts_at=row.starts_at, ends_at=row.ends_at)
        for row in db.scalars(ooo_stmt)
    )
    return slots


@router.post("/", response_model=AppointmentRead, status_code=status.HTTP_201_CREATED)
def create_appointment(
    payload: AppointmentCreate,
    current_user: User = Depends(get_authenticated_user),
    db: Session = Depends(get_db),
) -> Appointment:
    """Book a new appointment with strict timing + role-based field resolution.

    Body (``AppointmentCreate``):
        starts_at: ISO datetime with timezone. Must be on the hour, hour
            5..18, and in the future.
        client_id: Required when a non-client is booking. Ignored when a
            client is the caller (auto-set to ``current_user.id``).
        professional_id: Optional. For non-clients, defaults to caller.
        focus: Free text label (default "Personal training").
        notes: Free text.

    Auto-resolution:
      - Clients book with no ids: ``client_id = self``, ``professional_id``
        is the latest active ``user_relations`` row's professional.
      - Trainers/admins must specify ``client_id`` (and only book for
        themselves as the professional, unless admin).

    The endpoint enforces a 1-hour duration and rejects overlapping
    appointments for the same professional with 409. Always created as
    ``confirmed`` (no approval workflow).
    """
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

    ooo_conflict = db.scalar(
        select(TrainerUnavailability).where(
            TrainerUnavailability.professional_id == professional_id,
            TrainerUnavailability.starts_at < ends_at,
            TrainerUnavailability.ends_at > starts_at,
        )
    )
    if ooo_conflict:
        raise HTTPException(
            status_code=409,
            detail="The trainer is unavailable at that time.",
        )

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
    """Transition the appointment to a new status (used to cancel/confirm/complete).

    Path:
        appointment_id: The appointment to update.

    Body (``AppointmentStatusUpdate``):
        status: One of ``requested`` / ``confirmed`` / ``cancelled`` /
            ``completed``.

    Caller must be the appointment's client, its professional, or admin.
    No time-cutoff for cancellation — anyone with access can cancel any
    time before the start.
    """
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


# ---------------------------------------------------------------------------
# Out-of-office (trainer unavailability) endpoints
# ---------------------------------------------------------------------------


def _require_professional(actor: User) -> None:
    """Raise 403 unless ``actor`` can act as a professional (non-client role)."""
    if not actor_can_create_clients(actor):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only professionals can manage their out-of-office calendar.",
        )


@router.get("/unavailable/me", response_model=list[TrainerUnavailabilityRead])
def list_my_unavailability(
    current_user: User = Depends(get_authenticated_user),
    db: Session = Depends(get_db),
    starts_after: Annotated[datetime | None, Query()] = None,
    starts_before: Annotated[datetime | None, Query()] = None,
) -> list[TrainerUnavailability]:
    """Return the caller's own OOO blocks within an optional date window.

    Used by the trainer's calendar to render their OOO slots and let them
    remove individual ones. Professionals only — pure clients get 403.
    """
    _require_professional(current_user)

    stmt = select(TrainerUnavailability).where(
        TrainerUnavailability.professional_id == current_user.id,
    )
    if starts_after is not None:
        stmt = stmt.where(TrainerUnavailability.starts_at >= starts_after)
    if starts_before is not None:
        stmt = stmt.where(TrainerUnavailability.starts_at < starts_before)
    stmt = stmt.order_by(TrainerUnavailability.starts_at)
    return list(db.scalars(stmt))


@router.post(
    "/unavailable/",
    response_model=list[TrainerUnavailabilityRead],
    status_code=status.HTTP_201_CREATED,
)
def create_unavailability(
    payload: TrainerUnavailabilityCreate,
    current_user: User = Depends(get_authenticated_user),
    db: Session = Depends(get_db),
) -> list[TrainerUnavailability]:
    """Mark one or more slots as OOO in a single round-trip.

    Body (``TrainerUnavailabilityCreate``):
        starts_at: List of ISO datetimes (timezone-aware). Each becomes a
            1-hour block.

    Behavior:
      - Slots must be on the hour, hours 5..18, and in the future.
      - Slots that overlap an existing OOO block (or any active booking
        for the caller) are silently skipped — the response only includes
        rows that were actually created. This keeps multi-select tolerant
        of accidental duplicates.

    Professionals only. Returns the inserted rows.
    """
    _require_professional(current_user)

    now_utc = datetime.now(UTC)
    created: list[TrainerUnavailability] = []

    for starts_at in payload.starts_at:
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
                    f"Slots can only start between {SCHEDULE_OPEN_HOUR}:00 and "
                    f"{SCHEDULE_LAST_START_HOUR}:00."
                ),
            )
        if starts_at <= now_utc:
            raise HTTPException(status_code=400, detail="Cannot mark a past slot as OOO.")

        ends_at = starts_at + timedelta(hours=1)

        existing_ooo = db.scalar(
            select(TrainerUnavailability).where(
                TrainerUnavailability.professional_id == current_user.id,
                TrainerUnavailability.starts_at < ends_at,
                TrainerUnavailability.ends_at > starts_at,
            )
        )
        if existing_ooo is not None:
            continue

        booked = db.scalar(
            select(Appointment).where(
                Appointment.professional_id == current_user.id,
                Appointment.starts_at < ends_at,
                Appointment.ends_at > starts_at,
                Appointment.status != AppointmentStatus.cancelled,
            )
        )
        if booked is not None:
            continue

        row = TrainerUnavailability(
            professional_id=current_user.id,
            starts_at=starts_at,
            ends_at=ends_at,
        )
        db.add(row)
        created.append(row)

    if created:
        db.commit()
        for row in created:
            db.refresh(row)
    return created


@router.delete("/unavailable/{unavailability_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_unavailability(
    unavailability_id: int,
    current_user: User = Depends(get_authenticated_user),
    db: Session = Depends(get_db),
) -> None:
    """Delete a single OOO block.

    Caller must be the block's owner (its ``professional_id``) or admin.
    """
    row = db.get(TrainerUnavailability, unavailability_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Unavailability block not found.")

    if row.professional_id != current_user.id and not actor_is_admin(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't own this OOO block.",
        )

    db.delete(row)
    db.commit()
