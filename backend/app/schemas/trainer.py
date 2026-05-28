from datetime import date

from pydantic import BaseModel, EmailStr, Field


class TrainerCreate(BaseModel):
    full_name: str = Field(min_length=1)
    email: EmailStr
    username: str = Field(min_length=1)
    password: str = Field(min_length=8)
    personal_number: str | None = None
    id_number: str | None = None
    birth_date: date | None = None
    description: str | None = None


class TrainerUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1)
    email: EmailStr | None = None
    personal_number: str | None = None
    id_number: str | None = None
    birth_date: date | None = None
    description: str | None = None
    active: bool | None = None


class TrainerRead(BaseModel):
    id: int
    full_name: str
    email: EmailStr
    username: str
    personal_number: str | None = None
    id_number: str | None = None
    birth_date: date | None = None
    description: str | None = None
    active: bool
    active_client_count: int = 0


class TrainerClientSummary(BaseModel):
    id: int
    full_name: str
    username: str
    email: EmailStr


class TrainerDetail(TrainerRead):
    clients: list[TrainerClientSummary] = Field(default_factory=list)
