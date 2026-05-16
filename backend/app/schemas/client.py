from datetime import date

from pydantic import BaseModel, EmailStr, Field


class ClientRead(BaseModel):
    id: int
    full_name: str
    email: EmailStr
    username: str
    description: str | None = None
    birth_date: date | None = None
    relation_type: str
    relation_description: str | None = None


class ClientUpdate(BaseModel):
    description: str | None = None


class ClientDetail(BaseModel):
    id: int
    full_name: str
    email: EmailStr
    username: str
    description: str | None = None
    birth_date: date | None = None
    measures: dict = Field(default_factory=dict)
    relation_type: str | None = None
    relation_description: str | None = None
