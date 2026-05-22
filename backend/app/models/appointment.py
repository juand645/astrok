from datetime import datetime
from enum import StrEnum

from sqlalchemy import DateTime, Enum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class AppointmentStatus(StrEnum):
    requested = "requested"
    confirmed = "confirmed"
    cancelled = "cancelled"
    completed = "completed"


class Appointment(Base):
    __tablename__ = "appointments"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[AppointmentStatus] = mapped_column(
        Enum(AppointmentStatus, native_enum=False, length=40),
        default=AppointmentStatus.confirmed,
        nullable=False,
    )
    focus: Mapped[str] = mapped_column(String(120), default="Personal training", nullable=False)
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)

    client_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    professional_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)

    client = relationship("User", back_populates="client_appointments", foreign_keys=[client_id])
    professional = relationship(
        "User",
        back_populates="professional_appointments",
        foreign_keys=[professional_id],
    )
