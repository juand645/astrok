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

    Pass ``commit=False`` when calling from inside a larger transaction.
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
    """Create a plan and its version 1 snapshot atomically.

    Pass ``commit=False`` when calling from inside a larger transaction.
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
    """Update a plan's current snapshot and append a new version row."""
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
