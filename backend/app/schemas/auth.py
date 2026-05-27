from datetime import date

from pydantic import BaseModel, EmailStr, Field

from app.schemas.user import UserRead


class LoginRequest(BaseModel):
    identifier: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserRead


class ProfileUpdate(BaseModel):
    """Self-service profile update — username is intentionally not editable."""

    full_name: str | None = Field(default=None, min_length=1)
    email: EmailStr | None = None
    personal_number: str | None = None
    id_number: str | None = None
    birth_date: date | None = None
    description: str | None = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)
