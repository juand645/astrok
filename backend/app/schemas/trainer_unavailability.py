from datetime import datetime

from pydantic import BaseModel, Field


class TrainerUnavailabilityCreate(BaseModel):
    """Trainer marks one or more slots as out-of-office in a single call.

    Each item in ``starts_at`` becomes a 1-hour OOO row aligned to the slot
    grid. The endpoint computes ``ends_at = starts_at + 1 hour`` server-side.
    """

    starts_at: list[datetime] = Field(min_length=1, max_length=100)


class TrainerUnavailabilityRead(BaseModel):
    id: int
    starts_at: datetime
    ends_at: datetime

    model_config = {"from_attributes": True}
