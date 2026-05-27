from datetime import date

from pydantic import BaseModel, EmailStr, Field

from app.models.user import RoleName


class UserCreate(BaseModel):
    full_name: str
    email: EmailStr
    username: str
    password: str = Field(min_length=8)
    personal_number: str | None = None
    id_number: str | None = None
    role_names: list[RoleName] = Field(default_factory=lambda: [RoleName.client])


class UserRead(BaseModel):
    id: int
    full_name: str
    email: EmailStr
    username: str
    personal_number: str | None = None
    id_number: str | None = None
    birth_date: date | None = None
    description: str | None = None
    active: bool
    roles: list[str] = Field(default_factory=list)
    professional_id: int | None = None

    model_config = {"from_attributes": True}


class UserSummary(BaseModel):
    """Slim user shape for pickers (trainer transfer dropdown, etc.)."""

    id: int
    full_name: str
    username: str
    roles: list[str] = Field(default_factory=list)
