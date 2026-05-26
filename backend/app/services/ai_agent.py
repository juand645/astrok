from app.schemas.appointment import AppointmentSuggestionRequest


class AIProvider:
    """Small boundary where a real model provider can be connected later."""

    def suggest_appointment_times(self, request: AppointmentSuggestionRequest) -> list[str]:
        """Return canned appointment-time suggestions (stub, no LLM call).

        Args:
            request: Carries client_id, professional_id, preferred_days,
                and the client's goal — currently used only to format the
                first two suggestion strings.

        Returns:
            A short list of human-readable suggestion strings. Replace
            this with a real planner when ready.
        """
        preferred = ", ".join(request.preferred_days) or "weekdays"
        return [
            f"Next {preferred} at 7:00 AM",
            f"Next {preferred} at 6:00 PM",
            "Saturday at 9:00 AM",
        ]


ai_provider = AIProvider()
