from datetime import datetime

from sqlalchemy import DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class TrainerUnavailability(Base):
    """One blocked time range during which a trainer is unavailable (OOO).

    A row equals a single hour-aligned slot in practice (the calendar grid
    creates one row per slot the trainer marks), but the schema allows any
    range so we can grow into multi-hour blocks later without migrating.
    Cascades on user delete.
    """

    __tablename__ = "trainer_unavailability"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    professional_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, nullable=False
    )
