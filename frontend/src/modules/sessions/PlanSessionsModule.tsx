import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronRight, Circle, Save, Search, Sparkles, Star } from "lucide-react";
import {
  AuthUser,
  Client,
  ExerciseEntry,
  PerformanceEntry,
  PlanSummary,
  WorkoutSession,
  fetchClientPlans,
  fetchCoachMessage,
  fetchMyClients,
  fetchSessions,
  logSession,
} from "../../api";

type Props = {
  accessToken: string;
  currentUser: AuthUser;
};

export function PlanSessionsModule({ accessToken, currentUser }: Props) {
  const isPureClient =
    currentUser.roles.length > 0 && currentUser.roles.every((role) => role === "client");

  if (isPureClient) {
    return <ClientSessionsView accessToken={accessToken} clientId={currentUser.id} />;
  }

  return <TrainerSessionsView accessToken={accessToken} />;
}

// ---------- CLIENT VIEW ----------

function ClientSessionsView({
  accessToken,
  clientId,
}: {
  accessToken: string;
  clientId: number;
}) {
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    fetchClientPlans(accessToken, clientId)
      .then((result) => {
        if (!cancelled) setPlans(result);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load plans.");
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, clientId]);

  return (
    <section className="module-stack" aria-label="Plan sessions">
      <header className="module-header">
        <div>
          <h1>Plan Sessions</h1>
          <p>Log your workouts and track your weekly progress.</p>
        </div>
      </header>

      {error ? <p className="error-text">{error}</p> : null}
      {isLoading ? (
        <p>Loading plans...</p>
      ) : plans.length === 0 ? (
        <p className="muted">Your trainer hasn't set up a plan for you yet.</p>
      ) : (
        <SessionEditor accessToken={accessToken} clientId={clientId} plans={plans} />
      )}
    </section>
  );
}

