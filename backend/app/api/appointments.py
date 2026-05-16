from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.appointment import Appointment, AppointmentStatus
from app.schemas.appointment import AppointmentCreate, AppointmentRead

router = APIRouter()


@router.get("/", response_model=list[AppointmentRead])
def list_appointments(db: Session = Depends(get_db)) -> list[Appointment]:
    return list(db.scalars(select(Appointment).order_by(Appointment.starts_at)))


@router.post("/", response_model=AppointmentRead, status_code=status.HTTP_201_CREATED)
def create_appointment(payload: AppointmentCreate, db: Session = Depends(get_db)) -> Appointment:
    if payload.ends_at <= payload.starts_at:
        raise HTTPException(status_code=400, detail="Appointment end must be after start.")

    conflict = db.scalar(
        select(Appointment).where(
            and_(
                Appointment.instructor_id == payload.instructor_id,
                Appointment.starts_at < payload.ends_at,
                Appointment.ends_at > payload.starts_at,
                or_(
                    Appointment.status == AppointmentStatus.requested,
                    Appointment.status == AppointmentStatus.confirmed,
                ),
            )
        )
    )
    if conflict:
        raise HTTPException(status_code=409, detail="Instructor already has an appointment then.")

    appointment = Appointment(**payload.model_dump())
    db.add(appointment)
    db.commit()
    db.refresh(appointment)
    return appointment
