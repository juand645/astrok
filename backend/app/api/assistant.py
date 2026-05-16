from fastapi import APIRouter

from app.schemas.appointment import AppointmentSuggestionRequest
from app.services.ai_agent import ai_provider

router = APIRouter()


@router.post("/appointment-suggestions")
def appointment_suggestions(payload: AppointmentSuggestionRequest) -> dict[str, list[str]]:
    return {"suggestions": ai_provider.suggest_appointment_times(payload)}
