from datetime import datetime

from pydantic import BaseModel

from app.models.appointment import AppointmentStatus


class AppointmentCreate(BaseModel):
    starts_at: datetime
    client_id: int | None = None
    professional_id: int | None = None
    focus: str = "Personal training"
    notes: str | None = None


class AppointmentRead(BaseModel):
    id: int
    starts_at: datetime
    ends_at: datetime
    status: AppointmentStatus
    focus: str
    notes: str | None
    client_id: int
    professional_id: int

    model_config = {"from_attributes": True}


class AppointmentStatusUpdate(BaseModel):
    status: AppointmentStatus


class AvailabilitySlot(BaseModel):
    starts_at: datetime
    ends_at: datetime
