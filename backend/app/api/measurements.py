from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import assert_can_access_client, get_authenticated_user
from app.core.database import get_db
from app.models.client_measurement import ClientMeasurement
from app.models.user import User
from app.schemas.measurement import MeasurementCreate, MeasurementRead
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
    response_model=MeasurementRead,
    status_code=status.HTTP_201_CREATED,
)
def create_client_measurement(
    client_id: int,
    payload: MeasurementCreate,
    current_user: User = Depends(get_authenticated_user),
    db: Session = Depends(get_db),
) -> ClientMeasurement:
    assert_can_access_client(db, current_user, client_id)

    if not payload.measures:
        raise HTTPException(status_code=400, detail="measures must contain at least one field.")

    client = db.get(User, client_id)
    if client is None or not client.active:
        raise HTTPException(status_code=404, detail="Client not found.")

    return record_measurements(
        db,
        client=client,
        measures=payload.measures,
        recorded_by=current_user.id,
        notes=payload.notes,
    )
