from datetime import datetime

from pydantic import BaseModel, Field


class MeasurementCreate(BaseModel):
    measures: dict = Field(default_factory=dict)
    notes: str | None = None


class MeasurementRead(BaseModel):
    id: int
    client_id: int
    recorded_by: int | None
    recorded_at: datetime
    measures: dict
    notes: str | None = None

    model_config = {"from_attributes": True}
