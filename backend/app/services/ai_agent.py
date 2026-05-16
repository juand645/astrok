from app.schemas.appointment import AppointmentSuggestionRequest


class AIProvider:
    """Small boundary where a real model provider can be connected later."""

    def suggest_appointment_times(self, request: AppointmentSuggestionRequest) -> list[str]:
        preferred = ", ".join(request.preferred_days) or "weekdays"
        return [
            f"Next {preferred} at 7:00 AM",
            f"Next {preferred} at 6:00 PM",
            "Saturday at 9:00 AM",
        ]


ai_provider = AIProvider()
