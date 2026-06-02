"""Shared pytest fixtures for backend tests.

The env vars at the top MUST be set before any ``app.*`` import — pydantic-settings
caches the parsed ``Settings`` on first access, so the engine in ``app.core.database``
locks in whatever ``DATABASE_URL`` was visible at import time.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["DATABASE_SCHEMA"] = ""
os.environ["JWT_SECRET_KEY"] = "test-secret-do-not-use-in-prod-must-be-at-least-32-bytes"
os.environ["JWT_ALGORITHM"] = "HS256"
os.environ["ACCESS_TOKEN_EXPIRE_MINUTES"] = "60"
os.environ.setdefault("AI_API_KEY", "")
os.environ.setdefault("R2_ACCOUNT_ID", "")
os.environ.setdefault("R2_ACCESS_KEY_ID", "")
os.environ.setdefault("R2_SECRET_ACCESS_KEY", "")
os.environ.setdefault("R2_BUCKET", "")
os.environ.setdefault("R2_PUBLIC_URL", "")

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core import database as db_module
from app.core.security import hash_password
from app.main import app
from app.models.user import Role, User, UserRole


@pytest.fixture
def db() -> Session:
    """Yield a Session bound to an ephemeral in-memory SQLite engine.

    Each test gets a fresh database. ``StaticPool`` keeps the single connection
    alive across the test so the in-memory tables persist between calls.
    """
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    db_module.Base.metadata.create_all(engine)
    TestSession = sessionmaker(bind=engine, autocommit=False, autoflush=False)
    session = TestSession()
    try:
        yield session
    finally:
        session.close()
        db_module.Base.metadata.drop_all(engine)
        engine.dispose()


@pytest.fixture
def client(db: Session) -> TestClient:
    """TestClient with the production ``get_db`` swapped for the test session."""

    def _override() -> Session:
        try:
            yield db
        finally:
            pass

    app.dependency_overrides[db_module.get_db] = _override
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
def seed_roles(db: Session) -> dict[str, Role]:
    """Insert the canonical role rows the app expects to find."""
    role_names = ["client", "trainer", "admin"]
    for name in role_names:
        existing = db.scalar(select(Role).where(Role.name == name))
        if existing is None:
            db.add(Role(name=name, active=True))
    db.commit()
    return {role.name: role for role in db.scalars(select(Role)).all()}


def make_user(
    db: Session,
    *,
    username: str = "testuser",
    email: str | None = None,
    password: str = "Password123!",
    roles: tuple[str, ...] = ("trainer",),
    active: bool = True,
) -> User:
    """Insert a user (with hashed password + role assignments) and return it."""
    user = User(
        full_name="Test User",
        email=email or f"{username}@example.com",
        username=username,
        password_hash=hash_password(password),
        active=active,
        measures={},
    )
    db.add(user)
    db.flush()

    for role_name in roles:
        role = db.scalar(select(Role).where(Role.name == role_name))
        if role is None:
            role = Role(name=role_name, active=True)
            db.add(role)
            db.flush()
        db.add(UserRole(user_id=user.id, role_id=role.id))

    db.commit()
    db.refresh(user)
    return user


def auth_headers(client: TestClient, identifier: str, password: str) -> dict[str, str]:
    """Log in and return an Authorization header dict for the issued token."""
    response = client.post(
        "/api/auth/login",
        json={"identifier": identifier, "password": password},
    )
    assert response.status_code == 200, response.text
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
