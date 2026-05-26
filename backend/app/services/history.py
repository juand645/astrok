"""Helpers that keep the 'current value' cache columns in sync with append-only
history tables. Each helper writes both inside a single transaction."""

from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.models.client_measurement import ClientMeasurement
from app.models.plan import Plan
from app.models.plan_version import PlanVersion
from app.models.user import User


def record_measurements(
    db: Session,
    *,
    client: User,
    measures: dict,
    recorded_by: int | None,
    notes: str | None = None,
    commit: bool = True,
) -> ClientMeasurement:
    """Append a measurement reading and shallow-merge it into users.measures.

    Merging (not overwriting) lets a trainer log a partial check-in (e.g. just
    weight) without wiping the rest of the cached snapshot.

    Args:
        db: Active SQLAlchemy session.
        client: The ORM ``User`` whose cache to update.
        measures: Dict of fields to record this reading (e.g. ``{"peso": 62}``).
            Becomes a row in ``client_measurements`` and is merged into
            ``users.measures``.
        recorded_by: User id of whoever is logging (trainer, the client, or
            admin). Stored on the history row for the audit trail.
        notes: Optional free text on the history row.
        commit: Pass ``False`` when this is part of a larger transaction
            (e.g., ``POST /api/clients/`` creates client + measurements +
            plans atomically). Default ``True`` commits immediately.

    Returns:
        The newly-inserted ``ClientMeasurement`` row.
    """
    entry = ClientMeasurement(
        client_id=client.id,
        measures=measures,
        recorded_by=recorded_by,
        notes=notes,
    )
    db.add(entry)

    merged = {**(client.measures or {}), **measures}
    client.measures = merged
    flag_modified(client, "measures")

    if commit:
        db.commit()
        db.refresh(entry)
    else:
        db.flush()
    return entry


def create_plan_with_initial_version(
    db: Session,
    *,
    client_id: int,
    professional_id: int,
    title: str,
    plan_type: str,
    content: dict,
    description: str | None,
    status: str,
    appointment_id: int | None,
    change_note: str | None,
    commit: bool = True,
) -> tuple[Plan, PlanVersion]:
    """Insert a new plan row + its version 1 snapshot in a single transaction.

    Args:
        db: Active SQLAlchemy session.
        client_id: User id of the plan's owner (client).
        professional_id: User id of the assigned trainer/coach.
        title: Plan name.
        plan_type: e.g. ``workout_routine``, ``nutrition_plan``.
        content: JSON map of ``dia_N`` → exercise list.
        description: Optional one-liner.
        status: ``draft`` / ``approved`` / ``archived``.
        appointment_id: Optional link to an appointment id.
        change_note: Free text persisted on version 1.
        commit: Pass ``False`` to defer commit when batching this with other
            writes (e.g., the "create client + initial plans" transaction).

    Returns:
        ``(plan, version)`` — both refreshed when ``commit=True``.
    """
    plan = Plan(
        client_id=client_id,
        professional_id=professional_id,
        appointment_id=appointment_id,
        plan_type=plan_type,
        title=title,
        content=content,
        description=description,
        status=status,
    )
    db.add(plan)
    db.flush()  # populate plan.id without committing

    version = PlanVersion(
        plan_id=plan.id,
        version=1,
        content=content,
        status=status,
        description=description,
        changed_by=professional_id,
        change_note=change_note or "Initial version",
    )
    db.add(version)

    if commit:
        db.commit()
        db.refresh(plan)
        db.refresh(version)
    else:
        db.flush()
    return plan, version


def save_plan_version(
    db: Session,
    *,
    plan: Plan,
    content: dict,
    status: str,
    description: str | None,
    changed_by: int | None,
    change_note: str | None,
) -> PlanVersion:
    """Update a plan's current snapshot and append a new version row.

    Args:
        db: Active session.
        plan: The ORM ``Plan`` to mutate. Its ``content``, ``status``,
            ``description``, and ``updated_at`` are updated in place.
        content: New JSON content (overwrites ``plan.content``).
        status: New status (overwrites ``plan.status``).
        description: New description; pass through ``None`` to clear.
        changed_by: User id of whoever made the change (stored on the
            version row, NULL allowed).
        change_note: Free text persisted on the version row.

    Returns:
        The newly-inserted ``PlanVersion`` (refreshed). Version number is
        the previous max+1 for this plan.
    """
    last_version = (
        db.scalar(select(func.max(PlanVersion.version)).where(PlanVersion.plan_id == plan.id)) or 0
    )

    version = PlanVersion(
        plan_id=plan.id,
        version=last_version + 1,
        content=content,
        status=status,
        description=description,
        changed_by=changed_by,
        change_note=change_note,
    )
    db.add(version)

    plan.content = content
    plan.status = status
    plan.description = description
    plan.updated_at = datetime.now(UTC)
    flag_modified(plan, "content")

    db.commit()
    db.refresh(version)
    return version
