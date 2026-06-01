import { useEffect, useMemo, useState } from "react";
import { CalendarPlus, Plus, Save, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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
      !window.confirm(
        t("clients.plan.confirmDeleteCircuito", { number: circuitoIndex + 1, count }),
      )
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
        t("clients.plan.confirmDeleteDay", {
          day: prettyDayLabel(dayKey, t),
          count: exerciseCount,
        }),
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

  async function save() {
    setError(null);
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError(t("clients.plan.titleRequired"));
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
      setError(currentError instanceof Error ? currentError.message : t("clients.plan.errorCreate"));
    } finally {
      setIsSaving(false);
    }
  }

  const activeCircuitos = activeDay ? content[activeDay] ?? [] : [];

  return (
    <article className="panel">
      <div className="panel-header">
        <h3>{t("clients.plan.newTitle")}</h3>
      </div>

      <div className="form-grid">
        <label className="field">
          <span>{t("clients.plan.titleLabel")}</span>
          <input
            type="text"
            value={title}
            placeholder={t("clients.plan.titlePlaceholder")}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label className="field">
          <span>{t("clients.plan.status")}</span>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="draft">{t("clients.plan.statusDraft")}</option>
            <option value="approved">{t("clients.plan.statusApproved")}</option>
            <option value="archived">{t("clients.plan.statusArchived")}</option>
          </select>
        </label>
      </div>

      <label className="field">
        <span>{t("clients.plan.description")}</span>
        <textarea
          rows={2}
          value={description}
          placeholder={t("clients.plan.descriptionPlaceholder")}
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
              {prettyDayLabel(day, t)}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="day-add-button"
          onClick={addDay}
          title={t("clients.plan.addDayTitle")}
          aria-label={t("clients.plan.addDayTitle")}
        >
          <CalendarPlus size={14} />
          <span>{t("clients.plan.addDay")}</span>
        </button>
      </div>

      {dayKeys.length === 0 ? (
        <p className="muted">{t("clients.plan.noDays")}</p>
      ) : (
        <>

          {activeDay ? (
            <div className="plan-day-block">
              <div className="plan-day-header">
                <h3>{prettyDayLabel(activeDay, t)}</h3>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={t("clients.plan.deleteDay", { day: prettyDayLabel(activeDay, t) })}
                  title={t("clients.plan.deleteDay", { day: prettyDayLabel(activeDay, t) })}
                  onClick={() => removeDay(activeDay)}
                >
                  <Trash2 size={14} />
                </button>
              </div>

              {activeCircuitos.map((circuito, circuitoIndex) => (
                <div className="circuito-block" key={circuitoIndex}>
                  <div className="circuito-header">
                    <h4>{t("clients.plan.circuito", { number: circuitoIndex + 1 })}</h4>
                    <div className="circuito-header-actions">
                      <label className="circuito-series">
                        <span>{t("clients.plan.series")}</span>
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
                        aria-label={t("clients.plan.deleteCircuito", { number: circuitoIndex + 1 })}
                        title={t("clients.plan.deleteCircuito", { number: circuitoIndex + 1 })}
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
                          <th>{t("clients.plan.ejercicio")}</th>
                          <th>{t("clients.plan.repeticiones")}</th>
                          <th>{t("clients.plan.peso")}</th>
                          <th>{t("clients.plan.mediaUrl")}</th>
                          <th aria-label={t("clients.plan.actions")} />
                        </tr>
                      </thead>
                      <tbody>
                        {circuito.exercises.map((exercise, exerciseIndex) => (
                          <tr key={exerciseIndex}>
                            <td data-label={t("clients.plan.ejercicio")}>
                              <input
                                type="text"
                                value={exercise.ejercicio}
                                placeholder={t("clients.plan.exercisePlaceholder")}
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
                            <td data-label={t("clients.plan.repeticiones")}>
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
                            <td data-label={t("clients.plan.peso")}>
                              <input
                                type="text"
                                value={exercise.peso}
                                placeholder={t("clients.plan.pesoPlaceholder")}
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
                            <td data-label={t("clients.plan.mediaUrl")}>
                              <input
                                type="text"
                                value={exercise.media_url}
                                placeholder={t("clients.plan.mediaUrlPlaceholder")}
                                onChange={(event) =>
                                  updateExercise(
                                    activeDay,
                                    circuitoIndex,
                                    exerciseIndex,
                                    "media_url",
                                    event.target.value,
                                  )
                                }
                              />
                            </td>
                            <td className="row-actions">
                              <button
                                className="icon-button"
                                aria-label={t("clients.plan.removeExercise")}
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
                              {t("clients.plan.noExercises")}
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
                      <Plus size={16} /> {t("clients.plan.addExercise")}
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
                  <Plus size={16} /> {t("clients.plan.addCircuito")}
                </button>
              </div>
            </div>
          ) : null}
        </>
      )}

      {error ? <p className="error-text">{error}</p> : null}

      <div className="panel-actions">
        <button className="secondary-button" onClick={onCancel} type="button">
          {t("common.cancel")}
        </button>
        <button className="primary-button" onClick={save} disabled={isSaving} type="button">
          <Save size={16} /> {isSaving ? t("clients.plan.creating") : t("clients.plan.createPlan")}
        </button>
      </div>
    </article>
  );
}
