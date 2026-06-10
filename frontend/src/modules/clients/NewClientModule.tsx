import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, CalendarPlus, Plus, Save, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  AuthUser,
  Circuito,
  CreateClientPayload,
  ExerciseEntry,
  NewPlanPayload,
  PlanContent,
  UserSummary,
  createClient,
  fetchProfessionals,
} from "../../api";
import { prettyDayLabel } from "./clientDetailUtils";

type NewClientModuleProps = {
  accessToken: string;
  currentUser: AuthUser;
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
  return { ejercicio: "", repeticiones: 10, peso: "", media_url: "" };
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

export function NewClientModule({
  accessToken,
  currentUser,
  onCancel,
  onCreated,
}: NewClientModuleProps) {
  const { t } = useTranslation();
  const isAdmin = currentUser.roles.includes("admin");
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

  // Admin-only: pick which trainer the new client is assigned to. Trainers
  // skip this entirely — the backend auto-self-assigns them on create.
  const [professionals, setProfessionals] = useState<UserSummary[]>([]);
  const [professionalId, setProfessionalId] = useState<number | "">("");

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    fetchProfessionals(accessToken)
      .then((rows) => {
        if (cancelled) return;
        // Exclude the caller (admin); they can still be picked explicitly via
        // backend default if needed, but the typical case is "assign to one of
        // the gym's trainers" — admins don't usually own client rosters.
        const others = rows.filter((row) => row.id !== currentUser.id);
        setProfessionals(others);
      })
      .catch(() => {
        // Silent: the form still works, just without the dropdown's options.
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, isAdmin, currentUser.id]);

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
      !window.confirm(
        t("clients.plan.confirmDeleteDay", {
          day: prettyDayLabel(dayKey, t),
          count: exerciseCount,
        }),
      )
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
      !window.confirm(
        t("clients.plan.confirmDeleteCircuito", { number: circuitoIndex + 1, count }),
      )
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
      setError(t("clients.new.errorPasswordShort"));
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
        setError(t("clients.new.errorPlanTitle"));
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
      professional_id: professionalId === "" ? null : professionalId,
    };

    setIsSaving(true);
    try {
      await createClient(accessToken, payload);
      onCreated();
    } catch (currentError) {
      setError(currentError instanceof Error ? currentError.message : t("clients.new.errorCreate"));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="detail-shell" aria-label={t("clients.new.ariaLabel")}>
      <button className="secondary-button back-button" onClick={onCancel} type="button">
        <ArrowLeft size={16} /> {t("clients.new.back")}
      </button>

      <form className="detail-shell" onSubmit={handleSubmit}>
        <header className="detail-header">
          <div>
            <h1>{t("clients.new.title")}</h1>
            <p className="muted">{t("clients.new.subtitle")}</p>
          </div>
        </header>

        <section className="panel">
          <div className="panel-header">
            <h2>{t("clients.new.basicInfo")}</h2>
            <span>{t("clients.new.basicInfoHint")}</span>
          </div>

          <div className="form-grid">
            <label className="field">
              <span>{t("clients.new.fullName")}</span>
              <input
                type="text"
                value={fullName}
                required
                onChange={(event) => setFullName(event.target.value)}
              />
            </label>
            <label className="field">
              <span>{t("clients.new.email")}</span>
              <input
                type="email"
                value={email}
                required
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label className="field">
              <span>{t("clients.new.username")}</span>
              <input
                type="text"
                value={username}
                required
                onChange={(event) => setUsername(event.target.value)}
              />
            </label>
            <label className="field">
              <span>{t("clients.new.password")}</span>
              <input
                type="text"
                value={password}
                required
                minLength={8}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <label className="field">
              <span>{t("clients.new.birthDate")}</span>
              <input
                type="date"
                value={birthDate}
                onChange={(event) => setBirthDate(event.target.value)}
              />
            </label>
            <label className="field">
              <span>{t("clients.new.personalNumber")}</span>
              <input
                type="tel"
                value={personalNumber}
                placeholder={t("clients.new.personalNumberPlaceholder")}
                onChange={(event) => setPersonalNumber(event.target.value)}
              />
            </label>
            <label className="field">
              <span>{t("clients.new.idNumber")}</span>
              <input
                type="text"
                value={idNumber}
                placeholder={t("clients.new.idNumberPlaceholder")}
                onChange={(event) => setIdNumber(event.target.value)}
              />
            </label>
            <label className="field">
              <span>{t("clients.new.focus")}</span>
              <input
                type="text"
                value={relationDescription}
                placeholder={t("clients.new.focusPlaceholder")}
                onChange={(event) => setRelationDescription(event.target.value)}
              />
            </label>
            {isAdmin && professionals.length > 0 ? (
              <label className="field">
                <span>{t("clients.new.professional")}</span>
                <select
                  value={professionalId}
                  onChange={(event) =>
                    setProfessionalId(
                      event.target.value ? Number(event.target.value) : "",
                    )
                  }
                >
                  <option value="">{t("clients.new.professionalPlaceholder")}</option>
                  {professionals.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name} (@{p.username})
                    </option>
                  ))}
                </select>
                <small className="muted">{t("clients.new.professionalHint")}</small>
              </label>
            ) : null}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>{t("clients.new.notesHeading")}</h2>
            <span>{t("clients.new.notesHint")}</span>
          </div>
          <label className="field">
            <span>{t("clients.new.description")}</span>
            <textarea
              rows={3}
              value={description}
              placeholder={t("clients.new.descriptionPlaceholder")}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>{t("clients.new.measuresHeading")}</h2>
            <span>{t("clients.new.measuresHint")}</span>
          </div>

          <div className="table-wrap">
            <table className="detail-table">
              <thead>
                <tr>
                  <th>{t("clients.measures.fieldHeader")}</th>
                  <th>{t("clients.measures.valueHeader")}</th>
                  <th aria-label={t("clients.measures.actionsHeader")} />
                </tr>
              </thead>
              <tbody>
                {measureRows.map((row, index) => (
                  <tr key={index}>
                    <td data-label={t("clients.measures.fieldHeader")}>
                      <input
                        type="text"
                        value={row.key}
                        placeholder={t("clients.measures.keyPlaceholder")}
                        onChange={(event) => updateMeasureRow(index, "key", event.target.value)}
                      />
                    </td>
                    <td data-label={t("clients.measures.valueHeader")}>
                      <input
                        type="text"
                        value={row.value}
                        placeholder={t("clients.measures.valuePlaceholder")}
                        onChange={(event) => updateMeasureRow(index, "value", event.target.value)}
                      />
                    </td>
                    <td className="row-actions">
                      <button
                        className="icon-button"
                        aria-label={t("clients.measures.removeRow")}
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
              <Plus size={16} /> {t("clients.measures.addRow")}
            </button>
          </div>
        </section>

        <section className="panel-stack">
          <div className="panel-header">
            <h2>{t("clients.new.plansHeading")}</h2>
            <span>{t("clients.new.plansHint")}</span>
          </div>

          {plans.map((plan, planIndex) => (
            <article className="panel" key={planIndex}>
              <div className="panel-header">
                <h3>{t("clients.new.planNumber", { number: planIndex + 1 })}</h3>
                <button
                  className="icon-button"
                  aria-label={t("clients.new.removePlan")}
                  type="button"
                  onClick={() => removePlan(planIndex)}
                >
                  <Trash2 size={16} />
                </button>
              </div>

              <div className="form-grid">
                <label className="field">
                  <span>{t("clients.plan.titleLabel")}</span>
                  <input
                    type="text"
                    value={plan.title}
                    placeholder={t("clients.plan.titlePlaceholder")}
                    onChange={(event) => updatePlan(planIndex, "title", event.target.value)}
                  />
                </label>
                <label className="field">
                  <span>{t("clients.plan.status")}</span>
                  <select
                    value={plan.status}
                    onChange={(event) => updatePlan(planIndex, "status", event.target.value)}
                  >
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
                  value={plan.description}
                  placeholder={t("clients.plan.descriptionPlaceholder")}
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
                            {prettyDayLabel(day, t)}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        className="day-add-button"
                        onClick={() => addPlanDay(planIndex)}
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
                              <h4>{prettyDayLabel(activeDay, t)}</h4>
                              <button
                                type="button"
                                className="icon-button"
                                aria-label={t("clients.plan.deleteDay", {
                                  day: prettyDayLabel(activeDay, t),
                                })}
                                title={t("clients.plan.deleteDay", {
                                  day: prettyDayLabel(activeDay, t),
                                })}
                                onClick={() => removePlanDay(planIndex, activeDay)}
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
                                      aria-label={t("clients.plan.deleteCircuito", {
                                        number: circuitoIndex + 1,
                                      })}
                                      title={t("clients.plan.deleteCircuito", {
                                        number: circuitoIndex + 1,
                                      })}
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
                                          <td data-label={t("clients.plan.repeticiones")}>
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
                                          <td data-label={t("clients.plan.peso")}>
                                            <input
                                              type="text"
                                              value={exercise.peso}
                                              placeholder={t("clients.plan.pesoPlaceholder")}
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
                                          <td data-label={t("clients.plan.mediaUrl")}>
                                            <input
                                              type="text"
                                              value={exercise.media_url}
                                              placeholder={t("clients.plan.mediaUrlPlaceholder")}
                                              onChange={(event) =>
                                                updatePlanExercise(
                                                  planIndex,
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
                                    type="button"
                                    onClick={() =>
                                      addPlanExercise(planIndex, activeDay, circuitoIndex)
                                    }
                                  >
                                    <Plus size={16} /> {t("clients.plan.addExercise")}
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
                                <Plus size={16} /> {t("clients.plan.addCircuito")}
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
                <Plus size={16} /> {t("clients.detail.addPlan")}
              </button>
            </div>
          ) : null}
        </section>

        {error ? <p className="error-text">{error}</p> : null}

        <div className="panel-actions">
          <button className="secondary-button" type="button" onClick={onCancel}>
            {t("common.cancel")}
          </button>
          <button className="primary-button" type="submit" disabled={isSaving}>
            <Save size={16} /> {isSaving ? t("clients.new.creating") : t("clients.new.submit")}
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
        media_url: (exercise.media_url ?? "").trim(),
      })),
    }));
  }
  return cleaned;
}
