"""Per-request tenant scoping for ORM queries.

Sets up a ``current_gym_id`` ContextVar plus a SQLAlchemy ``do_orm_execute``
event listener that auto-appends ``WHERE gym_id = current_gym_id`` to every
SELECT touching a tenant-owned model.

Lifecycle, per request:

  1. Request arrives. ``current_gym_id`` is ``None`` (the ContextVar default).
  2. ``get_db`` yields a Session. No filter is active yet.
  3. ``get_authenticated_user`` reads the JWT, loads the User (this lookup runs
     unscoped — by design, we need to find the user before we know its gym),
     then calls ``set_current_gym_id(user.gym_id)``.
  4. Every subsequent query on this Session — endpoint queries, lazy loads of
     ``user.roles``, ``user.measures`` — gets the gym filter injected.
  5. The ContextVar is task-local and FastAPI runs each request in its own
     task, so the filter doesn't leak across concurrent requests.

What is NOT auto-filtered (intentional):

  * Login (no user identified yet — gym is resolved from the ``X-Gym-Slug``
    header explicitly in ``auth.login``).
  * Anything queried before ``get_authenticated_user`` sets the ContextVar.
  * Raw-SQL ``db.execute(text(...))`` calls (the hook is ORM-only).

Adding a new tenant model: append it to ``TENANT_MODELS`` and ensure the model
declares a ``gym_id`` column.
"""

from __future__ import annotations

from contextvars import ContextVar

from sqlalchemy import event, text
from sqlalchemy.orm import Session, with_loader_criteria

from app.core.database import engine
from app.models.appointment import Appointment
from app.models.client_measurement import ClientMeasurement
from app.models.par_q_assessment import ParQAssessment
from app.models.plan import Plan
from app.models.plan_version import PlanVersion
from app.models.trainer_unavailability import TrainerUnavailability
from app.models.user import User
from app.models.user_relation import UserRelation
from app.models.workout_session import WorkoutSession

# The list of models that carry a ``gym_id`` column and must be tenant-scoped.
# Order doesn't matter; this is consumed as a set by the event listener.
TENANT_MODELS = (
    User,
    UserRelation,
    Appointment,
    TrainerUnavailability,
    Plan,
    PlanVersion,
    ClientMeasurement,
    WorkoutSession,
    ParQAssessment,
)


# ContextVar default of ``None`` means "no tenant context, queries are not
# filtered." get_authenticated_user sets this; nothing else should call it.
current_gym_id: ContextVar[int | None] = ContextVar("current_gym_id", default=None)


def set_current_gym_id(gym_id: int) -> None:
    """Set the gym scope for the current request. Idempotent within a request."""
    current_gym_id.set(gym_id)


def clear_current_gym_id() -> None:
    """Reset the gym scope to ``None`` — used by tests between cases."""
    current_gym_id.set(None)


def apply_gym_scope(db: Session, gym_id: int) -> None:
    """Establish the gym scope for the current request.

    Sets the request-scoped ContextVar. From there:
      * The ORM auto-filter (``_add_gym_filter`` below) uses it to inject
        ``WHERE gym_id = <gym_id>`` into every tenant-model SELECT.
      * On Postgres, the engine-level ``begin`` event below re-emits
        ``SET LOCAL app.current_gym_id = <gym_id>`` on every new transaction,
        keeping the RLS policy in sync across multi-commit endpoints.

    On SQLite (tests, dev fallback): only the ContextVar is used — the ORM
    filter is sufficient since SQLite doesn't speak RLS or GUCs.

    The first SET LOCAL is also issued explicitly here so the *current*
    transaction (the one in which the caller is about to run its lookup —
    e.g. login resolving a user, or get_authenticated_user loading the
    auth'd User row) is gym-scoped immediately, without waiting for the
    next begin event.

    Call this from any place that establishes "the gym scope for this
    request" — currently ``deps.get_authenticated_user`` after the user is
    resolved, and ``auth.login`` after the gym slug is resolved.
    """
    set_current_gym_id(gym_id)
    gym_id_int = int(gym_id)

    # Pin the gym scope to the Session itself. FastAPI runs sync deps/endpoints
    # in their own copied ContextVars contexts, so the ContextVar set here is
    # NOT visible to downstream code (the endpoint, service layer, event
    # hooks). The Session, by contrast, is shared across the entire request
    # via ``Depends(get_db)``. ``_resolve_gym_id`` reads from here.
    db.info["gym_id"] = gym_id_int

    dialect_name = db.bind.dialect.name if db.bind is not None else ""
    if dialect_name == "postgresql":
        # Also pin to the Connection that the Session is currently bound to.
        # The engine-level ``begin`` event below reads from ``connection.info``
        # to re-issue ``SET LOCAL`` whenever a new transaction starts on this
        # connection (after a commit/rollback during the same request).
        connection = db.connection()
        connection.info["gym_id"] = gym_id_int

        # Issue SET LOCAL for the *current* transaction. The engine.begin
        # hook covers subsequent ones. Postgres ``SET LOCAL`` doesn't support
        # parameter binding — value must be inlined as a literal int.
        db.execute(text(f"SET LOCAL app.current_gym_id = {gym_id_int}"))


