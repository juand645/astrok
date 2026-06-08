"""Pydantic schemas for the /api/gyms endpoints."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class GymAdminBootstrap(BaseModel):
    """Initial admin to create alongside a new gym.

    The new gym is otherwise unreachable until at least one user with the
    ``admin`` role exists inside it — there's no way to log in. This bundle
    is required (not optional) for that reason.
    """

    full_name: str = Field(min_length=1, max_length=160)
    email: EmailStr
    username: str = Field(min_length=1, max_length=160)
    password: str = Field(min_length=8)


class GymCreate(BaseModel):
    """Payload for POST /api/gyms/. Includes the bootstrap admin in one shot."""

    slug: str = Field(
        min_length=2,
        max_length=60,
        pattern=r"^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$",
        description="URL-safe handle. Lowercase letters, digits, hyphens; cannot start or end with a hyphen.",
    )
    name: str = Field(min_length=1, max_length=160)
    brand_color: str | None = Field(default=None, max_length=20)
    logo_url: str | None = None
    admin: GymAdminBootstrap


class GymUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    brand_color: str | None = Field(default=None, max_length=20)
    logo_url: str | None = None
    active: bool | None = None


class GymRead(BaseModel):
    id: int
    slug: str
    name: str
    brand_color: str | None
    logo_url: str | None
    active: bool

    model_config = ConfigDict(from_attributes=True)
