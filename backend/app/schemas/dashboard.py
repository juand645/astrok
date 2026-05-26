from datetime import datetime

from pydantic import BaseModel

from app.models.appointment import AppointmentStatus


class DashboardStats(BaseModel):
    active_clients: int
    active_plans: int
    sessions_this_week: int
    appointments_this_week: int


class DashboardAppointment(BaseModel):
    id: int
    starts_at: datetime
    ends_at: datetime
    status: AppointmentStatus
    focus: str
    client_id: int
    client_name: str
    client_username: str


class DashboardDraftPlan(BaseModel):
    id: int
    title: str
    updated_at: datetime
    client_id: int
    client_name: str


class DashboardParQAlert(BaseModel):
    assessment_id: int
    completed_at: datetime | None
    client_id: int
    client_name: str


class TrainerDashboard(BaseModel):
    stats: DashboardStats
    upcoming_appointments: list[DashboardAppointment]
    draft_plans: list[DashboardDraftPlan]
    par_q_alerts: list[DashboardParQAlert]
