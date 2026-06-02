"""Unit tests for ``_normalize_database_url`` — the Railway/Heroku URL rewriter."""

from __future__ import annotations

import pytest

from app.core.database import _normalize_database_url


@pytest.mark.parametrize(
    ("given", "expected"),
    [
        # Bare postgresql:// → force psycopg 3 driver
        (
            "postgresql://user:pw@host:5432/db",
            "postgresql+psycopg://user:pw@host:5432/db",
        ),
        # Legacy postgres:// (Heroku-style) → also rewritten
        (
            "postgres://user:pw@host:5432/db",
            "postgresql+psycopg://user:pw@host:5432/db",
        ),
        # Already-qualified URLs pass through untouched
        (
            "postgresql+psycopg://user:pw@host:5432/db",
            "postgresql+psycopg://user:pw@host:5432/db",
        ),
        (
            "postgresql+psycopg2://user:pw@host:5432/db",
            "postgresql+psycopg2://user:pw@host:5432/db",
        ),
        # Non-postgres URLs are left alone
        ("sqlite:///./gym.db", "sqlite:///./gym.db"),
        ("sqlite:///:memory:", "sqlite:///:memory:"),
    ],
)
def test_normalize_database_url(given: str, expected: str) -> None:
    assert _normalize_database_url(given) == expected
