from collections.abc import Generator
import re

from sqlalchemy import MetaData, create_engine, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings

POSTGRES_IDENTIFIER_PATTERN = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")

is_sqlite = settings.database_url.startswith("sqlite")
is_postgres = settings.database_url.startswith(("postgresql", "postgres"))
database_schema = settings.database_schema if is_postgres else None

if database_schema and not POSTGRES_IDENTIFIER_PATTERN.match(database_schema):
    raise ValueError("DATABASE_SCHEMA must be a valid PostgreSQL identifier.")

connect_args = {"check_same_thread": False} if is_sqlite else {}

if database_schema:
    connect_args["options"] = f"-csearch_path={database_schema},public"

engine = create_engine(settings.database_url, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    metadata = MetaData(schema=database_schema)
    pass


def ensure_database_schema() -> None:
    """Create the configured PostgreSQL schema (e.g. `astrok`) if missing.

    Called once on application startup from `main.py`. No-ops when running
    against SQLite or when `DATABASE_SCHEMA` is not set.
    """
    if not database_schema:
        return

    with engine.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{database_schema}"'))


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency that yields a SQLAlchemy session and closes it after.

    Use as ``db: Session = Depends(get_db)`` in any endpoint that touches the DB.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
