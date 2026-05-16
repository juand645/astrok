from datetime import datetime

from pydantic import BaseModel, Field


class PlanCreate(BaseModel):
    client_id: int
    title: str
    plan_type: str = "workout_routine"
    content: dict = Field(default_factory=dict)
    description: str | None = None
    status: str = "draft"
    appointment_id: int | None = None
    change_note: str | None = None


class PlanUpdate(BaseModel):
    content: dict | None = None
    status: str | None = None
    description: str | None = None
    title: str | None = None
    change_note: str | None = None


class PlanRead(BaseModel):
    id: int
    client_id: int
    professional_id: int
    appointment_id: int | None
    plan_type: str
    title: str
    content: dict
    status: str
    description: str | None = None
    active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PlanVersionRead(BaseModel):
    id: int
    plan_id: int
    version: int
    content: dict
    status: str
    description: str | None = None
    changed_by: int | None
    changed_at: datetime
    change_note: str | None = None

    model_config = {"from_attributes": True}
