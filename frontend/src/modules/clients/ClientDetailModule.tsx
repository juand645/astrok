import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CalendarPlus,
  CheckCircle2,
  IdCard,
  Mail,
  Phone,
  Plus,
  Save,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  Circuito,
  ClientDetail,
  ExerciseEntry,
  PlanContent,
  PlanSummary,
  createPlan,
  deletePlan,
  fetchClientDetail,
  fetchClientPlans,
  recordMeasurement,
  updateClient,
  updatePlan,
} from "../../api";
import { HealthScreeningCard } from "./HealthScreeningCard";
import { PlanCoachPanel } from "./PlanCoachPanel";

type ClientDetailModuleProps = {
  accessToken: string;
  clientId: number;
  onBack: () => void;
};

type MeasureRow = {
  key: string;
  value: string;
};

export function ClientDetailModule({ accessToken, clientId, onBack }: ClientDetailModuleProps) {
  const [client, setClient] = useState<ClientDetail | null>(null);
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAddingPlan, setIsAddingPlan] = useState(false);
  const [isCoachOpen, setIsCoachOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    Promise.all([fetchClientDetail(accessToken, clientId), fetchClientPlans(accessToken, clientId)])
      .then(([detail, planList]) => {
        if (!cancelled) {
          setClient(detail);
          setPlans(planList);
        }
      })
      .catch((currentError) => {
        if (!cancelled) {
          setError(
            currentError instanceof Error ? currentError.message : "Could not load client.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, clientId]);

  function handlePlanSaved(updated: PlanSummary) {
    setPlans((current) => current.map((plan) => (plan.id === updated.id ? updated : plan)));
  }

  function handleMeasuresSaved(newMeasures: Record<string, number | string>) {
    setClient((current) => (current ? { ...current, measures: newMeasures } : current));
  }

  function handleClientUpdated(updated: ClientDetail) {
    setClient(updated);
  }

  if (isLoading) {
    return (
      <div className="detail-shell">
        <p>Loading client...</p>
      </div>
    );
  }

  if (error || !client) {
    return (
      <div className="detail-shell">
        <button className="secondary-button" onClick={onBack}>
          <ArrowLeft size={16} /> Back
        </button>
        <p className="error-text">{error ?? "Client not available."}</p>
      </div>
    );
  }

  return (
    <section className="detail-shell" aria-label="Client detail">
      <button className="secondary-button back-button" onClick={onBack}>
        <ArrowLeft size={16} /> Back to clients
      </button>

      <header className="detail-header">
        <div className="client-avatar large" aria-hidden="true">
          {getInitials(client.full_name)}
        </div>
        <div>
          <h1>{client.full_name}</h1>
          <p className="muted">@{client.username}</p>
          <div className="detail-meta">
            <span>
              <Mail size={14} /> {client.email}
            </span>
            {client.personal_number ? (
              <span>
                <Phone size={14} /> {client.personal_number}
              </span>
            ) : null}
            {client.id_number ? (
              <span>
                <IdCard size={14} /> {client.id_number}
              </span>
            ) : null}
            {client.birth_date ? (
              <span>Born {formatBirthDate(client.birth_date)}</span>
            ) : null}
            {client.relation_description ? <span>Focus: {client.relation_description}</span> : null}
          </div>
        </div>
      </header>

      <ClientNotesPanel
        accessToken={accessToken}
        client={client}
        onSaved={handleClientUpdated}
      />

      <MeasuresPanel
        accessToken={accessToken}
        clientId={client.id}
        initialMeasures={client.measures}
        onSaved={handleMeasuresSaved}
      />

      <HealthScreeningCard accessToken={accessToken} clientId={client.id} />

      <section className="panel-stack">
        <div className="section-header">
          <h2>Plans</h2>
          {!isAddingPlan ? (
            <button
              type="button"
              className="primary-button"
              onClick={() => setIsAddingPlan(true)}
            >
              <Plus size={16} /> Add plan
            </button>
          ) : null}
        </div>

        {plans.length === 0 && !isAddingPlan ? (
          <p className="muted">No plans yet for this client.</p>
        ) : null}

        {isAddingPlan ? (
          <AddPlanForm
            accessToken={accessToken}
            clientId={client.id}
            onCreated={(plan) => {
              setPlans((current) => [plan, ...current]);
              setIsAddingPlan(false);
            }}
            onCancel={() => setIsAddingPlan(false)}
          />
        ) : null}

        {plans.map((plan) => (
          <PlanPanel
            key={plan.id}
            accessToken={accessToken}
            plan={plan}
            onSaved={handlePlanSaved}
            onDeleted={(deletedId) =>
              setPlans((current) => current.filter((p) => p.id !== deletedId))
            }
          />
        ))}
      </section>

      <section className="panel-stack" aria-label="Plan coach">
        {!isCoachOpen ? (
          <div className="panel-actions">
            <button
              type="button"
              className="primary-button"
              onClick={() => setIsCoachOpen(true)}
            >
              <Sparkles size={16} /> Generate a plan with AI
            </button>
          </div>
        ) : (
          <PlanCoachPanel
            accessToken={accessToken}
            client={client}
            onPlanCreated={(plan) => {
              setPlans((current) => [plan, ...current]);
              setIsCoachOpen(false);
            }}
            onClose={() => setIsCoachOpen(false)}
          />
        )}
      </section>
    </section>
  );
}

function AddPlanForm({
  accessToken,
  clientId,
  onCreated,
  onCancel,
}: {
  accessToken: string;
  clientId: number;
  onCreated: (plan: PlanSummary) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("draft");
  const [content, setContent] = useState<PlanContent>(() => ({
    dia_1: [defaultCircuito()],
  }));
  const [activeDay, setActiveDay] = useState<string>("dia_1");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dayKeys = useMemo(() => Object.keys(content).sort(), [content]);

  useEffect(() => {
    if (dayKeys.length === 0) {
      if (activeDay !== "") setActiveDay("");
      return;
    }
    if (!dayKeys.includes(activeDay)) {
      setActiveDay(dayKeys[0]);
    }
  }, [dayKeys, activeDay]);

  function updateCircuitoSeries(dayKey: string, circuitoIndex: number, value: string) {
    setContent((current) => {
      const circuitos = current[dayKey];
      if (!circuitos) return current;
      const next = [...circuitos];
      next[circuitoIndex] = { ...next[circuitoIndex], series: Number(value) || 0 };
      return { ...current, [dayKey]: next };
    });
  }

  function updateExercise(
    dayKey: string,
    circuitoIndex: number,
    exerciseIndex: number,
    field: keyof ExerciseEntry,
    value: string,
  ) {
    setContent((current) => {
      const circuitos = current[dayKey];
      if (!circuitos) return current;
      const nextCircuitos = [...circuitos];
      const nextExercises = [...nextCircuitos[circuitoIndex].exercises];
      const numericFields = field === "repeticiones" || field === "series";
      nextExercises[exerciseIndex] = {
        ...nextExercises[exerciseIndex],
        [field]: numericFields ? Number(value) || 0 : value,
      } as ExerciseEntry;
      nextCircuitos[circuitoIndex] = {
        ...nextCircuitos[circuitoIndex],
        exercises: nextExercises,
      };
      return { ...current, [dayKey]: nextCircuitos };
    });
  }

  function addExercise(dayKey: string, circuitoIndex: number) {
    setContent((current) => {
      const circuitos = current[dayKey];
      if (!circuitos) return current;
      const next = [...circuitos];
      next[circuitoIndex] = {
        ...next[circuitoIndex],
        exercises: [...next[circuitoIndex].exercises, defaultExercise()],
      };
      return { ...current, [dayKey]: next };
    });
  }

  function removeExercise(dayKey: string, circuitoIndex: number, exerciseIndex: number) {
    setContent((current) => {
      const circuitos = current[dayKey];
      if (!circuitos) return current;
      const next = [...circuitos];
      next[circuitoIndex] = {
        ...next[circuitoIndex],
        exercises: next[circuitoIndex].exercises.filter((_, i) => i !== exerciseIndex),
      };
      return { ...current, [dayKey]: next };
    });
  }

  function addCircuito(dayKey: string) {
    setContent((current) => ({
      ...current,
      [dayKey]: [...(current[dayKey] ?? []), defaultCircuito()],
    }));
  }

  function removeCircuito(dayKey: string, circuitoIndex: number) {
    const circuitos = content[dayKey] ?? [];
    const count = circuitos[circuitoIndex]?.exercises.length ?? 0;
    if (
      count > 0 &&
      !window.confirm(`Delete Circuito ${circuitoIndex + 1} and its ${count} exercise(s)?`)
    ) {
      return;
    }
    setContent((current) => {
      const dayCircuitos = current[dayKey];
      if (!dayCircuitos) return current;
      return { ...current, [dayKey]: dayCircuitos.filter((_, i) => i !== circuitoIndex) };
    });
  }

  function addDay() {
    const nextKey = nextDayKey(dayKeys);
    setContent((current) => ({ ...current, [nextKey]: [defaultCircuito()] }));
    setActiveDay(nextKey);
  }

  function removeDay(dayKey: string) {
    const circuitos = content[dayKey] ?? [];
    const exerciseCount = circuitos.reduce((sum, c) => sum + c.exercises.length, 0);
    if (
      exerciseCount > 0 &&
      !window.confirm(`Delete ${prettyDayLabel(dayKey)} and its ${exerciseCount} exercise(s)?`)
    ) {
      return;
    }
    setContent((current) => {
      const next = { ...current };
      delete next[dayKey];
      return next;
    });
  }

  async function save() {
    setError(null);
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Title is required.");
      return;
    }

    setIsSaving(true);
    try {
      const plan = await createPlan(accessToken, {
        client_id: clientId,
        title: trimmedTitle,
        description: description.trim() || null,
        status,
        content: cleanContent(content),
      });
      onCreated(plan);
    } catch (currentError) {
      setError(currentError instanceof Error ? currentError.message : "Could not create plan.");
    } finally {
      setIsSaving(false);
    }
  }

  const activeCircuitos = activeDay ? content[activeDay] ?? [] : [];

  return (
    <article className="panel">
      <div className="panel-header">
        <h3>New plan</h3>
      </div>

      <div className="form-grid">
        <label className="field">
          <span>Title *</span>
          <input
            type="text"
            value={title}
            placeholder="e.g. Fuerza base - Bloque 1"
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label className="field">
          <span>Status</span>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="draft">draft</option>
            <option value="approved">approved</option>
            <option value="archived">archived</option>
          </select>
        </label>
      </div>

      <label className="field">
        <span>Description</span>
        <textarea
          rows={2}
          value={description}
          placeholder="Short description of this plan"
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>

      <div className="plan-day-toolbar">
        <div className="day-tabs" role="tablist">
          {dayKeys.map((day) => (
            <button
              key={day}
              type="button"
              role="tab"
              aria-selected={day === activeDay}
              className={`day-tab ${day === activeDay ? "active" : ""}`}
              onClick={() => setActiveDay(day)}
            >
              {prettyDayLabel(day)}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="day-add-button"
          onClick={addDay}
          title="Add day"
          aria-label="Add day"
        >
          <CalendarPlus size={14} />
          <span>Add</span>
        </button>
      </div>

      {dayKeys.length === 0 ? (
        <p className="muted">No days yet. Add one to start prescribing exercises.</p>
      ) : (
        <>

          {activeDay ? (
            <div className="plan-day-block">
              <div className="plan-day-header">
                <h3>{prettyDayLabel(activeDay)}</h3>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Delete ${prettyDayLabel(activeDay)}`}
                  title={`Delete ${prettyDayLabel(activeDay)}`}
                  onClick={() => removeDay(activeDay)}
                >
                  <Trash2 size={14} />
                </button>
              </div>

              {activeCircuitos.map((circuito, circuitoIndex) => (
                <div className="circuito-block" key={circuitoIndex}>
                  <div className="circuito-header">
                    <h4>Circuito {circuitoIndex + 1}</h4>
                    <div className="circuito-header-actions">
                      <label className="circuito-series">
                        <span>Series</span>
                        <input
                          type="number"
                          min={0}
                          value={circuito.series}
                          onChange={(event) =>
                            updateCircuitoSeries(activeDay, circuitoIndex, event.target.value)
                          }
                        />
                      </label>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Delete Circuito ${circuitoIndex + 1}`}
                        title={`Delete Circuito ${circuitoIndex + 1}`}
                        onClick={() => removeCircuito(activeDay, circuitoIndex)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  <div className="table-wrap">
                    <table className="detail-table">
                      <thead>
                        <tr>
                          <th>Ejercicio</th>
                          <th>Repeticiones</th>
                          <th>Peso</th>
                          <th>URL video</th>
                          <th aria-label="Actions" />
                        </tr>
                      </thead>
                      <tbody>
                        {circuito.exercises.map((exercise, exerciseIndex) => (
                          <tr key={exerciseIndex}>
                            <td data-label="Ejercicio">
                              <input
                                type="text"
                                value={exercise.ejercicio}
                                placeholder="Press de banca"
                                onChange={(event) =>
                                  updateExercise(
                                    activeDay,
                                    circuitoIndex,
                                    exerciseIndex,
                                    "ejercicio",
                                    event.target.value,
                                  )
                                }
                              />
                            </td>
                            <td data-label="Repeticiones">
                              <input
                                type="number"
                                min={0}
                                value={exercise.repeticiones}
                                onChange={(event) =>
                                  updateExercise(
                                    activeDay,
                                    circuitoIndex,
                                    exerciseIndex,
                                    "repeticiones",
                                    event.target.value,
                                  )
                                }
                              />
                            </td>
                            <td data-label="Peso">
                              <input
                                type="text"
                                value={exercise.peso}
                                placeholder="70kg"
                                onChange={(event) =>
                                  updateExercise(
                                    activeDay,
                                    circuitoIndex,
                                    exerciseIndex,
                                    "peso",
                                    event.target.value,
                                  )
                                }
                              />
                            </td>
                            <td data-label="URL video">
                              <input
                                type="text"
                                value={exercise.url_video}
                                placeholder="https://..."
                                onChange={(event) =>
                                  updateExercise(
                                    activeDay,
                                    circuitoIndex,
                                    exerciseIndex,
                                    "url_video",
                                    event.target.value,
                                  )
                                }
                              />
                            </td>
                            <td className="row-actions">
                              <button
                                className="icon-button"
                                aria-label="Remove exercise"
                                type="button"
                                onClick={() =>
                                  removeExercise(activeDay, circuitoIndex, exerciseIndex)
                                }
                              >
                                <Trash2 size={16} />
                              </button>
                            </td>
                          </tr>
                        ))}
                        {circuito.exercises.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="muted center">
                              No exercises in this circuit yet.
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>

                  <div className="panel-actions">
                    <button
                      className="secondary-button"
                      onClick={() => addExercise(activeDay, circuitoIndex)}
                      type="button"
                    >
                      <Plus size={16} /> Add exercise
                    </button>
                  </div>
                </div>
              ))}

              <div className="panel-actions">
                <button
                  className="secondary-button"
                  onClick={() => addCircuito(activeDay)}
                  type="button"
                >
                  <Plus size={16} /> Add circuito
                </button>
              </div>
            </div>
          ) : null}
        </>
      )}

      {error ? <p className="error-text">{error}</p> : null}

      <div className="panel-actions">
        <button className="secondary-button" onClick={onCancel} type="button">
          Cancel
        </button>
        <button className="primary-button" onClick={save} disabled={isSaving} type="button">
          <Save size={16} /> {isSaving ? "Creating..." : "Create plan"}
        </button>
      </div>
    </article>
  );
}

function ClientNotesPanel({
  accessToken,
  client,
  onSaved,
}: {
  accessToken: string;
  client: ClientDetail;
  onSaved: (client: ClientDetail) => void;
}) {
  const [description, setDescription] = useState(client.description ?? "");
  const [personalNumber, setPersonalNumber] = useState(client.personal_number ?? "");
  const [idNumber, setIdNumber] = useState(client.id_number ?? "");
  const [relationDescription, setRelationDescription] = useState(
    client.relation_description ?? "",
  );
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackKind, setFeedbackKind] = useState<"ok" | "error">("ok");

  useEffect(() => {
    setDescription(client.description ?? "");
    setPersonalNumber(client.personal_number ?? "");
    setIdNumber(client.id_number ?? "");
    setRelationDescription(client.relation_description ?? "");
  }, [
    client.description,
    client.personal_number,
    client.id_number,
    client.relation_description,
  ]);

  async function save() {
    setFeedback(null);
    setIsSaving(true);
    try {
      const trimmedDescription = description.trim();
      const trimmedPersonalNumber = personalNumber.trim();
      const trimmedIdNumber = idNumber.trim();
      const trimmedRelationDescription = relationDescription.trim();
      const updated = await updateClient(accessToken, client.id, {
        description: trimmedDescription === "" ? null : trimmedDescription,
        personal_number: trimmedPersonalNumber === "" ? null : trimmedPersonalNumber,
        id_number: trimmedIdNumber === "" ? null : trimmedIdNumber,
        relation_description: trimmedRelationDescription === "" ? null : trimmedRelationDescription,
      });
      onSaved(updated);
      setFeedbackKind("ok");
      setFeedback("Saved.");
    } catch (currentError) {
      setFeedbackKind("error");
      setFeedback(currentError instanceof Error ? currentError.message : "Save failed.");
    } finally {
      setIsSaving(false);
    }
  }

  const dirty =
    description.trim() !== (client.description ?? "") ||
    personalNumber.trim() !== (client.personal_number ?? "") ||
    idNumber.trim() !== (client.id_number ?? "") ||
    relationDescription.trim() !== (client.relation_description ?? "");

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Notes</h2>
        <span>Goal, history, anything the client needs you to remember.</span>
      </div>

      <label className="field">
        <span>Personal number</span>
        <input
          type="tel"
          value={personalNumber}
          placeholder="e.g. +52 555 123 4567"
          onChange={(event) => setPersonalNumber(event.target.value)}
        />
      </label>

      <label className="field">
        <span>National ID number</span>
        <input
          type="text"
          value={idNumber}
          placeholder="e.g. CURP / DNI / passport"
          onChange={(event) => setIdNumber(event.target.value)}
        />
      </label>

      <label className="field">
        <span>Focus (relation note)</span>
        <input
          type="text"
          value={relationDescription}
          placeholder="e.g. Strength baseline"
          onChange={(event) => setRelationDescription(event.target.value)}
        />
      </label>

      <label className="field">
        <span>Description</span>
        <textarea
          rows={3}
          value={description}
          placeholder="Goal, observations, training history..."
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>

      <div className="panel-actions">
        <button
          className="primary-button"
          onClick={save}
          disabled={isSaving || !dirty}
          type="button"
        >
          <Save size={16} /> {isSaving ? "Saving..." : "Save notes"}
        </button>
      </div>
      {feedback ? (
        <p className={feedbackKind === "ok" ? "muted" : "error-text"}>{feedback}</p>
      ) : null}
    </section>
  );
}

function MeasuresPanel({
  accessToken,
  clientId,
  initialMeasures,
  onSaved,
}: {
  accessToken: string;
  clientId: number;
  initialMeasures: Record<string, number | string>;
  onSaved: (measures: Record<string, number | string>) => void;
}) {
  const [rows, setRows] = useState<MeasureRow[]>(() => measuresToRows(initialMeasures));
  const [originalRows, setOriginalRows] = useState<MeasureRow[]>(() =>
    measuresToRows(initialMeasures),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackKind, setFeedbackKind] = useState<"ok" | "error">("ok");

  useEffect(() => {
    const seeded = measuresToRows(initialMeasures);
    setRows(seeded);
    setOriginalRows(seeded);
  }, [initialMeasures]);

  function updateRow(index: number, field: keyof MeasureRow, value: string) {
    setRows((current) => {
      const next = [...current];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }

  function addRow() {
    setRows((current) => [...current, { key: "", value: "" }]);
  }

  function removeRow(index: number) {
    setRows((current) => current.filter((_, i) => i !== index));
  }

  async function save() {
    setFeedback(null);
    const { diff, removed } = computeMeasuresChanges(originalRows, rows);

    if (Object.keys(diff).length === 0 && removed.length === 0) {
      setFeedbackKind("error");
      setFeedback("No changes to save.");
      return;
    }

    setIsSaving(true);
    try {
      const response = await recordMeasurement(accessToken, clientId, {
        measures: diff,
        removed,
        notes: "Edited from client detail view",
      });
      onSaved(response.measures);
      setOriginalRows(measuresToRows(response.measures));
      setRows(measuresToRows(response.measures));
      setFeedbackKind("ok");
      const changed = Object.keys(diff).length;
      const dropped = removed.length;
      setFeedback(
        `Saved` +
          (changed ? ` ${changed} change(s)` : "") +
          (changed && dropped ? "," : "") +
          (dropped ? ` removed ${dropped} field(s)` : "") +
          ".",
      );
    } catch (currentError) {
      setFeedbackKind("error");
      setFeedback(currentError instanceof Error ? currentError.message : "Save failed.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Measures</h2>
        <span>Latest snapshot. Editing creates a new measurement reading.</span>
      </div>

      <div className="table-wrap">
        <table className="detail-table">
          <thead>
            <tr>
              <th>Field</th>
              <th>Value</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                <td data-label="Field">
                  <input
                    type="text"
                    value={row.key}
                    placeholder="e.g. peso"
                    onChange={(event) => updateRow(index, "key", event.target.value)}
                  />
                </td>
                <td data-label="Value">
                  <input
                    type="text"
                    value={row.value}
                    placeholder="e.g. 62"
                    onChange={(event) => updateRow(index, "value", event.target.value)}
                  />
                </td>
                <td className="row-actions">
                  <button
                    className="icon-button"
                    aria-label="Remove row"
                    onClick={() => removeRow(index)}
                    type="button"
                  >
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={3} className="muted center">
                  No measurements recorded yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="panel-actions">
        <button className="secondary-button" onClick={addRow} type="button">
          <Plus size={16} /> Add row
        </button>
        <button className="primary-button" onClick={save} disabled={isSaving} type="button">
          <Save size={16} /> {isSaving ? "Saving..." : "Save changes"}
        </button>
      </div>
      {feedback ? (
        <p className={feedbackKind === "ok" ? "muted" : "error-text"}>{feedback}</p>
      ) : null}
    </section>
  );
}

function PlanPanel({
  accessToken,
  plan,
  onSaved,
  onDeleted,
}: {
  accessToken: string;
  plan: PlanSummary;
  onSaved: (plan: PlanSummary) => void;
  onDeleted: (planId: number) => void;
}) {
  const [content, setContent] = useState<PlanContent>(() => normalizeContent(plan.content));
  const [activeDay, setActiveDay] = useState<string>("");
  const [title, setTitle] = useState(plan.title);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [description, setDescription] = useState(plan.description ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackKind, setFeedbackKind] = useState<"ok" | "error">("ok");

  const dayKeys = useMemo(() => Object.keys(content).sort(), [content]);

  useEffect(() => {
    setContent(normalizeContent(plan.content));
    setDescription(plan.description ?? "");
  }, [plan.content, plan.description, plan.title]);

  useEffect(() => {
    if (dayKeys.length === 0) {
      if (activeDay !== "") setActiveDay("");
      return;
    }
    if (!dayKeys.includes(activeDay)) {
      setActiveDay(dayKeys[0]);
    }
  }, [dayKeys, activeDay]);

  function updateCircuitoSeries(dayKey: string, circuitoIndex: number, value: string) {
    setContent((current) => {
      const circuitos = current[dayKey];
      if (!circuitos) return current;
      const next = [...circuitos];
      next[circuitoIndex] = { ...next[circuitoIndex], series: Number(value) || 0 };
      return { ...current, [dayKey]: next };
    });
  }

  function updateExercise(
    dayKey: string,
    circuitoIndex: number,
    exerciseIndex: number,
    field: keyof ExerciseEntry,
    value: string,
  ) {
    setContent((current) => {
      const circuitos = current[dayKey];
      if (!circuitos) return current;
      const nextCircuitos = [...circuitos];
      const nextExercises = [...nextCircuitos[circuitoIndex].exercises];
      const numericFields = field === "repeticiones" || field === "series";
      nextExercises[exerciseIndex] = {
        ...nextExercises[exerciseIndex],
        [field]: numericFields ? Number(value) || 0 : value,
      } as ExerciseEntry;
      nextCircuitos[circuitoIndex] = {
        ...nextCircuitos[circuitoIndex],
        exercises: nextExercises,
      };
      return { ...current, [dayKey]: nextCircuitos };
    });
  }

  function addExercise(dayKey: string, circuitoIndex: number) {
    setContent((current) => {
      const circuitos = current[dayKey];
      if (!circuitos) return current;
      const next = [...circuitos];
      next[circuitoIndex] = {
        ...next[circuitoIndex],
        exercises: [...next[circuitoIndex].exercises, defaultExercise()],
      };
      return { ...current, [dayKey]: next };
    });
  }

  function removeExercise(dayKey: string, circuitoIndex: number, exerciseIndex: number) {
    setContent((current) => {
      const circuitos = current[dayKey];
      if (!circuitos) return current;
      const next = [...circuitos];
      next[circuitoIndex] = {
        ...next[circuitoIndex],
        exercises: next[circuitoIndex].exercises.filter((_, i) => i !== exerciseIndex),
      };
      return { ...current, [dayKey]: next };
    });
  }

  function addCircuito(dayKey: string) {
    setContent((current) => ({
      ...current,
      [dayKey]: [...(current[dayKey] ?? []), defaultCircuito()],
    }));
  }

  function removeCircuito(dayKey: string, circuitoIndex: number) {
    const circuitos = content[dayKey] ?? [];
    const count = circuitos[circuitoIndex]?.exercises.length ?? 0;
    if (
      count > 0 &&
      !window.confirm(`Delete Circuito ${circuitoIndex + 1} and its ${count} exercise(s)?`)
    ) {
      return;
    }
    setContent((current) => {
      const dayCircuitos = current[dayKey];
      if (!dayCircuitos) return current;
      return { ...current, [dayKey]: dayCircuitos.filter((_, i) => i !== circuitoIndex) };
    });
  }

  function addDay() {
    const nextKey = nextDayKey(dayKeys);
    setContent((current) => ({ ...current, [nextKey]: [defaultCircuito()] }));
    setActiveDay(nextKey);
  }

  function removeDay(dayKey: string) {
    const circuitos = content[dayKey] ?? [];
    const exerciseCount = circuitos.reduce((sum, c) => sum + c.exercises.length, 0);
    if (
      exerciseCount > 0 &&
      !window.confirm(
        `Delete ${prettyDayLabel(dayKey)} and its ${exerciseCount} exercise(s)? You can still save this as a new version.`,
      )
    ) {
      return;
    }
    setContent((current) => {
      const next = { ...current };
      delete next[dayKey];
      return next;
    });
  }

  async function handleApprove() {
    setFeedback(null);
    setIsApproving(true);
    try {
      const updated = await updatePlan(accessToken, plan.id, {
        status: "approved",
        change_note: "Plan approved",
      });
      onSaved(updated);
      setFeedbackKind("ok");
      setFeedback("Plan approved.");
    } catch (err) {
      setFeedbackKind("error");
      setFeedback(err instanceof Error ? err.message : "Could not approve plan.");
    } finally {
      setIsApproving(false);
    }
  }

  async function handleDelete() {
    if (
      !window.confirm(
        `Delete plan "${plan.title}"? Workout-session history will be preserved, but the plan won't appear in the list anymore.`,
      )
    ) {
      return;
    }
    setIsDeleting(true);
    try {
      await deletePlan(accessToken, plan.id);
      onDeleted(plan.id);
    } catch (err) {
      setFeedbackKind("error");
      setFeedback(err instanceof Error ? err.message : "Could not delete plan.");
      setIsDeleting(false);
    }
  }

  async function save() {
    setFeedback(null);
    const trimmedTitle = title.trim();
    if (trimmedTitle === "") {
      setFeedbackKind("error");
      setFeedback("Title is required.");
      return;
    }

    setIsSaving(true);
    try {
      const cleaned = cleanContent(content);
      const trimmedDescription = description.trim();
      const updated = await updatePlan(accessToken, plan.id, {
        title: trimmedTitle,
        content: cleaned,
        description: trimmedDescription === "" ? null : trimmedDescription,
        change_note: "Edited from client detail view",
      });
      onSaved(updated);
      setFeedbackKind("ok");
      setFeedback("Saved as a new version.");
    } catch (currentError) {
      setFeedbackKind("error");
      setFeedback(currentError instanceof Error ? currentError.message : "Save failed.");
    } finally {
      setIsSaving(false);
    }
  }

  const activeCircuitos = activeDay ? content[activeDay] ?? [] : [];

  return (
    <article className="panel">
      <div className="panel-header">
        <div className="plan-title-row">
          <input
            type="text"
            className="plan-title-input"
            value={title}
            placeholder="Plan title"
            onChange={(event) => setTitle(event.target.value)}
          />
          <span className={`status-pill ${statusClass(plan.status)}`}>{plan.status}</span>
          {plan.status === "draft" ? (
            <button
              type="button"
              className="secondary-button approve-button"
              onClick={handleApprove}
              disabled={isApproving || isDeleting}
              title="Approve this plan"
            >
              <CheckCircle2 size={14} />
              {isApproving ? "Approving…" : "Approve"}
            </button>
          ) : null}
          <button
            type="button"
            className="icon-button"
            aria-label="Delete plan"
            title="Delete plan"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            <Trash2 size={16} />
          </button>
        </div>
        <span>{plan.plan_type}</span>
      </div>

      <label className="field">
        <span>Description</span>
        <textarea
          rows={2}
          value={description}
          placeholder="Short description of this plan"
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>

      <div className="plan-day-toolbar">
        <div className="day-tabs" role="tablist">
          {dayKeys.map((day) => (
            <button
              key={day}
              type="button"
              role="tab"
              aria-selected={day === activeDay}
              className={`day-tab ${day === activeDay ? "active" : ""}`}
              onClick={() => setActiveDay(day)}
            >
              {prettyDayLabel(day)}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="day-add-button"
          onClick={addDay}
          title="Add day"
          aria-label="Add day"
        >
          <CalendarPlus size={14} />
          <span>Add</span>
        </button>
      </div>

      {dayKeys.length === 0 ? (
        <p className="muted">No days yet. Add one to start prescribing exercises.</p>
      ) : (
        <>
          {activeDay ? (
            <div className="plan-day-block">
              <div className="plan-day-header">
                <h3>{prettyDayLabel(activeDay)}</h3>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Delete ${prettyDayLabel(activeDay)}`}
                  title={`Delete ${prettyDayLabel(activeDay)}`}
                  onClick={() => removeDay(activeDay)}
                >
                  <Trash2 size={14} />
                </button>
              </div>

              {activeCircuitos.map((circuito, circuitoIndex) => (
                <div className="circuito-block" key={circuitoIndex}>
                  <div className="circuito-header">
                    <h4>Circuito {circuitoIndex + 1}</h4>
                    <div className="circuito-header-actions">
                      <label className="circuito-series">
                        <span>Series</span>
                        <input
                          type="number"
                          min={0}
                          value={circuito.series}
                          onChange={(event) =>
                            updateCircuitoSeries(activeDay, circuitoIndex, event.target.value)
                          }
                        />
                      </label>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Delete Circuito ${circuitoIndex + 1}`}
                        title={`Delete Circuito ${circuitoIndex + 1}`}
                        onClick={() => removeCircuito(activeDay, circuitoIndex)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  <div className="table-wrap">
                    <table className="detail-table">
                      <thead>
                        <tr>
                          <th>Ejercicio</th>
                          <th>Repeticiones</th>
                          <th>Peso</th>
                          <th>URL video</th>
                          <th aria-label="Actions" />
                        </tr>
                      </thead>
                      <tbody>
                        {circuito.exercises.map((exercise, exerciseIndex) => (
                          <tr key={exerciseIndex}>
                            <td data-label="Ejercicio">
                              <input
                                type="text"
                                value={exercise.ejercicio}
                                placeholder="Press de banca"
                                onChange={(event) =>
                                  updateExercise(
                                    activeDay,
                                    circuitoIndex,
                                    exerciseIndex,
                                    "ejercicio",
                                    event.target.value,
                                  )
                                }
                              />
                            </td>
                            <td data-label="Repeticiones">
                              <input
                                type="number"
                                min={0}
                                value={exercise.repeticiones}
                                onChange={(event) =>
                                  updateExercise(
                                    activeDay,
                                    circuitoIndex,
                                    exerciseIndex,
                                    "repeticiones",
                                    event.target.value,
                                  )
                                }
                              />
                            </td>
                            <td data-label="Peso">
                              <input
                                type="text"
                                value={exercise.peso}
                                placeholder="70kg"
                                onChange={(event) =>
                                  updateExercise(
                                    activeDay,
                                    circuitoIndex,
                                    exerciseIndex,
                                    "peso",
                                    event.target.value,
                                  )
                                }
                              />
                            </td>
                            <td data-label="URL video">
                              <input
                                type="text"
                                value={exercise.url_video}
                                placeholder="https://..."
                                onChange={(event) =>
                                  updateExercise(
                                    activeDay,
                                    circuitoIndex,
                                    exerciseIndex,
                                    "url_video",
                                    event.target.value,
                                  )
                                }
                              />
                            </td>
                            <td className="row-actions">
                              <button
                                className="icon-button"
                                aria-label="Remove exercise"
                                onClick={() =>
                                  removeExercise(activeDay, circuitoIndex, exerciseIndex)
                                }
                                type="button"
                              >
                                <Trash2 size={16} />
                              </button>
                            </td>
                          </tr>
                        ))}
                        {circuito.exercises.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="muted center">
                              No exercises in this circuit yet.
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>

                  <div className="panel-actions">
                    <button
                      className="secondary-button"
                      onClick={() => addExercise(activeDay, circuitoIndex)}
                      type="button"
                    >
                      <Plus size={16} /> Add exercise
                    </button>
                  </div>
                </div>
              ))}

              <div className="panel-actions">
                <button
                  className="secondary-button"
                  onClick={() => addCircuito(activeDay)}
                  type="button"
                >
                  <Plus size={16} /> Add circuito
                </button>
              </div>
            </div>
          ) : null}
        </>
      )}

      <div className="panel-actions">
        <button className="primary-button" onClick={save} disabled={isSaving} type="button">
          <Save size={16} /> {isSaving ? "Saving..." : "Save as new version"}
        </button>
      </div>
      {feedback ? (
        <p className={feedbackKind === "ok" ? "muted" : "error-text"}>{feedback}</p>
      ) : null}
    </article>
  );
}

function measuresToRows(measures: Record<string, number | string>): MeasureRow[] {
  return Object.entries(measures).map(([key, value]) => ({ key, value: String(value) }));
}

function computeMeasuresChanges(
  original: MeasureRow[],
  current: MeasureRow[],
): { diff: Record<string, number | string>; removed: string[] } {
  const originalMap = new Map(
    original.filter((row) => row.key.trim() !== "").map((row) => [row.key.trim(), row.value]),
  );
  const currentKeys = new Set(
    current.filter((row) => row.key.trim() !== "").map((row) => row.key.trim()),
  );

  const diff: Record<string, number | string> = {};
  for (const row of current) {
    const key = row.key.trim();
    if (!key) {
      continue;
    }
    if (row.value.trim() === "") {
      continue;
    }
    const before = originalMap.get(key);
    if (before === row.value) {
      continue;
    }
    const numeric = Number(row.value);
    diff[key] = !Number.isNaN(numeric) ? numeric : row.value;
  }

  const removed: string[] = [];
  for (const key of originalMap.keys()) {
    if (!currentKeys.has(key)) {
      removed.push(key);
    }
  }

  return { diff, removed };
}

function defaultExercise(): ExerciseEntry {
  return { ejercicio: "", repeticiones: 10, peso: "", url_video: "" };
}

function defaultCircuito(): Circuito {
  return { series: 3, exercises: [defaultExercise()] };
}

function normalizeContent(content: unknown): PlanContent {
  if (!content || typeof content !== "object") return {};
  const normalized: PlanContent = {};
  for (const [day, value] of Object.entries(content as Record<string, unknown>)) {
    if (!Array.isArray(value)) continue;
    if (value.length === 0) {
      normalized[day] = [];
      continue;
    }
    const firstItem = value[0];
    const isCircuitShape =
      firstItem &&
      typeof firstItem === "object" &&
      "exercises" in (firstItem as Record<string, unknown>) &&
      Array.isArray((firstItem as { exercises?: unknown }).exercises);

    if (isCircuitShape) {
      normalized[day] = (value as Circuito[]).map((circuito) => ({
        series: typeof circuito.series === "number" ? circuito.series : 3,
        exercises: (Array.isArray(circuito.exercises) ? circuito.exercises : []).map(
          (exercise) => ({
            ejercicio: exercise.ejercicio ?? "",
            repeticiones: Number(exercise.repeticiones) || 0,
            peso: exercise.peso ?? "",
            url_video: exercise.url_video ?? "",
          }),
        ),
      }));
    } else {
      const legacy = value as ExerciseEntry[];
      const wrappedSeries =
        typeof legacy[0]?.series === "number" && legacy[0].series! > 0 ? legacy[0].series! : 3;
      normalized[day] = [
        {
          series: wrappedSeries,
          exercises: legacy.map((exercise) => ({
            ejercicio: exercise.ejercicio ?? "",
            repeticiones: Number(exercise.repeticiones) || 0,
            peso: exercise.peso ?? "",
            url_video: exercise.url_video ?? "",
          })),
        },
      ];
    }
  }
  return normalized;
}

function cleanContent(content: PlanContent): PlanContent {
  const cleaned: PlanContent = {};
  for (const [day, circuitos] of Object.entries(content)) {
    cleaned[day] = circuitos.map((circuito) => ({
      series: typeof circuito.series === "number" ? circuito.series : 0,
      exercises: circuito.exercises.map((exercise) => ({
        ejercicio: exercise.ejercicio,
        repeticiones: exercise.repeticiones,
        peso: exercise.peso,
        url_video: exercise.url_video,
      })),
    }));
  }
  return cleaned;
}

function nextDayKey(existing: string[]): string {
  let maxNumber = 0;
  for (const key of existing) {
    const match = key.match(/^dia[_-]?(\d+)$/i);
    if (match) {
      const value = parseInt(match[1], 10);
      if (!Number.isNaN(value) && value > maxNumber) maxNumber = value;
    }
  }
  return `dia_${maxNumber + 1}`;
}

function prettyDayLabel(dayKey: string): string {
  if (!dayKey) return "Day";
  const match = dayKey.match(/^dia[_-]?(\d+)$/i);
  if (match) return `Día ${match[1]}`;
  return dayKey;
}

function getInitials(fullName: string) {
  return fullName
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function formatBirthDate(isoDate: string) {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return isoDate;
  }
  const age = Math.floor((Date.now() - date.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
  return `${date.toLocaleDateString()} (age ${age})`;
}

function statusClass(status: string) {
  if (status === "approved") return "status-approved";
  if (status === "draft") return "status-draft";
  return "status-review";
}
