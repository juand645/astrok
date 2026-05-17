from datetime import datetime

from pydantic import BaseModel, Field


class MeasurementCreate(BaseModel):
    measures: dict = Field(default_factory=dict)
    removed: list[str] = Field(default_factory=list)
    notes: str | None = None


class MeasurementRead(BaseModel):
    id: int
    client_id: int
    recorded_by: int | None
    recorded_at: datetime
    measures: dict
    notes: str | None = None

    model_config = {"from_attributes": True}


class MeasurementSaveResponse(BaseModel):
    entry: MeasurementRead | None = None
    measures: dict
