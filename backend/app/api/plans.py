from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import actor_is_admin, assert_can_access_client, get_authenticated_user
from app.core.database import get_db
from app.models.plan import Plan
from app.models.plan_version import PlanVersion
from app.models.user import User
from app.schemas.plan import PlanCreate, PlanRead, PlanUpdate, PlanVersionRead
from app.services.history import create_plan_with_initial_version, save_plan_version

router = APIRouter()


@router.post("/", response_model=PlanRead, status_code=status.HTTP_201_CREATED)
def create_plan(
    payload: PlanCreate,
    current_user: User = Depends(get_authenticated_user),
    db: Session = Depends(get_db),
) -> Plan:
    """Create a plan and its initial version-1 snapshot atomically.

    Body (``PlanCreate``):
        client_id: Target client. Caller must have access via
            ``assert_can_access_client``.
        title: Plan name.
        plan_type: e.g. ``workout_routine``.
        content: JSON map of ``dia_N`` keys to exercise arrays.
        description: Optional one-line summary.
        status: ``draft`` / ``approved`` / ``archived``.
        appointment_id: Optional link to an appointment.
        change_note: Free text recorded on version 1.

    Caller becomes the plan's ``professional_id``. Raises 400 if the
    caller would be both client AND professional on the same plan.
    """
    assert_can_access_client(db, current_user, payload.client_id)

    if payload.client_id == current_user.id:
        raise HTTPException(
            status_code=400,
            detail="A plan must have a professional that is different from the client.",
        )

    client = db.get(User, payload.client_id)
    if client is None or not client.active:
        raise HTTPException(status_code=404, detail="Client not found.")

    plan, _ = create_plan_with_initial_version(
        db,
        client_id=payload.client_id,
        professional_id=current_user.id,
        title=payload.title,
        plan_type=payload.plan_type,
        content=payload.content,
        description=payload.description,
        status=payload.status,
        appointment_id=payload.appointment_id,
        change_note=payload.change_note,
    )
    return plan


@router.patch("/{plan_id}", response_model=PlanRead)
def update_plan(
    plan_id: int,
    payload: PlanUpdate,
    current_user: User = Depends(get_authenticated_user),
    db: Session = Depends(get_db),
) -> Plan:
    """Update mutable fields on a plan and write a new version snapshot.

    Path:
        plan_id: Target plan.

    Body (``PlanUpdate``) — any subset:
        title: New plan name (updated on the cache row; not snapshotted in
            ``plan_versions``).
        content: New exercise content.
        status, description: Updated and snapshotted into the new version.
        change_note: Free text recorded on the new version row.

    Authorization: caller must be the plan's client, its professional, or
    an admin. Every successful call increments ``plan_versions.version``.
    """
    plan = db.get(Plan, plan_id)
    if plan is None:
        raise HTTPException(status_code=404, detail="Plan not found.")

    if (
        current_user.id not in (plan.client_id, plan.professional_id)
        and not actor_is_admin(current_user)
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this plan.",
        )

    if payload.title is not None:
        plan.title = payload.title

    save_plan_version(
        db,
        plan=plan,
        content=payload.content if payload.content is not None else plan.content,
        status=payload.status if payload.status is not None else plan.status,
        description=payload.description if payload.description is not None else plan.description,
        changed_by=current_user.id,
        change_note=payload.change_note,
    )
    return plan


@router.delete("/{plan_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_plan(
    plan_id: int,
    current_user: User = Depends(get_authenticated_user),
    db: Session = Depends(get_db),
) -> None:
    """Soft-delete a plan by flipping ``active`` to false.

    Path:
        plan_id: The plan to remove.

    Only the plan's ``professional_id`` (or an admin) may delete. Clients
    cannot delete their own plans. ``plan_versions`` and ``workout_sessions``
    rows are preserved since the plan row itself is kept. Returns 204.
    """
    plan = db.get(Plan, plan_id)
    if plan is None or not plan.active:
        raise HTTPException(status_code=404, detail="Plan not found.")

    if (
        current_user.id != plan.professional_id
        and not actor_is_admin(current_user)
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the assigned professional or an admin can delete this plan.",
        )

    plan.active = False
    plan.updated_at = datetime.now(UTC)
    db.commit()


@router.get("/{plan_id}/versions", response_model=list[PlanVersionRead])
def list_plan_versions(
    plan_id: int,
    current_user: User = Depends(get_authenticated_user),
    db: Session = Depends(get_db),
) -> list[PlanVersion]:
    """Return the version history for a plan, newest first.

    Path:
        plan_id: The plan whose history to fetch.

    Caller must be the plan's client, its professional, or admin.
    """
    plan = db.get(Plan, plan_id)
    if plan is None:
        raise HTTPException(status_code=404, detail="Plan not found.")

    if (
        current_user.id not in (plan.client_id, plan.professional_id)
        and not actor_is_admin(current_user)
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this plan.",
        )

    return list(
        db.scalars(
            select(PlanVersion)
            .where(PlanVersion.plan_id == plan_id)
            .order_by(PlanVersion.version.desc())
        )
    )
