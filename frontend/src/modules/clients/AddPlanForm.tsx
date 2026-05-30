import { useEffect, useMemo, useState } from "react";
import { CalendarPlus, Plus, Save, Trash2 } from "lucide-react";
import {
  ExerciseEntry,
  PlanContent,
  PlanSummary,
  createPlan,
} from "../../api";
import {
  cleanContent,
  defaultCircuito,
  defaultExercise,
  nextDayKey,
  prettyDayLabel,
} from "./clientDetailUtils";

type Props = {
  accessToken: string;
  clientId: number;
  onCreated: (plan: PlanSummary) => void;
  onCancel: () => void;
};

export function AddPlanForm({ accessToken, clientId, onCreated, onCancel }: Props) {
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
                            <td data-label="Image URL">
                              <input
                                type="text"
                                value={exercise.image_url ?? ""}
                                placeholder="optional — auto from YouTube otherwise"
                                onChange={(event) =>
                                  updateExercise(
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
