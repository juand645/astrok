from fastapi import APIRouter

from app.schemas.appointment import AppointmentSuggestionRequest
from app.services.ai_agent import ai_provider

router = APIRouter()


@router.post("/appointment-suggestions")
def appointment_suggestions(payload: AppointmentSuggestionRequest) -> dict[str, list[str]]:
    """Return a list of canned appointment-time suggestions.

    Body (``AppointmentSuggestionRequest``):
        client_id: For future personalization.
        professional_id: For future personalization.
        preferred_days: List of weekdays to bias against.
        goal: Free text describing the client's goal.

    Currently a stub — ``ai_agent.AIProvider.suggest_appointment_times``
    returns fixed strings. Hook a real model here when ready.
    """
    return {"suggestions": ai_provider.suggest_appointment_times(payload)}
