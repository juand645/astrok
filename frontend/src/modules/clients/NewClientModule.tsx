import { FormEvent, useState } from "react";
import { ArrowLeft, Plus, Save, Trash2 } from "lucide-react";
import {
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

type ExerciseRow = ExerciseEntry & { dia: string };

type DraftPlan = {
  title: string;
  status: string;
  description: string;
  rows: ExerciseRow[];
};

export function NewClientModule({ accessToken, onCancel, onCreated }: NewClientModuleProps) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [personalNumber, setPersonalNumber] = useState("");
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
      { title: "", status: "draft", description: "", rows: [] },
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

  function addPlanRow(planIndex: number) {
    setPlans((current) => {
      const next = [...current];
      const rows = next[planIndex].rows;
      const lastDia = rows.length > 0 ? rows[rows.length - 1].dia : "dia_1";
      next[planIndex] = {
        ...next[planIndex],
        rows: [
          ...next[planIndex].rows,
          { dia: lastDia, ejercicio: "", repeticiones: 3, peso: "", url_video: "" },
        ],
      };
      return next;
    });
  }

  function updatePlanRow(
    planIndex: number,
    rowIndex: number,
    field: keyof ExerciseRow,
    value: string,
  ) {
    setPlans((current) => {
      const next = [...current];
      const rows = [...next[planIndex].rows];
      rows[rowIndex] = {
        ...rows[rowIndex],
        [field]: field === "repeticiones" ? Number(value) || 0 : value,
      };
      next[planIndex] = { ...next[planIndex], rows };
      return next;
    });
  }

  function removePlanRow(planIndex: number, rowIndex: number) {
    setPlans((current) => {
      const next = [...current];
      next[planIndex] = {
        ...next[planIndex],
        rows: next[planIndex].rows.filter((_, i) => i !== rowIndex),
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
      content: rowsToContent(plan.rows),
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

              <div className="table-wrap">
                <table className="detail-table">
                  <thead>
                    <tr>
                      <th>Día</th>
                      <th>Ejercicio</th>
                      <th>Repeticiones</th>
                      <th>Peso</th>
                      <th>URL video</th>
                      <th aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {plan.rows.map((row, rowIndex) => (
                      <tr key={rowIndex}>
                        <td data-label="Día">
                          <input
                            type="text"
                            value={row.dia}
                            placeholder="dia_1"
                            onChange={(event) =>
                              updatePlanRow(planIndex, rowIndex, "dia", event.target.value)
                            }
                          />
                        </td>
                        <td data-label="Ejercicio">
                          <input
                            type="text"
                            value={row.ejercicio}
                            placeholder="Press de banca"
                            onChange={(event) =>
                              updatePlanRow(planIndex, rowIndex, "ejercicio", event.target.value)
                            }
                          />
                        </td>
                        <td data-label="Repeticiones">
                          <input
                            type="number"
                            min={0}
                            value={row.repeticiones}
                            onChange={(event) =>
                              updatePlanRow(
                                planIndex,
                                rowIndex,
                                "repeticiones",
                                event.target.value,
                              )
                            }
                          />
                        </td>
                        <td data-label="Peso">
                          <input
                            type="text"
                            value={row.peso}
                            placeholder="70kg"
                            onChange={(event) =>
                              updatePlanRow(planIndex, rowIndex, "peso", event.target.value)
                            }
                          />
                        </td>
                        <td data-label="URL video">
                          <input
                            type="text"
                            value={row.url_video}
                            placeholder="https://..."
                            onChange={(event) =>
                              updatePlanRow(planIndex, rowIndex, "url_video", event.target.value)
                            }
                          />
                        </td>
                        <td className="row-actions">
                          <button
                            className="icon-button"
                            aria-label="Remove exercise"
                            type="button"
                            onClick={() => removePlanRow(planIndex, rowIndex)}
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {plan.rows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="muted center">
                          No exercises yet.
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
                  onClick={() => addPlanRow(planIndex)}
                >
                  <Plus size={16} /> Add exercise
                </button>
              </div>
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

function rowsToContent(rows: ExerciseRow[]): PlanContent {
  const content: PlanContent = {};
  for (const row of rows) {
    const day = row.dia.trim() || "sin_dia";
    if (!content[day]) {
      content[day] = [];
    }
    content[day].push({
      ejercicio: row.ejercicio,
      repeticiones: row.repeticiones,
      peso: row.peso,
      url_video: row.url_video,
    });
  }
  return content;
}
