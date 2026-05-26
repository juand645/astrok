"""LLM-backed coach message generation.

The session-save flow precomputes structured "facts" about how the client did
compared to last week and the prescribed plan, then asks an LLM to write a
short, warm, evidence-based message. The LLM is forbidden from inventing
numbers — all comparisons are done in Python before the prompt is built.
"""

from __future__ import annotations

import json
from datetime import date
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.plan import Plan
from app.models.user import User
from app.models.workout_session import WorkoutSession

SYSTEM_PROMPT_TEMPLATE = (
    "You are a warm, evidence-based fitness coach speaking directly to your "
    "client. They just completed a workout. Use ONLY the facts provided in "
    "the user message — never invent numbers, exercises, or context. Cite at "
    "least one specific number from the data. Acknowledge effort, comment on "
    "progress (if it dipped, mention it gently and constructively), and "
    "finish with one concrete tip for the next session. Keep it between 50 "
    "and 90 words. Address the client by their first name. No emojis. No "
    "medical advice. Respond in {language_name}."
)

LANGUAGE_LABELS = {
    "es": "Spanish",
    "en": "English",
}


def compute_session_insights(
    session: WorkoutSession,
    plan: Plan,
    client: User,
    db: Session,
) -> dict[str, Any]:
    """Build the fact pack that gets handed to the LLM.

    All arithmetic (percent changes, hit rates, streaks) is done HERE in
    Python — the LLM only writes prose around these pre-computed numbers,
    never re-computes them.

    Args:
        session: The session that was just completed.
        plan: The plan this session belongs to (for the prescribed values).
        client: The owner — name, age, cached measures, goal.
        db: Used to look up the previous session + completed count.

    Returns:
        A dict that gets JSON-serialized into the LLM user prompt. Keys:
        ``client``, ``session``, ``vs_last_session``, ``vs_prescribed``,
        ``history``.
    """
    previous = _previous_session(db, session)
    prescribed_day = (plan.content or {}).get(session.day_key, [])

    vs_last_week = _compare_against_previous(session.performance, previous)
    vs_prescribed = _compare_against_prescribed(session.performance, prescribed_day)

    measures = client.measures or {}

    return {
        "client": {
            "name": (client.full_name or "").split()[0] or client.username,
            "age": _compute_age(client.birth_date),
            "weight_kg": _coerce_number(measures.get("peso")),
            "height_cm": _coerce_number(measures.get("altura")),
            "goal": client.description,
        },
        "session": {
            "day": session.day_key,
            "plan_title": plan.title,
            "rating_out_of_5": session.rating,
            "notes": session.notes,
            "date": session.session_date.isoformat()
            if isinstance(session.session_date, date)
            else None,
        },
        "vs_last_session": vs_last_week,
        "vs_prescribed": vs_prescribed,
        "history": {
            "total_completed_sessions_this_day": _completed_count_for_day(db, session),
            "is_first_completed_session_for_day": previous is None,
        },
    }


def _previous_session(db: Session, session: WorkoutSession) -> WorkoutSession | None:
    """Most recent completed session for the same (plan, day_key), excluding this one."""
    return db.scalar(
        select(WorkoutSession)
        .where(
            WorkoutSession.plan_id == session.plan_id,
            WorkoutSession.day_key == session.day_key,
            WorkoutSession.id != session.id,
            WorkoutSession.completed.is_(True),
        )
        .order_by(
            WorkoutSession.session_date.desc(),
            WorkoutSession.id.desc(),
        )
        .limit(1)
    )


def _completed_count_for_day(db: Session, session: WorkoutSession) -> int:
    """Count completed sessions for this plan + day_key (history is capped at 2)."""
    count = db.scalar(
        select(func.count())
        .select_from(WorkoutSession)
        .where(
            WorkoutSession.plan_id == session.plan_id,
            WorkoutSession.day_key == session.day_key,
            WorkoutSession.completed.is_(True),
        )
    )
    return int(count or 0)


def _compare_against_previous(
    current: list[dict] | None,
    previous: WorkoutSession | None,
) -> list[dict[str, Any]]:
    """Per-exercise diff vs. last session: weight % change, volume % change, or rep delta.

    Matches exercises by name (case-insensitive). Skips exercises that
    didn't exist last time. ``weight_change_pct`` / ``volume_change_pct``
    only included when both pesos parse as numeric.
    """
    if not previous or not previous.performance or not current:
        return []

    rows: list[dict[str, Any]] = []
    for entry in current:
        ejercicio = (entry.get("ejercicio") or "").strip()
        if not ejercicio:
            continue
        match = next(
            (
                e
                for e in previous.performance
                if (e.get("ejercicio") or "").strip().lower() == ejercicio.lower()
            ),
            None,
        )
        if not match:
            continue

        now_peso = _parse_peso(entry.get("peso"))
        last_peso = _parse_peso(match.get("peso"))
        now_reps = _coerce_int(entry.get("repeticiones"))
        last_reps = _coerce_int(match.get("repeticiones"))

        row: dict[str, Any] = {
            "exercise": ejercicio,
            "previous": f"{match.get('peso')} x {last_reps}",
            "today": f"{entry.get('peso')} x {now_reps}",
        }
        if now_peso is not None and last_peso is not None and last_peso > 0:
            row["weight_change_pct"] = round((now_peso - last_peso) / last_peso * 100, 1)
            now_vol = now_peso * max(now_reps, 0)
            last_vol = last_peso * max(last_reps, 0)
            if last_vol > 0:
                row["volume_change_pct"] = round((now_vol - last_vol) / last_vol * 100, 1)
        elif now_reps != last_reps:
            row["reps_change"] = now_reps - last_reps

        rows.append(row)
    return rows


