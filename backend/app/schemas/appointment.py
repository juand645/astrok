from datetime import datetime

from pydantic import BaseModel, Field

from app.models.appointment import AppointmentStatus


class AppointmentBase(BaseModel):
    starts_at: datetime
    ends_at: datetime
    focus: str = "Personal training"
    notes: str | None = None


class AppointmentCreate(AppointmentBase):
    client_id: int
    instructor_id: int


class AppointmentRead(AppointmentBase):
    id: int
    status: AppointmentStatus
    client_id: int
    instructor_id: int

    model_config = {"from_attributes": True}


class AppointmentSuggestionRequest(BaseModel):
    client_id: int
    instructor_id: int
    preferred_days: list[str] = Field(default_factory=list)
    goal: str
