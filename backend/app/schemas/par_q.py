"""Schemas + constants for the PAR-Q (Physical Activity Readiness Questionnaire).

The 7 standard PAR-Q questions are bundled here (Spanish) so the backend
validation and the frontend form draw from the same source. The text is
stored inline with each response in the JSONB ``responses`` column so
historical answers remain self-contained even if wording changes later.
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


PAR_Q_QUESTIONS: tuple[dict[str, str], ...] = (
    {
        "id": "q1_heart_condition",
        "text": "¿Tu doctor te ha dicho alguna vez que tienes una condición cardiaca Y que solo deberías hacer actividad física recomendada por un médico?",
    },
    {
        "id": "q2_chest_pain_activity",
        "text": "¿Sientes dolor en el pecho cuando haces actividad física?",
    },
    {
        "id": "q3_chest_pain_rest",
        "text": "En el último mes, ¿has tenido dolor en el pecho cuando NO estabas haciendo actividad física?",
    },
    {
        "id": "q4_balance_or_consciousness",
        "text": "¿Pierdes el equilibrio debido a mareos o pierdes la consciencia alguna vez?",
    },
    {
        "id": "q5_bone_or_joint",
        "text": "¿Tienes algún problema óseo o articular (por ejemplo, espalda, rodilla o cadera) que pudiera empeorar con un cambio en tu actividad física?",
    },
    {
        "id": "q6_medication",
        "text": "¿Tu doctor te está recetando medicamentos actualmente (por ejemplo, diuréticos) para tu presión arterial o condición cardiaca?",
    },
    {
        "id": "q7_other_reason",
        "text": "¿Sabes de alguna otra razón por la que no deberías hacer actividad física?",
    },
)

PAR_Q_QUESTION_IDS: frozenset[str] = frozenset(q["id"] for q in PAR_Q_QUESTIONS)


class ParQAnswer(BaseModel):
    """One answered question, with the question text stored inline."""

    model_config = ConfigDict(extra="ignore")

    id: str
    text: str
    answer: Literal["yes", "no"]
    follow_up: str | None = None


class ParQResponseSubmit(BaseModel):
    """Client-submitted payload to complete a pending assessment."""

    answers: list[ParQAnswer] = Field(min_length=1)
    client_acknowledgement: str = Field(min_length=1)


class ParQAssessmentRead(BaseModel):
    """One assessment row in API responses (with or without responses filled)."""

    id: int
    client_id: int
    requested_by: int
    requested_at: datetime
    completed_at: datetime | None
    status: str
    responses: dict | None
    notes: str | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ParQQuestion(BaseModel):
    """A single question definition (used by the frontend to build the form)."""

    id: str
    text: str


def question_catalog() -> list[ParQQuestion]:
    """Return the canonical 7-question PAR-Q list."""
    return [ParQQuestion(**q) for q in PAR_Q_QUESTIONS]
