from pydantic import BaseModel, EmailStr, Field

from app.models.user import RoleName


class UserCreate(BaseModel):
    full_name: str
    email: EmailStr
    username: str
    password: str = Field(min_length=8)
    role_names: list[RoleName] = Field(default_factory=lambda: [RoleName.client])


class UserRead(BaseModel):
    id: int
    full_name: str
    email: EmailStr
    username: str
    active: bool
    roles: list[str] = Field(default_factory=list)
    professional_id: int | None = None

    model_config = {"from_attributes": True}