@event.listens_for(engine, "begin")
def _reapply_gym_scope_on_new_transaction(connection) -> None:  # pragma: no cover — hook
    """Re-emit ``SET LOCAL app.current_gym_id`` whenever a transaction begins.

    ``SET LOCAL`` is transaction-scoped, so after a ``db.commit()`` the value
    is gone. The next query starts a fresh transaction with no gym scope, RLS
    hides every tenant row, and operations like ``db.refresh(...)``,
    autoflushes, or post-commit re-reads fail mysteriously (StaleDataError,
    "Could not refresh instance", etc.).

    ``Session.after_begin`` only fires for the FIRST transaction in a session
    — subsequent re-begins after ``db.commit()`` don't trigger it. The
    engine-level ``begin`` event DOES fire for every connection-level
    transaction start (initial, post-commit, post-rollback), so we hook here.

    Reads from ``connection.info`` (populated by ``apply_gym_scope``) rather
    than the ContextVar — see the comment in ``apply_gym_scope`` about why
    the ContextVar isn't reliable here under FastAPI's sync-endpoint flow.
    The Connection persists for the Session's whole lifetime in default
    SQLAlchemy 2.0 mode, so ``connection.info`` survives across commits.

    No-ops when no gym scope has been pinned to this connection (login,
    unauthenticated paths, or non-Postgres dialects).
    """
    if connection.dialect.name != "postgresql":
        return
    gym_id = connection.info.get("gym_id")
    if gym_id is None:
        return
    connection.execute(text(f"SET LOCAL app.current_gym_id = {int(gym_id)}"))


def _resolve_gym_id(session: Session | None) -> int | None:
    """Return the gym scope, preferring the per-session value over the ContextVar.

    The per-session value (stored in ``session.info["gym_id"]`` by
    ``apply_gym_scope``) is the authoritative source — FastAPI runs sync
    dependencies and endpoints in their own copied ContextVars contexts, so
    a ContextVar set in ``get_authenticated_user`` is *not* visible from the
    endpoint or its downstream service-layer functions. Tying the scope to
    the Session object (which is shared across the whole request via
    ``Depends(get_db)``) sidesteps that entirely.

    Falls back to the ContextVar so tests that use the helpers directly
    (without a Session) keep working.
    """
    if session is not None:
        value = session.info.get("gym_id")
        if value is not None:
            return int(value)
    return current_gym_id.get()


@event.listens_for(Session, "do_orm_execute")
def _add_gym_filter(execute_state) -> None:  # pragma: no cover — hook
    """Append ``WHERE gym_id = current_gym_id`` to every tenant-model SELECT.

    Runs for every ORM execution on every Session. Skips when:
      * No gym scope has been established for this session yet (login,
        unauthenticated paths).
      * The statement is not a SELECT (INSERT/UPDATE/DELETE handle their own
        scoping at the caller — they're rare and always intentional).
      * The statement is a relationship lazy-load (let the FK relationship
        decide what to load; the filter would double up).
    """
    if not execute_state.is_select:
        return
    if execute_state.is_relationship_load:
        return

    gym_id = _resolve_gym_id(execute_state.session)
    if gym_id is None:
        return

    execute_state.statement = execute_state.statement.options(
        *[
            with_loader_criteria(model, model.gym_id == gym_id, include_aliases=True)
            for model in TENANT_MODELS
        ]
    )
