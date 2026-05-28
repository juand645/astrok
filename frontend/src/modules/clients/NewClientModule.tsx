import { FormEvent, useState } from "react";
import { ArrowLeft, CalendarPlus, Plus, Save, Trash2 } from "lucide-react";
import {
  Circuito,
  CreateClientPayload,
  ExerciseEntry,
  NewPlanPayload,
  PlanContent,
  createClient,
} from "../../api";

type NewClientModuleProps = {
  accessToken: string;
  onCancel: () => void;
  onCreated: () => void;
};

type MeasureRow = {
  key: string;
  value: string;
};

type DraftPlan = {
  title: string;
  status: string;
  description: string;
  content: PlanContent;
  activeDay: string;
};

function defaultExercise(): ExerciseEntry {
  return { ejercicio: "", repeticiones: 10, peso: "", url_video: "", image_url: "" };
}

function defaultCircuito(): Circuito {
  return { series: 3, exercises: [defaultExercise()] };
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

export function NewClientModule({ accessToken, onCancel, onCreated }: NewClientModuleProps) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [personalNumber, setPersonalNumber] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [description, setDescription] = useState("");
  const [relationDescription, setRelationDescription] = useState("");
  const [measureRows, setMeasureRows] = useState<MeasureRow[]>([{ key: "peso", value: "" }]);
  const [plans, setPlans] = useState<DraftPlan[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateMeasureRow(index: number, field: keyof MeasureRow, value: string) {
    setMeasureRows((current) => {
      const next = [...current];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }

  function addMeasureRow() {
    setMeasureRows((current) => [...current, { key: "", value: "" }]);
  }

  function removeMeasureRow(index: number) {
    setMeasureRows((current) => current.filter((_, i) => i !== index));
  }

  function addPlan() {
    setPlans((current) => [
      ...current,
      {
        title: "",
        status: "draft",
        description: "",
        content: { dia_1: [defaultCircuito()] },
        activeDay: "dia_1",
      },
    ]);
  }

  function removePlan(index: number) {
    setPlans((current) => current.filter((_, i) => i !== index));
  }

  function updatePlan(index: number, field: keyof DraftPlan, value: string) {
    setPlans((current) => {
      const next = [...current];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }

  function setPlanActiveDay(planIndex: number, dayKey: string) {
    setPlans((current) => {
      const next = [...current];
      next[planIndex] = { ...next[planIndex], activeDay: dayKey };
      return next;
    });
  }

  function addPlanDay(planIndex: number) {
    setPlans((current) => {
      const next = [...current];
      const plan = next[planIndex];
      const dayKeys = Object.keys(plan.content).sort();
      const newKey = nextDayKey(dayKeys);
      next[planIndex] = {
        ...plan,
        content: { ...plan.content, [newKey]: [defaultCircuito()] },
        activeDay: newKey,
      };
      return next;
    });
  }

  function removePlanDay(planIndex: number, dayKey: string) {
    const plan = plans[planIndex];
    const circuitos = plan?.content[dayKey] ?? [];
    const exerciseCount = circuitos.reduce((sum, c) => sum + c.exercises.length, 0);
    if (
      exerciseCount > 0 &&
      !window.confirm(`Delete ${prettyDayLabel(dayKey)} and its ${exerciseCount} exercise(s)?`)
    ) {
      return;
    }
    setPlans((current) => {
      const next = [...current];
      const planSnapshot = next[planIndex];
      const newContent = { ...planSnapshot.content };
      delete newContent[dayKey];
      const remaining = Object.keys(newContent).sort();
      next[planIndex] = {
        ...planSnapshot,
        content: newContent,
        activeDay: planSnapshot.activeDay === dayKey ? remaining[0] ?? "" : planSnapshot.activeDay,
      };
      return next;
    });
  }

  function updatePlanCircuitoSeries(
    planIndex: number,
    dayKey: string,
    circuitoIndex: number,
    value: string,
  ) {
    setPlans((current) => {
      const next = [...current];
      const plan = next[planIndex];
      const circuitos = [...(plan.content[dayKey] ?? [])];
      circuitos[circuitoIndex] = { ...circuitos[circuitoIndex], series: Number(value) || 0 };
      next[planIndex] = {
        ...plan,
        content: { ...plan.content, [dayKey]: circuitos },
      };
      return next;
    });
  }

  function addPlanCircuito(planIndex: number, dayKey: string) {
    setPlans((current) => {
      const next = [...current];
      const plan = next[planIndex];
      const circuitos = plan.content[dayKey] ?? [];
      next[planIndex] = {
        ...plan,
        content: { ...plan.content, [dayKey]: [...circuitos, defaultCircuito()] },
      };
      return next;
    });
  }

  function removePlanCircuito(planIndex: number, dayKey: string, circuitoIndex: number) {
    const plan = plans[planIndex];
    const circuitos = plan?.content[dayKey] ?? [];
    const count = circuitos[circuitoIndex]?.exercises.length ?? 0;
    if (
      count > 0 &&
      !window.confirm(`Delete Circuito ${circuitoIndex + 1} and its ${count} exercise(s)?`)
    ) {
      return;
    }
    setPlans((current) => {
      const next = [...current];
      const planSnapshot = next[planIndex];
      const dayCircuitos = planSnapshot.content[dayKey] ?? [];
      next[planIndex] = {
        ...planSnapshot,
        content: {
          ...planSnapshot.content,
          [dayKey]: dayCircuitos.filter((_, i) => i !== circuitoIndex),
        },
      };
      return next;
    });
  }

  function addPlanExercise(planIndex: number, dayKey: string, circuitoIndex: number) {
    setPlans((current) => {
      const next = [...current];
      const plan = next[planIndex];
      const circuitos = [...(plan.content[dayKey] ?? [])];
      circuitos[circuitoIndex] = {
        ...circuitos[circuitoIndex],
        exercises: [...circuitos[circuitoIndex].exercises, defaultExercise()],
      };
      next[planIndex] = {
        ...plan,
        content: { ...plan.content, [dayKey]: circuitos },
      };
      return next;
    });
  }

  function updatePlanExercise(
    planIndex: number,
    dayKey: string,
    circuitoIndex: number,
    exerciseIndex: number,
    field: keyof ExerciseEntry,
    value: string,
  ) {
    setPlans((current) => {
      const next = [...current];
      const plan = next[planIndex];
      const circuitos = [...(plan.content[dayKey] ?? [])];
      const exercises = [...circuitos[circuitoIndex].exercises];
      const numericFields = field === "series" || field === "repeticiones";
      exercises[exerciseIndex] = {
        ...exercises[exerciseIndex],
        [field]: numericFields ? Number(value) || 0 : value,
      } as ExerciseEntry;
      circuitos[circuitoIndex] = { ...circuitos[circuitoIndex], exercises };
      next[planIndex] = {
        ...plan,
        content: { ...plan.content, [dayKey]: circuitos },
      };
      return next;
    });
  }

  function removePlanExercise(
    planIndex: number,
    dayKey: string,
    circuitoIndex: number,
    exerciseIndex: number,
  ) {
    setPlans((current) => {
      const next = [...current];
      const plan = next[planIndex];
      const circuitos = [...(plan.content[dayKey] ?? [])];
      circuitos[circuitoIndex] = {
        ...circuitos[circuitoIndex],
        exercises: circuitos[circuitoIndex].exercises.filter((_, i) => i !== exerciseIndex),
      };
      next[planIndex] = {
        ...plan,
        content: { ...plan.content, [dayKey]: circuitos },
      };
      return next;
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    const measures = measureRowsToObject(measureRows);
    const payloadPlans: NewPlanPayload[] = plans.map((plan) => ({
      title: plan.title.trim(),
      status: plan.status,
      description: plan.description.trim() || null,
      content: cleanContent(plan.content),
    }));

    for (const plan of payloadPlans) {
      if (!plan.title) {
        setError("Every plan needs a title.");
        return;
      }
    }

    const payload: CreateClientPayload = {
      full_name: fullName.trim(),
      email: email.trim(),
      username: username.trim(),
      password,
      personal_number: personalNumber.trim() || null,
      id_number: idNumber.trim() || null,
      birth_date: birthDate || null,
      description: description.trim() || null,
      relation_description: relationDescription.trim() || null,
      measures,
      plans: payloadPlans,
    };

    setIsSaving(true);
    try {
      await createClient(accessToken, payload);
      onCreated();
    } catch (currentError) {
      setError(currentError instanceof Error ? currentError.message : "Could not create client.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="detail-shell" aria-label="New client">
      <button className="secondary-button back-button" onClick={onCancel} type="button">
        <ArrowLeft size={16} /> Back to clients
      </button>

      <form className="detail-shell" onSubmit={handleSubmit}>
        <header className="detail-header">
          <div>
            <h1>New client</h1>
            <p className="muted">Create a client and link them to you as their professional.</p>
          </div>
        </header>

        <section className="panel">
          <div className="panel-header">
            <h2>Basic info</h2>
            <span>Account credentials and identity</span>
          </div>

          <div className="form-grid">
            <label className="field">
              <span>Full name *</span>
              <input
                type="text"
                value={fullName}
                required
                onChange={(event) => setFullName(event.target.value)}
              />
            </label>
            <label className="field">
              <span>Email *</span>
              <input
                type="email"
                value={email}
                required
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label className="field">
              <span>Username *</span>
              <input
                type="text"
                value={username}
                required
                onChange={(event) => setUsername(event.target.value)}
              />
            </label>
            <label className="field">
              <span>Temporary password * (min 8 chars)</span>
              <input
                type="text"
                value={password}
                required
                minLength={8}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <label className="field">
              <span>Birth date</span>
              <input
                type="date"
                value={birthDate}
                onChange={(event) => setBirthDate(event.target.value)}
              />
            </label>
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
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>Notes</h2>
            <span>Goal, training history, anything to remember.</span>
          </div>
          <label className="field">
            <span>Description</span>
            <textarea
              rows={3}
              value={description}
              placeholder="Goal: build strength (beginner). No current injuries..."
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>Initial measures</h2>
            <span>Optional. Leave blank to skip.</span>
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
                {measureRows.map((row, index) => (
                  <tr key={index}>
                    <td data-label="Field">
                      <input
                        type="text"
                        value={row.key}
                        placeholder="e.g. peso"
                        onChange={(event) => updateMeasureRow(index, "key", event.target.value)}
                      />
                    </td>
                    <td data-label="Value">
                      <input
                        type="text"
                        value={row.value}
                        placeholder="e.g. 62"
                        onChange={(event) => updateMeasureRow(index, "value", event.target.value)}
                      />
                    </td>
                    <td className="row-actions">
                      <button
                        className="icon-button"
                        aria-label="Remove row"
                        type="button"
                        onClick={() => removeMeasureRow(index)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="panel-actions">
            <button className="secondary-button" type="button" onClick={addMeasureRow}>
              <Plus size={16} /> Add row
            </button>
          </div>
        </section>

        <section className="panel-stack">
          <div className="panel-header">
            <h2>Plans</h2>
            <span>Optional. Add one or more initial plans.</span>
          </div>

          {plans.map((plan, planIndex) => (
            <article className="panel" key={planIndex}>
              <div className="panel-header">
                <h3>Plan {planIndex + 1}</h3>
                <button
                  className="icon-button"
                  aria-label="Remove plan"
                  type="button"
                  onClick={() => removePlan(planIndex)}
                >
                  <Trash2 size={16} />
                </button>
              </div>

              <div className="form-grid">
                <label className="field">
                  <span>Title *</span>
                  <input
                    type="text"
                    value={plan.title}
                    placeholder="e.g. Fuerza base - Bloque 1"
                    onChange={(event) => updatePlan(planIndex, "title", event.target.value)}
                  />
                </label>
                <label className="field">
                  <span>Status</span>
                  <select
                    value={plan.status}
                    onChange={(event) => updatePlan(planIndex, "status", event.target.value)}
                  >
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
                  value={plan.description}
                  placeholder="Short description of this plan"
                  onChange={(event) => updatePlan(planIndex, "description", event.target.value)}
                />
              </label>

              {(() => {
                const dayKeys = Object.keys(plan.content).sort();
                const activeDay =
                  plan.activeDay && dayKeys.includes(plan.activeDay)
                    ? plan.activeDay
                    : dayKeys[0] ?? "";
                const activeCircuitos = activeDay ? plan.content[activeDay] ?? [] : [];
                return (
                  <>
                    <div className="plan-day-toolbar">
                      <div className="day-tabs" role="tablist">
                        {dayKeys.map((day) => (
                          <button
                            key={day}
                            type="button"
                            role="tab"
                            aria-selected={day === activeDay}
                            className={`day-tab ${day === activeDay ? "active" : ""}`}
                            onClick={() => setPlanActiveDay(planIndex, day)}
                          >
                            {prettyDayLabel(day)}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        className="day-add-button"
                        onClick={() => addPlanDay(planIndex)}
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
                              <h4>{prettyDayLabel(activeDay)}</h4>
                              <button
                                type="button"
                                className="icon-button"
                                aria-label={`Delete ${prettyDayLabel(activeDay)}`}
                                title={`Delete ${prettyDayLabel(activeDay)}`}
                                onClick={() => removePlanDay(planIndex, activeDay)}
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
                                          updatePlanCircuitoSeries(
                                            planIndex,
                                            activeDay,
                                            circuitoIndex,
                                            event.target.value,
                                          )
                                        }
                                      />
                                    </label>
                                    <button
                                      type="button"
                                      className="icon-button"
                                      aria-label={`Delete Circuito ${circuitoIndex + 1}`}
                                      title={`Delete Circuito ${circuitoIndex + 1}`}
                                      onClick={() =>
                                        removePlanCircuito(planIndex, activeDay, circuitoIndex)
                                      }
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
                                        <th>Image URL</th>
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
                                                updatePlanExercise(
                                                  planIndex,
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
                                                updatePlanExercise(
                                                  planIndex,
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
                                                updatePlanExercise(
                                                  planIndex,
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
                                                updatePlanExercise(
                                                  planIndex,
                                                  activeDay,
                                                  circuitoIndex,
                                                  exerciseIndex,
                                                  "url_video",
                                                  event.target.value,
                                                )
                                              }
                                            />
                                          </td>
                                          <td data-label="Image URL">
                                            <input
                                              type="text"
                                              value={exercise.image_url ?? ""}
                                              placeholder="optional — auto from YouTube otherwise"
                                              onChange={(event) =>
                                                updatePlanExercise(
                                                  planIndex,
                                                  activeDay,
                                                  circuitoIndex,
                                                  exerciseIndex,
                                                  "image_url",
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
                                                removePlanExercise(
                                                  planIndex,
                                                  activeDay,
                                                  circuitoIndex,
                                                  exerciseIndex,
                                                )
                                              }
                                            >
                                              <Trash2 size={16} />
                                            </button>
                                          </td>
                                        </tr>
                                      ))}
                                      {circuito.exercises.length === 0 ? (
                                        <tr>
                                          <td colSpan={6} className="muted center">
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
                                    type="button"
                                    onClick={() =>
                                      addPlanExercise(planIndex, activeDay, circuitoIndex)
                                    }
                                  >
                                    <Plus size={16} /> Add exercise
                                  </button>
                                </div>
                              </div>
                            ))}

                            <div className="panel-actions">
                              <button
                                className="secondary-button"
                                type="button"
                                onClick={() => addPlanCircuito(planIndex, activeDay)}
                              >
                                <Plus size={16} /> Add circuito
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </>
                    )}
                  </>
                );
              })()}
            </article>
          ))}

          {plans.length === 0 ? (
            <div className="panel-actions">
              <button className="secondary-button" type="button" onClick={addPlan}>
                <Plus size={16} /> Add plan
              </button>
            </div>
          ) : null}
        </section>

        {error ? <p className="error-text">{error}</p> : null}

        <div className="panel-actions">
          <button className="secondary-button" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="primary-button" type="submit" disabled={isSaving}>
            <Save size={16} /> {isSaving ? "Creating..." : "Create client"}
          </button>
        </div>
      </form>
    </section>
  );
}

function measureRowsToObject(rows: MeasureRow[]): Record<string, number | string> {
  const measures: Record<string, number | string> = {};
  for (const row of rows) {
    const key = row.key.trim();
    if (!key) continue;
    const trimmedValue = row.value.trim();
    if (trimmedValue === "") continue;
    const numeric = Number(trimmedValue);
    measures[key] = !Number.isNaN(numeric) ? numeric : trimmedValue;
  }
  return measures;
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
        image_url: (exercise.image_url ?? "").trim() || undefined,
      })),
    }));
  }
  return cleaned;
}
