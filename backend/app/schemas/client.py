from datetime import date

from pydantic import BaseModel, EmailStr, Field


class NewPlanInput(BaseModel):
    title: str = Field(min_length=1)
    plan_type: str = "workout_routine"
    status: str = "draft"
    description: str | None = None
    content: dict = Field(default_factory=dict)


class ClientCreate(BaseModel):
    full_name: str = Field(min_length=1)
    email: EmailStr
    username: str = Field(min_length=1)
    password: str = Field(min_length=8)
    personal_number: str | None = None
    id_number: str | None = None
    birth_date: date | None = None
    description: str | None = None
    measures: dict = Field(default_factory=dict)
    relation_description: str | None = None
    plans: list[NewPlanInput] = Field(default_factory=list)


class ClientRead(BaseModel):
    id: int
    full_name: str
    email: EmailStr
    username: str
    personal_number: str | None = None
    id_number: str | None = None
    description: str | None = None
    birth_date: date | None = None
    active: bool = True
    relation_type: str
    relation_description: str | None = None
    professional_id: int | None = None
    professional_name: str | None = None


class ClientUpdate(BaseModel):
    personal_number: str | None = None
    id_number: str | None = None
    description: str | None = None
    relation_description: str | None = None
    active: bool | None = None


class ClientTransfer(BaseModel):
    new_professional_id: int
    note: str | None = None


class ClientDetail(BaseModel):
    id: int
    full_name: str
    email: EmailStr
    username: str
    personal_number: str | None = None
    id_number: str | None = None
    description: str | None = None
    birth_date: date | None = None
    active: bool = True
    measures: dict = Field(default_factory=dict)
    relation_type: str | None = None
    relation_description: str | None = None
