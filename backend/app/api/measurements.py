from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.api.deps import assert_can_access_client, get_authenticated_user
from app.core.database import get_db
from app.models.client_measurement import ClientMeasurement
from app.models.user import User
from app.schemas.measurement import (
    MeasurementCreate,
    MeasurementRead,
    MeasurementSaveResponse,
)
from app.services.history import record_measurements

router = APIRouter()


@router.get("/clients/{client_id}/measurements", response_model=list[MeasurementRead])
def list_client_measurements(
    client_id: int,
    current_user: User = Depends(get_authenticated_user),
    db: Session = Depends(get_db),
) -> list[ClientMeasurement]:
    assert_can_access_client(db, current_user, client_id)

    return list(
        db.scalars(
            select(ClientMeasurement)
            .where(ClientMeasurement.client_id == client_id)
            .order_by(ClientMeasurement.recorded_at.desc())
        )
    )


@router.post(
    "/clients/{client_id}/measurements",
    response_model=MeasurementSaveResponse,
)
def create_client_measurement(
    client_id: int,
    payload: MeasurementCreate,
    current_user: User = Depends(get_authenticated_user),
    db: Session = Depends(get_db),
) -> MeasurementSaveResponse:
    assert_can_access_client(db, current_user, client_id)

    if not payload.measures and not payload.removed:
        raise HTTPException(
            status_code=400,
            detail="Provide at least one field in measures or removed.",
        )

    client = db.get(User, client_id)
    if client is None or not client.active:
        raise HTTPException(status_code=404, detail="Client not found.")

    entry: ClientMeasurement | None = None
    if payload.measures:
        entry = record_measurements(
            db,
            client=client,
            measures=payload.measures,
            recorded_by=current_user.id,
            notes=payload.notes,
            commit=False,
        )

    if payload.removed:
        cache = dict(client.measures or {})
        for key in payload.removed:
            cache.pop(key, None)
        client.measures = cache
        flag_modified(client, "measures")

    db.commit()
    if entry is not None:
        db.refresh(entry)
    db.refresh(client)

    return MeasurementSaveResponse(
        entry=MeasurementRead.model_validate(entry) if entry is not None else None,
        measures=client.measures or {},
    )