def _compare_against_prescribed(
    current: list[dict] | None,
    prescribed: list[dict] | None,
) -> list[dict[str, Any]]:
    """Per-exercise hit rate vs. the plan's prescribed values.

    Returns weight_hit_rate_pct and reps_hit_rate_pct where numeric. Used
    by the LLM to comment on adherence to the plan.
    """
    if not prescribed or not current:
        return []

    rows: list[dict[str, Any]] = []
    for entry in current:
        ejercicio = (entry.get("ejercicio") or "").strip()
        if not ejercicio:
            continue
        match = next(
            (
                e
                for e in prescribed
                if (e.get("ejercicio") or "").strip().lower() == ejercicio.lower()
            ),
            None,
        )
        if not match:
            continue

        prescribed_peso = _parse_peso(match.get("peso"))
        actual_peso = _parse_peso(entry.get("peso"))
        prescribed_reps = _coerce_int(match.get("repeticiones"))
        actual_reps = _coerce_int(entry.get("repeticiones"))

        row: dict[str, Any] = {
            "exercise": ejercicio,
            "prescribed": f"{match.get('peso')} x {prescribed_reps}",
            "actual": f"{entry.get('peso')} x {actual_reps}",
        }
        if prescribed_peso and actual_peso:
            row["weight_hit_rate_pct"] = round(actual_peso / prescribed_peso * 100, 1)
        if prescribed_reps:
            row["reps_hit_rate_pct"] = round(actual_reps / prescribed_reps * 100, 1)
        rows.append(row)
    return rows


def _parse_peso(raw: Any) -> float | None:
    """Extract a numeric weight from a free-form ``peso`` string.

    ``"70kg"`` → 70.0, ``"10 kg"`` → 10.0, ``"N/A"`` / ``"Corporal"`` /
    ``"—"`` / empty → ``None``.
    """
    if raw is None:
        return None
    s = str(raw).strip().lower()
    if not s or s in {"n/a", "na", "corporal", "bw", "bodyweight", "—", "-"}:
        return None
    cleaned = ""
    for ch in s:
        if ch.isdigit() or ch == ".":
            cleaned += ch
        elif ch == "," and cleaned and not cleaned.endswith("."):
            cleaned += "."
    if not cleaned:
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


def _coerce_number(raw: Any) -> float | int | None:
    """Accept either a number or a peso-like string; return a numeric or None."""
    if raw is None:
        return None
    if isinstance(raw, (int, float)):
        return raw
    return _parse_peso(raw)


def _coerce_int(raw: Any) -> int:
    """Best-effort int conversion; returns 0 if the input is missing/junk."""
    if raw is None:
        return 0
    try:
        return int(raw)
    except (ValueError, TypeError):
        try:
            return int(float(raw))
        except (ValueError, TypeError):
            return 0


def _compute_age(birth: date | None) -> int | None:
    """Years-old from a birth date, accounting for whether the birthday has passed."""
    if not birth:
        return None
    today = date.today()
    return today.year - birth.year - ((today.month, today.day) < (birth.month, birth.day))


def generate_coach_message(
    insights: dict,
    *,
    api_key: str,
    model: str,
    language: str = "es",
) -> str:
    """Call the Anthropic API and return the coach message.

    Args:
        insights: The fact pack from ``compute_session_insights``.
            Serialized into the user message as JSON.
        api_key: Anthropic API key. Caller is responsible for handling the
            "no key" case before calling.
        model: Model id (e.g. ``claude-haiku-4-5``).
        language: ``es`` or ``en``; passed to the system prompt to set the
            output language.

    Returns:
        The assistant's text reply, stripped. Empty string if the response
        had no text blocks (shouldn't normally happen).

    Raises:
        Any ``anthropic.APIError`` subclass on transport/auth/model errors
        — the caller wraps these in a placeholder response.
    """
    import anthropic

    client = anthropic.Anthropic(api_key=api_key)
    language_name = LANGUAGE_LABELS.get(language, "Spanish")
    system_prompt = SYSTEM_PROMPT_TEMPLATE.format(language_name=language_name)
    user_content = (
        "Here is the structured data for this session:\n\n"
        "```json\n"
        + json.dumps(insights, ensure_ascii=False, indent=2)
        + "\n```"
    )

    response = client.messages.create(
        model=model,
        max_tokens=350,
        system=system_prompt,
        messages=[{"role": "user", "content": user_content}],
    )

    parts: list[str] = []
    for block in response.content:
        if getattr(block, "type", None) == "text":
            parts.append(block.text)
    return "".join(parts).strip()