function SessionEditor({
  accessToken,
  clientId,
  plans,
}: {
  accessToken: string;
  clientId: number;
  plans: PlanSummary[];
}) {
  const sortedPlans = useMemo(
    () => [...plans].sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    [plans],
  );
  const [planId, setPlanId] = useState<number>(sortedPlans[0].id);
  const plan = useMemo(
    () => sortedPlans.find((p) => p.id === planId) ?? sortedPlans[0],
    [planId, sortedPlans],
  );

  const dayKeys = useMemo(() => Object.keys(plan.content).sort(), [plan]);
  const [dayKey, setDayKey] = useState<string>(dayKeys[0] ?? "");

  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);

  useEffect(() => {
    if (!dayKeys.includes(dayKey)) {
      setDayKey(dayKeys[0] ?? "");
    }
  }, [dayKeys, dayKey]);

  useEffect(() => {
    let cancelled = false;
    setIsLoadingSessions(true);
    fetchSessions(accessToken, clientId, { planId: plan.id, limit: 100 })
      .then((result) => {
        if (!cancelled) setSessions(result);
      })
      .catch(() => {
        if (!cancelled) setSessions([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingSessions(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, clientId, plan.id]);

  const partitionByDay = useMemo(() => {
    const map = new Map<string, { thisWeek: WorkoutSession | null; previous: WorkoutSession | null }>();
    for (const session of sessions) {
      const slot = map.get(session.day_key) ?? { thisWeek: null, previous: null };
      if (isThisWeek(session.session_date)) {
        if (!slot.thisWeek) slot.thisWeek = session;
      } else if (!slot.previous) {
        slot.previous = session;
      }
      map.set(session.day_key, slot);
    }
    return map;
  }, [sessions]);

  const completionMap = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const [key, slot] of partitionByDay.entries()) {
      map.set(key, slot.thisWeek?.completed === true);
    }
    return map;
  }, [partitionByDay]);

  function handleSessionSaved(saved: WorkoutSession) {
    setSessions((current) => [saved, ...current.filter((s) => s.id !== saved.id)]);
  }

  const slot = partitionByDay.get(dayKey) ?? { thisWeek: null, previous: null };

  return (
    <>
      {sortedPlans.length > 1 ? (
        <label className="field inline-field">
          <span>Plan</span>
          <select value={planId} onChange={(event) => setPlanId(Number(event.target.value))}>
            {sortedPlans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {dayKeys.length === 0 ? (
        <p className="muted">This plan doesn't have any days yet. Ask your trainer to add some.</p>
      ) : (
        <>
          <DayTabs
            days={dayKeys}
            active={dayKey}
            onSelect={setDayKey}
            completionMap={completionMap}
          />
          <DayLogPanel
            key={`${plan.id}-${dayKey}`}
            accessToken={accessToken}
            clientId={clientId}
            planId={plan.id}
            dayKey={dayKey}
            prescribed={plan.content[dayKey] ?? []}
            thisWeekSession={slot.thisWeek}
            previousSession={slot.previous}
            isLoading={isLoadingSessions}
            onSaved={handleSessionSaved}
          />
        </>
      )}
    </>
  );
}

function DayLogPanel({
  accessToken,
  clientId,
  planId,
  dayKey,
  prescribed,
  thisWeekSession,
  previousSession,
  isLoading,
  onSaved,
}: {
  accessToken: string;
  clientId: number;
  planId: number;
  dayKey: string;
  prescribed: ExerciseEntry[];
  thisWeekSession: WorkoutSession | null;
  previousSession: WorkoutSession | null;
  isLoading: boolean;
  onSaved: (session: WorkoutSession) => void;
}) {
  const fillSource = thisWeekSession ?? previousSession;
  const [rows, setRows] = useState<PerformanceEntry[]>(() =>
    buildInitialRows(prescribed, fillSource),
  );
  const [completed, setCompleted] = useState<boolean>(thisWeekSession?.completed ?? false);
  const [notes, setNotes] = useState<string>(thisWeekSession?.notes ?? "");
  const [rating, setRating] = useState<number | null>(thisWeekSession?.rating ?? null);
  const [isRatingModalOpen, setIsRatingModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackKind, setFeedbackKind] = useState<"ok" | "error">("ok");
  const [coachMessage, setCoachMessage] = useState<string | null>(
    thisWeekSession?.ai_response ?? null,
  );
  const [isLoadingCoach, setIsLoadingCoach] = useState(false);

  useEffect(() => {
    setRows(buildInitialRows(prescribed, fillSource));
    setCompleted(thisWeekSession?.completed ?? false);
    setNotes(thisWeekSession?.notes ?? "");
    setRating(thisWeekSession?.rating ?? null);
    setCoachMessage(thisWeekSession?.ai_response ?? null);
    setFeedback(null);
  }, [prescribed, fillSource, thisWeekSession]);

  const alreadyCompletedThisWeek = thisWeekSession?.completed === true;
  const lastReferencePerformance = alreadyCompletedThisWeek
    ? thisWeekSession?.performance
    : previousSession?.performance;

  function updateRow(index: number, field: "peso" | "repeticiones", value: string) {
    setRows((current) => {
      const next = [...current];
      next[index] = {
        ...next[index],
        [field]: field === "repeticiones" ? Number(value) || 0 : value,
      };
      return next;
    });
  }

  async function save() {
    setFeedback(null);

    if (completed && !alreadyCompletedThisWeek) {
      setIsRatingModalOpen(true);
      return;
    }

    await doSave(rating);
  }

  async function doSave(ratingToSave: number | null) {
    setIsSaving(true);
    try {
      const session = await logSession(accessToken, clientId, {
        plan_id: planId,
        day_key: dayKey,
        performance: rows,
        completed,
        rating: ratingToSave,
        notes: notes.trim() || null,
      });
      onSaved(session);
      setRating(session.rating);
      setCoachMessage(session.ai_response ?? null);
      setFeedbackKind("ok");
      setFeedback(completed ? "Session saved and marked as completed." : "Session saved.");

      if (session.completed && !session.ai_response) {
        setIsLoadingCoach(true);
        fetchCoachMessage(accessToken, clientId, session.id)
          .then((res) => {
            if (res.message) setCoachMessage(res.message);
          })
          .catch(() => {
            /* coach message is non-critical; silently ignore */
          })
          .finally(() => setIsLoadingCoach(false));
      }
    } catch (err) {
      setFeedbackKind("error");
      setFeedback(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setIsSaving(false);
    }
  }

  function handleModalSave(chosenRating: number | null) {
    setRating(chosenRating);
    setIsRatingModalOpen(false);
    void doSave(chosenRating);
  }

  function handleModalCancel() {
    setIsRatingModalOpen(false);
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>{prettyDayLabel(dayKey)}</h2>
        <span>{prescribed.length} exercise(s) prescribed</span>
      </div>

      {alreadyCompletedThisWeek ? (
        <div className="completion-banner" role="status">
          <CheckCircle2 size={18} />
          <span>Already completed for this week.</span>
          {thisWeekSession?.rating ? <StarRow value={thisWeekSession.rating} /> : null}
        </div>
      ) : null}

      {coachMessage || isLoadingCoach ? (
        <div className={`coach-card ${isLoadingCoach && !coachMessage ? "loading" : ""}`} role="status">
          <div className="coach-card-header">
            <Sparkles size={16} />
            <span>Your coach says</span>
          </div>
          {coachMessage ? (
            <p>{coachMessage}</p>
          ) : (
            <p className="muted">Reviewing your numbers…</p>
          )}
        </div>
      ) : null}

      {isRatingModalOpen ? (
        <RatingModal
          initialRating={rating}
          onSave={handleModalSave}
          onCancel={handleModalCancel}
        />
      ) : null}

      <button
        type="button"
        className={`completion-toggle ${completed ? "is-completed" : ""}`}
        onClick={() => setCompleted((current) => !current)}
        aria-pressed={completed}
      >
        {completed ? <CheckCircle2 size={20} /> : <Circle size={20} />}
        <span>{completed ? "Marking as complete" : "Mark as complete"}</span>
      </button>

      {isLoading ? (
        <p>Loading last session...</p>
      ) : prescribed.length === 0 ? (
        <p className="muted">No exercises prescribed for this day.</p>
      ) : (
        <div className="table-wrap">
          <table className="detail-table session-table">
            <thead>
              <tr>
                <th>Ejercicio</th>
                <th>Prescribed</th>
                <th>Last</th>
                <th>Today</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const prescribedRow = prescribed[index];
                const lastRow = matchLastEntry(lastReferencePerformance, row.ejercicio, index);
                return (
                  <tr key={`${row.ejercicio}-${index}`}>
                    <td data-label="Ejercicio">
                      <strong>{row.ejercicio}</strong>
                    </td>
                    <td data-label="Prescribed">
                      <span className="muted">{summarize(prescribedRow)}</span>
                    </td>
                    <td data-label="Last">
                      <span className="muted">{lastRow ? summarize(lastRow) : "—"}</span>
                    </td>
                    <td data-label="Today">
                      <div className="today-inputs">
                        <input
                          type="text"
                          aria-label={`${row.ejercicio} peso`}
                          value={row.peso}
                          placeholder="peso"
                          onChange={(event) => updateRow(index, "peso", event.target.value)}
                        />
                        <input
                          type="number"
                          aria-label={`${row.ejercicio} repeticiones`}
                          min={0}
                          value={row.repeticiones}
                          onChange={(event) =>
                            updateRow(index, "repeticiones", event.target.value)
                          }
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <label className="field">
        <span>Notes (optional)</span>
        <textarea
          rows={2}
          value={notes}
          placeholder="How did it feel? Anything to remember next week?"
          onChange={(event) => setNotes(event.target.value)}
        />
      </label>

      <div className="panel-actions">
        <button className="primary-button" onClick={save} disabled={isSaving} type="button">
          <Save size={16} /> {isSaving ? "Saving..." : "Save session"}
        </button>
      </div>

      {feedback ? (
        <p className={feedbackKind === "ok" ? "muted" : "error-text"}>{feedback}</p>
      ) : null}
    </section>
  );
}

// ---------- RATING ----------

function RatingModal({
  initialRating,
  onSave,
  onCancel,
}: {
  initialRating: number | null;
  onSave: (rating: number | null) => void;
  onCancel: () => void;
}) {
  const [stars, setStars] = useState<number>(initialRating ?? 0);
  const [hover, setHover] = useState<number>(0);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onCancel]);

  function handleStarClick(value: number) {
    setStars((current) => (current === value ? 0 : value));
  }

  const display = hover || stars;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={onCancel}>
      <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
        <h2>How did this session feel?</h2>
        <p className="muted">Pick a star to rate. You can also save without rating.</p>
        <div className="star-row" role="radiogroup" aria-label="Session rating">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              className="star-button"
              aria-label={`${value} star${value === 1 ? "" : "s"}`}
              aria-checked={stars === value}
              role="radio"
              onClick={() => handleStarClick(value)}
              onMouseEnter={() => setHover(value)}
              onMouseLeave={() => setHover(0)}
            >
              <Star
                size={28}
                fill={display >= value ? "#f5b400" : "transparent"}
                color={display >= value ? "#f5b400" : "#cdd8cf"}
              />
            </button>
          ))}
        </div>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => onSave(stars || null)}
          >
            <Save size={16} /> Save session
          </button>
        </div>
      </div>
    </div>
  );
}

function StarRow({ value }: { value: number }) {
  return (
    <span className="star-row readonly" aria-label={`${value} of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={14}
          fill={i <= value ? "#f5b400" : "transparent"}
          color={i <= value ? "#f5b400" : "#cdd8cf"}
        />
      ))}
    </span>
  );
}

// ---------- TRAINER VIEW ----------

function TrainerSessionsView({ accessToken }: { accessToken: string }) {
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [isLoadingClients, setIsLoadingClients] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoadingClients(true);
    fetchMyClients(accessToken)
      .then((result) => {
        if (!cancelled) setClients(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load clients.");
      })
      .finally(() => {
        if (!cancelled) setIsLoadingClients(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  return (
    <section className="module-stack" aria-label="Plan sessions">
      <header className="module-header">
        <div>
          <h1>Plan Sessions</h1>
          <p>Review the workouts your clients have logged. Read-only.</p>
        </div>
      </header>

      {error ? <p className="error-text">{error}</p> : null}

      {isLoadingClients ? (
        <p>Loading clients...</p>
      ) : clients.length === 0 ? (
        <p className="muted">No clients assigned yet.</p>
      ) : selectedClientId === null ? (
        <ClientPickerList clients={clients} onSelect={setSelectedClientId} />
      ) : (
        <TrainerClientSessions
          accessToken={accessToken}
          client={clients.find((c) => c.id === selectedClientId)!}
          onBack={() => setSelectedClientId(null)}
        />
      )}
    </section>
  );
}

function ClientPickerList({
  clients,
  onSelect,
}: {
  clients: Client[];
  onSelect: (id: number) => void;
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return clients;
    return clients.filter((client) => {
      return (
        client.full_name.toLowerCase().includes(term) ||
        client.username.toLowerCase().includes(term) ||
        client.email.toLowerCase().includes(term) ||
        (client.relation_description?.toLowerCase().includes(term) ?? false)
      );
    });
  }, [clients, search]);

  return (
    <>
      <section className="client-toolbar" aria-label="Client filters">
        <label className="search-field">
          <Search size={18} />
          <input
            placeholder="Search by name, username, email, or focus"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      </section>

      {filtered.length === 0 ? (
        <p className="muted">No clients match your search.</p>
      ) : (
        <section className="clients-grid">
          {filtered.map((client) => (
            <article className="client-card" key={client.id}>
              <div className="client-card-header">
                <div className="client-avatar" aria-hidden="true">
                  {getInitials(client.full_name)}
                </div>
                <div>
                  <strong>{client.full_name}</strong>
                  <span>@{client.username}</span>
                </div>
              </div>
              {client.relation_description ? (
                <div className="client-card-footer">
                  <span>Focus</span>
                  <strong>{client.relation_description}</strong>
                </div>
              ) : null}
              <button
                className="secondary-button view-detail-button"
                onClick={() => onSelect(client.id)}
                type="button"
              >
                View sessions <ChevronRight size={16} />
              </button>
            </article>
          ))}
        </section>
      )}
    </>
  );
}

function TrainerClientSessions({
  accessToken,
  client,
  onBack,
}: {
  accessToken: string;
  client: Client;
  onBack: () => void;
}) {
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [isLoadingPlans, setIsLoadingPlans] = useState(true);
  const [planId, setPlanId] = useState<number | null>(null);
  const [dayKey, setDayKey] = useState<string>("");
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoadingPlans(true);
    fetchClientPlans(accessToken, client.id)
      .then((result) => {
        if (cancelled) return;
        const sorted = [...result].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
        setPlans(sorted);
        setPlanId(sorted[0]?.id ?? null);
        const firstDay = sorted[0] ? Object.keys(sorted[0].content).sort()[0] ?? "" : "";
        setDayKey(firstDay);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load plans.");
      })
      .finally(() => {
        if (!cancelled) setIsLoadingPlans(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, client.id]);

  useEffect(() => {
    if (planId === null || !dayKey) {
      setSessions([]);
      return;
    }
    let cancelled = false;
    setIsLoadingSessions(true);
    fetchSessions(accessToken, client.id, { planId, dayKey, limit: 20 })
      .then((result) => {
        if (!cancelled) setSessions(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load sessions.");
      })
      .finally(() => {
        if (!cancelled) setIsLoadingSessions(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, client.id, planId, dayKey]);

  const plan = useMemo(() => plans.find((p) => p.id === planId) ?? null, [plans, planId]);
  const dayKeys = useMemo(() => (plan ? Object.keys(plan.content).sort() : []), [plan]);

  return (
    <>
      <button className="secondary-button back-button" onClick={onBack} type="button">
        Back to clients
      </button>

      <header className="detail-header">
        <div className="client-avatar large" aria-hidden="true">
          {getInitials(client.full_name)}
        </div>
        <div>
          <h2>{client.full_name}</h2>
          <p className="muted">
            @{client.username}
            {client.relation_description ? ` · Focus: ${client.relation_description}` : ""}
          </p>
        </div>
      </header>

      {error ? <p className="error-text">{error}</p> : null}

      {isLoadingPlans ? (
        <p>Loading plans...</p>
      ) : plans.length === 0 ? (
        <p className="muted">This client doesn't have any plans yet.</p>
      ) : (
        <>
          {plans.length > 1 ? (
            <label className="field inline-field">
              <span>Plan</span>
              <select
                value={planId ?? ""}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  setPlanId(next);
                  const newPlan = plans.find((p) => p.id === next);
                  setDayKey(newPlan ? Object.keys(newPlan.content).sort()[0] ?? "" : "");
                }}
              >
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {dayKeys.length === 0 ? (
            <p className="muted">This plan doesn't have any days yet.</p>
          ) : (
            <>
              <DayTabs days={dayKeys} active={dayKey} onSelect={setDayKey} />

              <section className="panel">
                <div className="panel-header">
                  <h3>{prettyDayLabel(dayKey)}</h3>
                  <span>
                    {isLoadingSessions
                      ? "Loading sessions..."
                      : `${sessions.length} recent session(s)`}
                  </span>
                </div>

                {!isLoadingSessions && sessions.length === 0 ? (
                  <p className="muted">No sessions logged for this day yet.</p>
                ) : null}

                <div className="session-list">
                  {sessions.map((session) => (
                    <article className="session-row" key={session.id}>
                      <div className="session-row-header">
                        <strong>{session.session_date}</strong>
                        <div className="session-row-meta">
                          <span className={`status-pill ${session.completed ? "status-approved" : "status-draft"}`}>
                            {session.completed ? "Completed" : "In progress"}
                          </span>
                          {session.rating ? <StarRow value={session.rating} /> : null}
                        </div>
                      </div>
                      {session.notes ? <p className="muted">{session.notes}</p> : null}
                      {session.performance.length > 0 ? (
                        <ul className="session-performance">
                          {session.performance.map((entry, index) => (
                            <li key={`${entry.ejercicio}-${index}`}>
                              <span>{entry.ejercicio}</span>
                              <strong>{summarize(entry)}</strong>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </article>
                  ))}
                </div>
              </section>
            </>
          )}
        </>
      )}
    </>
  );
}

// ---------- shared ----------

function DayTabs({
  days,
  active,
  onSelect,
  completionMap,
}: {
  days: string[];
  active: string;
  onSelect: (day: string) => void;
  completionMap?: Map<string, boolean>;
}) {
  return (
    <div className="day-tabs" role="tablist">
      {days.map((day) => {
        const isDone = completionMap?.get(day) === true;
        return (
          <button
            key={day}
            role="tab"
            aria-selected={day === active}
            className={`day-tab ${day === active ? "active" : ""} ${isDone ? "is-done" : ""}`}
            onClick={() => onSelect(day)}
            type="button"
          >
            <span>{prettyDayLabel(day)}</span>
            {isDone ? <CheckCircle2 size={14} aria-label="Completed this week" /> : null}
          </button>
        );
      })}
    </div>
  );
}

function buildInitialRows(
  prescribed: ExerciseEntry[],
  lastSession: WorkoutSession | null,
): PerformanceEntry[] {
  return prescribed.map((exercise, index) => {
    const last = matchLastEntry(lastSession?.performance, exercise.ejercicio, index);
    return {
      ejercicio: exercise.ejercicio,
      peso: last?.peso ?? exercise.peso ?? "",
      repeticiones: last?.repeticiones ?? exercise.repeticiones ?? 0,
    };
  });
}

function matchLastEntry(
  performance: PerformanceEntry[] | undefined,
  ejercicio: string | undefined,
  fallbackIndex: number,
): PerformanceEntry | null {
  if (!performance || performance.length === 0) return null;
  const needle = (ejercicio ?? "").toLowerCase();
  if (needle) {
    const byName = performance.find(
      (entry) => (entry?.ejercicio ?? "").toLowerCase() === needle,
    );
    if (byName) return byName;
  }
  return performance[fallbackIndex] ?? null;
}

function summarize(entry: PerformanceEntry | undefined): string {
  if (!entry) return "—";
  return `${entry.peso || "—"} × ${entry.repeticiones}`;
}

function prettyDayLabel(dayKey: string): string {
  if (!dayKey) return "Day";
  const match = dayKey.match(/^dia[_-]?(\d+)$/i);
  if (match) return `Día ${match[1]}`;
  return dayKey;
}

function startOfIsoWeek(reference: Date): Date {
  const d = new Date(reference);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const shift = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + shift);
  return d;
}

function isThisWeek(isoDate: string): boolean {
  const session = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(session.getTime())) return false;
  const monday = startOfIsoWeek(new Date());
  const nextMonday = new Date(monday);
  nextMonday.setDate(monday.getDate() + 7);
  return session >= monday && session < nextMonday;
}

function getInitials(fullName: string): string {
  return fullName
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
