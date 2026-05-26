from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class CoachChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=40)


class DraftExercise(BaseModel):
    model_config = ConfigDict(extra="ignore")

    ejercicio: str
    repeticiones: int = Field(ge=0, le=99)
    peso: str = ""
    url_video: str = ""


class PlanDraft(BaseModel):
    model_config = ConfigDict(extra="ignore")

    title: str = Field(min_length=1)
    description: str | None = None
    content: dict[str, list[DraftExercise]] = Field(default_factory=dict)


class CoachChatResponse(BaseModel):
    message: ChatMessage
    plan: PlanDraft | None = None
    reason: str | None = None
