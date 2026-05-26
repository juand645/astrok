"""LLM-backed plan-design assistant.

A multi-turn chat focused on health, exercise, and nutrition. When the trainer
asks for a plan (or both reach agreement on one), the assistant emits a JSON
block describing the plan, which the UI offers to apply via POST /api/plans/.
The assistant's conversational text is returned with the JSON block stripped
out so the chat stays clean.
"""

from __future__ import annotations

import json
import re
from datetime import date
from typing import Any

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.plan import Plan
from app.models.user import User
from app.schemas.plan_coach import ChatMessage, PlanDraft

PLAN_BLOCK_RE = re.compile(r"```plan\s*(.*?)\s*```", re.DOTALL)

LANGUAGE_LABELS = {
    "es": "Spanish",
    "en": "English",
}

SYSTEM_PROMPT_TEMPLATE = """\
You are a knowledgeable, warm fitness, exercise, and nutrition coach helping a
gym professional design a training plan for one of their clients. Use the
client context below to inform suggestions when the trainer does not override
the value in conversation. Never invent data not provided here.

CLIENT CONTEXT
{client_context}

LANGUAGE
Respond in {language_name} by default. If the trainer writes in another
language, mirror it.

TOPIC SCOPE
- IN SCOPE: training design, exercise selection and mechanics, sets/reps/load,
  periodization, nutrition for performance and body composition, hydration,
  recovery, sleep, motivation for adherence, injury prevention through
  technique, and stress management as it relates to training.
- OUT OF SCOPE: general life advice, news, technology, sports statistics,
  philosophy, religion, unrelated personal topics, anything not directly tied
  to the client's health and training plan.
- If the trainer asks something out of scope, politely redirect with a short
  refusal and a question that brings the conversation back to the plan.

MEDICAL SAFETY
If the trainer mentions an injury, surgery, medication, pregnancy, or medical
condition, recommend deferring to a qualified medical professional. You can
still suggest general low-risk movements but be explicit about the limit.

PLAN OUTPUT FORMAT
When the trainer asks for the plan (or both of you reach a clear agreement
on what it should be), include a JSON block at the END of your message,
fenced with three backticks and the word "plan", like this:

```plan
{{
  "title": "Concise plan name",
  "description": "One-line summary",
  "content": {{
    "dia_1": [
      {{ "ejercicio": "Press de banca", "repeticiones": 5, "peso": "70kg", "url_video": "" }}
    ],
    "dia_2": [ ... ]
  }}
}}
```

Rules for the JSON block:
- `title` is short (under 80 chars).
- `description` is one sentence.
- `content` uses keys `dia_1`, `dia_2`, ... matching the training days.
- Each day is an array of exercises. Each exercise has `ejercicio` (name),
  `repeticiones` (integer 0-99), `peso` (string like "70kg", "N/A", or
  "Corporal"), and `url_video` (string, may be empty).
- Only emit the JSON when you have enough information. Do not emit
  incomplete plans. If you need more details, ask first.
- Outside the JSON block, write a normal conversational reply.

Be specific. Cite the client's profile when relevant. Never invent
measurements or history not provided to you.
"""


def chat(
    *,
    messages: list[ChatMessage],
    client: User,
    db: Session,
    api_key: str,
    model: str,
    language: str = "es",
) -> tuple[str, PlanDraft | None]:
    """Send the conversation to the LLM and parse the response.

    Returns the visible assistant text (with the plan JSON stripped) and an
    optional PlanDraft when the assistant emitted a valid plan block.

    Args:
        messages: Full conversation so far. Stateless — every turn re-sends
            the whole list (no DB persistence of chats).
        client: The user the conversation is about. Profile data + the
            most recent active plan get inlined into the system prompt.
        db: Used to fetch the client's plans for the context block.
        api_key: Anthropic API key.
        model: Model id (typically the same as the session-coach model).
        language: ``es`` or ``en`` — drives the language directive in the
            system prompt.

    Returns:
        ``(visible_text, plan_or_None)``. ``visible_text`` is the
        conversational reply with any ```plan ...``` block removed.
        The plan is only non-None when a fenced block was present and
        validated against ``PlanDraft``.
    """
    import anthropic

    anthropic_client = anthropic.Anthropic(api_key=api_key)
    client_context = _format_client_context(client, db)
    language_name = LANGUAGE_LABELS.get(language, "Spanish")
    system_prompt = SYSTEM_PROMPT_TEMPLATE.format(
        client_context=client_context,
        language_name=language_name,
    )

    response = anthropic_client.messages.create(
        model=model,
        max_tokens=1500,
        system=system_prompt,
        messages=[{"role": m.role, "content": m.content} for m in messages],
    )

    raw_text = "".join(
        getattr(block, "text", "") for block in response.content if getattr(block, "type", "") == "text"
    ).strip()

    plan = _extract_plan(raw_text)
    visible_text = PLAN_BLOCK_RE.sub("", raw_text).strip()
    return visible_text, plan


