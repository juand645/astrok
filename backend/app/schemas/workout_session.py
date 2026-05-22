from datetime import date, datetime

from pydantic import BaseModel, Field


class WorkoutSessionInput(BaseModel):
    plan_id: int
    day_key: str = Field(min_length=1)
    performance: list[dict] = Field(default_factory=list)
    completed: bool = False
    rating: int | None = Field(default=None, ge=1, le=5)
    notes: str | None = None
    session_date: date | None = None


class WorkoutSessionRead(BaseModel):
    id: int
    plan_id: int
    client_id: int
    recorded_by: int | None
    day_key: str
    session_date: date
    completed: bool
    completed_at: datetime | None
    performance: list[dict]
    rating: int | None
    notes: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
