import { Fragment, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronRight, Save, Search, Sparkles, Star, X } from "lucide-react";
import { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import {
  AuthUser,
  Circuito,
  Client,
  ExerciseEntry,
  PerformanceEntry,
  PlanSummary,
  WorkoutSession,
  exerciseFullImageUrl,
  exerciseThumbnailUrl,
  exerciseYoutubeId,
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
  const { t } = useTranslation();
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
          setError(err instanceof Error ? err.message : t("sessions.errorLoadPlans"));
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, clientId, t]);

  return (
    <section className="module-stack" aria-label={t("sessions.ariaLabel")}>
      <header className="module-header">
        <div>
          <h1>{t("sessions.title")}</h1>
          <p>{t("sessions.clientSubtitle")}</p>
        </div>
      </header>

      {error ? <p className="error-text">{error}</p> : null}
      {isLoading ? (
        <p>{t("sessions.loadingPlans")}</p>
      ) : plans.length === 0 ? (
        <p className="muted">{t("sessions.noTrainerPlan")}</p>
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
  const { t } = useTranslation();
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
          <span>{t("sessions.planLabel")}</span>
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
        <p className="muted">{t("sessions.planNoDaysClient")}</p>
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
            dayContent={plan.content[dayKey]}
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
  dayContent,
  thisWeekSession,
  previousSession,
  isLoading,
  onSaved,
}: {
  accessToken: string;
  clientId: number;
  planId: number;
  dayKey: string;
  dayContent: Circuito[] | ExerciseEntry[] | undefined;
  thisWeekSession: WorkoutSession | null;
  previousSession: WorkoutSession | null;
  isLoading: boolean;
  onSaved: (session: WorkoutSession) => void;
}) {
  const { t } = useTranslation();
  const circuitGroups = useMemo(() => toCircuitGroups(dayContent), [dayContent]);
  const prescribed = useMemo(
    () =>
      circuitGroups.flatMap((group) =>
        group.exercises.map((exercise) => ({
          ...exercise,
          series: group.series ?? exercise.series,
        })),
      ),
    [circuitGroups],
  );

  const fillSource = thisWeekSession ?? previousSession;
  const [rows, setRows] = useState<PerformanceEntry[]>(() =>
    buildInitialRows(prescribed, fillSource),
  );
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
  const [previewExercise, setPreviewExercise] = useState<ExerciseEntry | null>(null);

  useEffect(() => {
    setRows(buildInitialRows(prescribed, fillSource));
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

    if (!alreadyCompletedThisWeek) {
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
        completed: true,
        rating: ratingToSave,
        notes: notes.trim() || null,
      });
      onSaved(session);
      setRating(session.rating);
      setCoachMessage(session.ai_response ?? null);
      setFeedbackKind("ok");
      setFeedback(t("sessions.savedCompleted"));

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
      setFeedback(err instanceof Error ? err.message : t("sessions.errorSave"));
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
        <h2>{prettyDayLabel(dayKey, t)}</h2>
        <span>{t("sessions.exerciseCount", { count: prescribed.length })}</span>
      </div>

      {alreadyCompletedThisWeek ? (
        <div className="completion-banner" role="status">
          <CheckCircle2 size={18} />
          <span>{t("sessions.alreadyCompleted")}</span>
          {thisWeekSession?.rating ? <StarRow value={thisWeekSession.rating} /> : null}
        </div>
      ) : null}

      {coachMessage || isLoadingCoach ? (
        <div className={`coach-card ${isLoadingCoach && !coachMessage ? "loading" : ""}`} role="status">
          <div className="coach-card-header">
            <Sparkles size={16} />
            <span>{t("sessions.coachSaysHeading")}</span>
          </div>
          {coachMessage ? (
            <p>{coachMessage}</p>
          ) : (
            <p className="muted">{t("sessions.coachThinking")}</p>
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

      {previewExercise ? (
        <ExercisePreviewModal
          exercise={previewExercise}
          onClose={() => setPreviewExercise(null)}
        />
      ) : null}


      {isLoading ? (
        <p>{t("sessions.loadingLastSession")}</p>
      ) : prescribed.length === 0 ? (
        <p className="muted">{t("sessions.noExercises")}</p>
      ) : (
        <div className="table-wrap">
          <table className="detail-table session-table">
            <thead>
              <tr>
                <th>{t("sessions.exerciseHeader")}</th>
                <th>{t("sessions.prescribedHeader")}</th>
                <th>{t("sessions.lastHeader")}</th>
                <th>{t("sessions.todayHeader")}</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                let runningIndex = 0;
                return circuitGroups.map((group, groupIndex) => {
                  const groupStart = runningIndex;
                  runningIndex += group.exercises.length;
                  const showHeader = group.series !== null;
                  return (
                    <Fragment key={`circuit-${groupIndex}`}>
                      {showHeader ? (
                        <tr className="session-circuit-header">
                          <td colSpan={4}>
                            <strong>{t("sessions.circuitTitle", { number: groupIndex + 1 })}</strong>
                            <span className="muted">
                              {" · "}
                              {t("sessions.circuitSeries", { count: group.series ?? 0 })}
                            </span>
                          </td>
                        </tr>
                      ) : null}
                      {group.exercises.map((_exercise, localIndex) => {
                        const index = groupStart + localIndex;
                        const row = rows[index];
                        if (!row) return null;
                        const prescribedRow = prescribed[index];
                        const lastRow = matchLastEntry(
                          lastReferencePerformance,
                          row.ejercicio,
                          index,
                        );
                        const thumb = prescribedRow
                          ? exerciseThumbnailUrl(prescribedRow)
                          : null;
                        return (
                          <tr key={`${row.ejercicio}-${index}`}>
                            <td data-label={t("sessions.exerciseHeader")}>
                              <div className="exercise-cell">
                                {thumb && prescribedRow ? (
                                  <button
                                    type="button"
                                    className="exercise-thumb-link"
                                    onClick={() => setPreviewExercise(prescribedRow)}
                                    title={t("sessions.previewTitle")}
                                    aria-label={t("sessions.previewLabel", { exercise: row.ejercicio })}
                                  >
                                    <img
                                      className="exercise-thumb"
                                      src={thumb}
                                      alt={row.ejercicio}
                                      loading="lazy"
                                    />
                                  </button>
                                ) : (
                                  <div
                                    className="exercise-thumb exercise-thumb-placeholder"
                                    aria-hidden="true"
                                  />
                                )}
                                <strong>{row.ejercicio}</strong>
                              </div>
                            </td>
                            <td data-label={t("sessions.prescribedHeader")}>
                              <span className="muted">{summarize(prescribedRow)}</span>
                            </td>
                            <td data-label={t("sessions.lastHeader")}>
                              <span className="muted">
                                {lastRow ? summarize(lastRow) : "—"}
                              </span>
                            </td>
                            <td data-label={t("sessions.todayHeader")}>
                              <div className="today-inputs">
                                <input
                                  type="text"
                                  aria-label={t("sessions.pesoAriaLabel", { exercise: row.ejercicio })}
                                  value={row.peso}
                                  placeholder={t("sessions.pesoPlaceholder")}
                                  onChange={(event) =>
                                    updateRow(index, "peso", event.target.value)
                                  }
                                />
                                <input
                                  type="number"
                                  aria-label={t("sessions.repsAriaLabel", { exercise: row.ejercicio })}
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
                    </Fragment>
                  );
                });
              })()}
            </tbody>
          </table>
        </div>
      )}

      <label className="field">
        <span>{t("sessions.notesLabel")}</span>
        <textarea
          rows={2}
          value={notes}
          placeholder={t("sessions.notesPlaceholder")}
          onChange={(event) => setNotes(event.target.value)}
        />
      </label>

      <div className="panel-actions">
        <button className="primary-button" onClick={save} disabled={isSaving} type="button">
          <Save size={16} /> {isSaving ? t("sessions.saving") : t("sessions.save")}
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
  const { t } = useTranslation();
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
        <h2>{t("sessions.rating.title")}</h2>
        <p className="muted">{t("sessions.rating.hint")}</p>
        <div className="star-row" role="radiogroup" aria-label={t("sessions.rating.groupLabel")}>
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              className="star-button"
              aria-label={t("sessions.rating.stars", { count: value })}
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
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => onSave(stars || null)}
          >
            <Save size={16} /> {t("sessions.rating.save")}
          </button>
        </div>
      </div>
    </div>
  );
}

function ExercisePreviewModal({
  exercise,
  onClose,
}: {
  exercise: ExerciseEntry;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const youtubeId = exerciseYoutubeId(exercise);
  const fallbackImage = exerciseFullImageUrl(exercise);
  const thumbFallback = exerciseThumbnailUrl(exercise);

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="exercise-preview-panel" onClick={(event) => event.stopPropagation()}>
        <div className="exercise-preview-header">
          <h2>{exercise.ejercicio || t("sessions.preview.fallbackTitle")}</h2>
          <button
            type="button"
            className="icon-button"
            aria-label={t("sessions.preview.close")}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <div className="exercise-preview-body">
          {youtubeId ? (
            <iframe
              className="exercise-preview-video"
              src={`https://www.youtube.com/embed/${youtubeId}`}
              title={
                exercise.ejercicio
                  ? t("sessions.preview.videoTitle", { exercise: exercise.ejercicio })
                  : t("sessions.preview.videoTitleFallback")
              }
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : fallbackImage ? (
            <img
              className="exercise-preview-image"
              src={fallbackImage}
              alt={exercise.ejercicio}
            />
          ) : thumbFallback ? (
            <img
              className="exercise-preview-image"
              src={thumbFallback}
              alt={exercise.ejercicio}
            />
          ) : (
            <p className="muted">{t("sessions.preview.noPreview")}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function StarRow({ value }: { value: number }) {
  const { t } = useTranslation();
  return (
    <span className="star-row readonly" aria-label={t("sessions.rating.outOf", { value })}>
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
  const { t } = useTranslation();
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
        if (!cancelled) setError(err instanceof Error ? err.message : t("sessions.errorLoadClients"));
      })
      .finally(() => {
        if (!cancelled) setIsLoadingClients(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, t]);

  return (
    <section className="module-stack" aria-label={t("sessions.ariaLabel")}>
      <header className="module-header">
        <div>
          <h1>{t("sessions.title")}</h1>
          <p>{t("sessions.trainerSubtitle")}</p>
        </div>
      </header>

      {error ? <p className="error-text">{error}</p> : null}

      {isLoadingClients ? (
        <p>{t("sessions.loadingClients")}</p>
      ) : clients.length === 0 ? (
        <p className="muted">{t("sessions.noClients")}</p>
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
  const { t } = useTranslation();
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
      <section className="client-toolbar" aria-label={t("sessions.filtersLabel")}>
        <label className="search-field">
          <Search size={18} />
          <input
            placeholder={t("sessions.searchPlaceholder")}
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      </section>

      {filtered.length === 0 ? (
        <p className="muted">{t("sessions.noClientMatch")}</p>
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
                  <span>{t("sessions.focusLabel")}</span>
                  <strong>{client.relation_description}</strong>
                </div>
              ) : null}
              <button
                className="secondary-button view-detail-button"
                onClick={() => onSelect(client.id)}
                type="button"
              >
                {t("sessions.viewSessions")} <ChevronRight size={16} />
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
  const { t } = useTranslation();
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
        if (!cancelled) setError(err instanceof Error ? err.message : t("sessions.errorLoadPlans"));
      })
      .finally(() => {
        if (!cancelled) setIsLoadingPlans(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, client.id, t]);

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
        if (!cancelled) setError(err instanceof Error ? err.message : t("sessions.errorLoadSessions"));
      })
      .finally(() => {
        if (!cancelled) setIsLoadingSessions(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, client.id, planId, dayKey, t]);

  const plan = useMemo(() => plans.find((p) => p.id === planId) ?? null, [plans, planId]);
  const dayKeys = useMemo(() => (plan ? Object.keys(plan.content).sort() : []), [plan]);

  return (
    <>
      <button className="secondary-button back-button" onClick={onBack} type="button">
        {t("sessions.backToClients")}
      </button>

      <header className="detail-header">
        <div className="client-avatar large" aria-hidden="true">
          {getInitials(client.full_name)}
        </div>
        <div>
          <h2>{client.full_name}</h2>
          <p className="muted">
            @{client.username}
            {client.relation_description
              ? ` · ${t("sessions.clientFocusInline", { value: client.relation_description })}`
              : ""}
          </p>
        </div>
      </header>

      {error ? <p className="error-text">{error}</p> : null}

      {isLoadingPlans ? (
        <p>{t("sessions.loadingPlans")}</p>
      ) : plans.length === 0 ? (
        <p className="muted">{t("sessions.noPlans")}</p>
      ) : (
        <>
          {plans.length > 1 ? (
            <label className="field inline-field">
              <span>{t("sessions.planLabel")}</span>
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
            <p className="muted">{t("sessions.planNoDaysTrainer")}</p>
          ) : (
            <>
              <DayTabs days={dayKeys} active={dayKey} onSelect={setDayKey} />

              <section className="panel">
                <div className="panel-header">
                  <h3>{prettyDayLabel(dayKey, t)}</h3>
                  <span>
                    {isLoadingSessions
                      ? t("sessions.loadingSessions")
                      : t("sessions.recentSessions", { count: sessions.length })}
                  </span>
                </div>

                {!isLoadingSessions && sessions.length === 0 ? (
                  <p className="muted">{t("sessions.noSessions")}</p>
                ) : null}

                <div className="session-list">
                  {sessions.map((session) => (
                    <article className="session-row" key={session.id}>
                      <div className="session-row-header">
                        <strong>{session.session_date}</strong>
                        <div className="session-row-meta">
                          <span className={`status-pill ${session.completed ? "status-approved" : "status-draft"}`}>
                            {session.completed ? t("sessions.statusCompleted") : t("sessions.statusInProgress")}
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
  const { t } = useTranslation();
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
            <span>{prettyDayLabel(day, t)}</span>
            {isDone ? <CheckCircle2 size={14} aria-label={t("sessions.completedAria")} /> : null}
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

type CircuitGroup = { series: number | null; exercises: ExerciseEntry[] };

function toCircuitGroups(
  value: Circuito[] | ExerciseEntry[] | undefined | null,
): CircuitGroup[] {
  if (!Array.isArray(value) || value.length === 0) return [];
  const first = value[0] as { exercises?: unknown };
  const isCircuitShape = first && typeof first === "object" && Array.isArray(first.exercises);
  if (isCircuitShape) {
    return (value as Circuito[]).map((circuito) => ({
      series: circuito.series,
      exercises: circuito.exercises,
    }));
  }
  return [{ series: null, exercises: value as ExerciseEntry[] }];
}

function summarize(entry: PerformanceEntry | ExerciseEntry | undefined): string {
  if (!entry) return "—";
  const peso = entry.peso || "—";
  const reps = entry.repeticiones;
  const series = "series" in entry && typeof entry.series === "number" ? entry.series : null;
  if (series && series > 0) return `${series} × ${reps} @ ${peso}`;
  return `${peso} × ${reps}`;
}


function prettyDayLabel(dayKey: string, t: TFunction): string {
  if (!dayKey) return t("sessions.dayLabelFallback");
  const match = dayKey.match(/^dia[_-]?(\d+)$/i);
  if (match) return t("sessions.dayLabel", { number: match[1] });
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