def _extract_plan(text: str) -> PlanDraft | None:
    """Find a ```plan ...``` block in the assistant text and validate it.

    Returns the parsed ``PlanDraft`` or ``None`` if no block exists, the
    JSON is malformed, or it fails Pydantic validation (e.g., missing
    title, bad shape). Caller gets a clean "no plan emitted this turn"
    rather than a crash.
    """
    match = PLAN_BLOCK_RE.search(text)
    if not match:
        return None
    try:
        data = json.loads(match.group(1))
    except json.JSONDecodeError:
        return None
    try:
        return PlanDraft.model_validate(data)
    except ValidationError:
        return None


def _format_client_context(client: User, db: Session) -> str:
    """Render the client profile + active plans block for the system prompt.

    Includes name, age (derived from birth_date), weight/height (from the
    ``measures`` cache), goal/notes, a list of active plans, AND a fully
    rendered "MOST RECENT PLAN" section with each day's exercises — so the
    LLM can build a progression or intentional variation.
    """
    name = client.full_name or client.username
    age = _compute_age(client.birth_date)
    measures = client.measures or {}
    weight = measures.get("peso")
    height = measures.get("altura")

    active_plans = list(
        db.scalars(
            select(Plan)
            .where(Plan.client_id == client.id, Plan.active.is_(True))
            .order_by(Plan.updated_at.desc())
            .limit(5)
        )
    )

    lines: list[str] = [f"- Name: {name}"]
    if age is not None:
        lines.append(f"- Age: {age} years")
    if weight is not None:
        lines.append(f"- Weight: {weight} kg")
    if height is not None:
        lines.append(f"- Height: {height} cm")
    if client.description:
        lines.append(f"- Notes / goal: {client.description}")

    if active_plans:
        plan_summaries = [
            f"  - {p.title} (status: {p.status}, days: {', '.join(sorted((p.content or {}).keys())) or 'none'})"
            for p in active_plans
        ]
        lines.append("- Active plans:")
        lines.extend(plan_summaries)

        latest = active_plans[0]
        lines.append("")
        lines.append("MOST RECENT PLAN (use as reference for progression or variation):")
        lines.append(f"  Title: {latest.title}")
        if latest.description:
            lines.append(f"  Description: {latest.description}")
        lines.append(f"  Status: {latest.status}")
        body = _format_plan_content(latest.content)
        if body:
            lines.append("  Exercises:")
            lines.extend(f"    {line}" for line in body)
        else:
            lines.append("  Exercises: (none recorded)")
    else:
        lines.append("- Active plans: none yet")

    return "\n".join(lines)


def _format_plan_content(content: Any) -> list[str]:
    """Render a plan's content JSON as compact readable lines.

    Output is one line per ``dia_N`` like:
        ``dia_1: Press de banca 5x70kg, Sentadilla 4x80kg``
    Defensive: returns an empty list if the structure is missing/malformed,
    skips non-dict exercise entries, and emits ``(empty)`` for days with
    zero exercises.
    """
    if not isinstance(content, dict) or not content:
        return []

    rendered: list[str] = []
    for day_key in sorted(content.keys()):
        exercises = content.get(day_key)
        if not isinstance(exercises, list) or not exercises:
            rendered.append(f"{day_key}: (empty)")
            continue
        items: list[str] = []
        for entry in exercises:
            if not isinstance(entry, dict):
                continue
            ejercicio = str(entry.get("ejercicio", "")).strip() or "?"
            reps = entry.get("repeticiones")
            peso = str(entry.get("peso", "")).strip() or "N/A"
            if isinstance(reps, (int, float)) and reps:
                items.append(f"{ejercicio} {int(reps)}x{peso}")
            else:
                items.append(f"{ejercicio} ({peso})")
        rendered.append(f"{day_key}: {', '.join(items) if items else '(empty)'}")
    return rendered


def _compute_age(birth: date | None) -> int | None:
    """Years-old from a birth date, accounting for whether the birthday has passed."""
    if not birth:
        return None
    today = date.today()
    return today.year - birth.year - ((today.month, today.day) < (birth.month, birth.day))


def plan_draft_to_plan_payload(draft: PlanDraft) -> dict[str, Any]:
    """Convert a PlanDraft to the body POST /api/plans/ expects.

    Flattens each ``DraftExercise`` to a plain dict, drops the Pydantic
    wrapper. ``status`` defaults to ``"draft"`` on the receiving endpoint,
    so it's not included here. Currently unused — the frontend calls
    ``createPlan`` directly with the draft's fields.
    """
    content: dict[str, list[dict[str, Any]]] = {}
    for day_key, exercises in draft.content.items():
        content[day_key] = [
            {
                "ejercicio": e.ejercicio,
                "repeticiones": e.repeticiones,
                "peso": e.peso,
                "url_video": e.url_video,
            }
            for e in exercises
        ]
    return {
        "title": draft.title,
        "description": draft.description,
        "content": content,
    }
