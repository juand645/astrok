import { useEffect, useState } from "react";
import { ArrowLeft, Mail, Plus, Save, Trash2 } from "lucide-react";
import {
  ClientDetail,
  ExerciseEntry,
  PlanContent,
  PlanSummary,
  createPlan,
  fetchClientDetail,
  fetchClientPlans,
  recordMeasurement,
  updateClient,
  updatePlan,
} from "../../api";

type ClientDetailModuleProps = {
  accessToken: string;
  clientId: number;
  onBack: () => void;
};

type MeasureRow = {
  key: string;
  value: string;
};

type ExerciseRow = ExerciseEntry & { dia: string };

export function ClientDetailModule({ accessToken, clientId, onBack }: ClientDetailModuleProps) {
  const [client, setClient] = useState<ClientDetail | null>(null);
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAddingPlan, setIsAddingPlan] = useState(false);

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

      <section className="panel-stack">
        <h2>Plans</h2>

        {plans.length === 0 && !isAddingPlan ? (
          <article className="panel">
            <p className="muted">No plans yet for this client.</p>
            <div className="panel-actions">
              <button
                className="secondary-button"
                onClick={() => setIsAddingPlan(true)}
                type="button"
              >
                <Plus size={16} /> Add plan
              </button>
            </div>
          </article>
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
          />
        ))}
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
  const [rows, setRows] = useState<ExerciseRow[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateRow(index: number, field: keyof ExerciseRow, value: string) {
    setRows((current) => {
      const next = [...current];
      next[index] = {
        ...next[index],
        [field]: field === "repeticiones" ? Number(value) || 0 : value,
      };
      return next;
    });
  }

  function addRow() {
    const lastDia = rows.length > 0 ? rows[rows.length - 1].dia : "dia_1";
    setRows((current) => [
      ...current,
      { dia: lastDia, ejercicio: "", repeticiones: 3, peso: "", url_video: "" },
    ]);
  }

  function removeRow(index: number) {
    setRows((current) => current.filter((_, i) => i !== index));
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
        content: rowsToContent(rows),
      });
      onCreated(plan);
    } catch (currentError) {
      setError(currentError instanceof Error ? currentError.message : "Could not create plan.");
    } finally {
      setIsSaving(false);
    }
  }

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
            {rows.map((row, index) => (
              <tr key={index}>
                <td data-label="Día">
                  <input
                    type="text"
                    value={row.dia}
                    placeholder="dia_1"
                    onChange={(event) => updateRow(index, "dia", event.target.value)}
                  />
                </td>
                <td data-label="Ejercicio">
                  <input
                    type="text"
                    value={row.ejercicio}
                    placeholder="Press de banca"
                    onChange={(event) => updateRow(index, "ejercicio", event.target.value)}
                  />
                </td>
                <td data-label="Repeticiones">
                  <input
                    type="number"
                    min={0}
                    value={row.repeticiones}
                    onChange={(event) => updateRow(index, "repeticiones", event.target.value)}
                  />
                </td>
                <td data-label="Peso">
                  <input
                    type="text"
                    value={row.peso}
                    placeholder="70kg"
                    onChange={(event) => updateRow(index, "peso", event.target.value)}
                  />
                </td>
                <td data-label="URL video">
                  <input
                    type="text"
                    value={row.url_video}
                    placeholder="https://..."
                    onChange={(event) => updateRow(index, "url_video", event.target.value)}
                  />
                </td>
                <td className="row-actions">
                  <button
                    className="icon-button"
                    aria-label="Remove exercise"
                    type="button"
                    onClick={() => removeRow(index)}
                  >
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
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
        <button className="secondary-button" onClick={addRow} type="button">
          <Plus size={16} /> Add exercise
        </button>
      </div>

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
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackKind, setFeedbackKind] = useState<"ok" | "error">("ok");

  useEffect(() => {
    setDescription(client.description ?? "");
  }, [client.description]);

  async function save() {
    setFeedback(null);
    setIsSaving(true);
    try {
      const trimmed = description.trim();
      const updated = await updateClient(accessToken, client.id, {
        description: trimmed === "" ? null : trimmed,
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

  const dirty = description.trim() !== (client.description ?? "");

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Notes</h2>
        <span>Goal, history, anything the client needs you to remember.</span>
      </div>

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
}: {
  accessToken: string;
  plan: PlanSummary;
  onSaved: (plan: PlanSummary) => void;
}) {
  const [rows, setRows] = useState<ExerciseRow[]>(() => contentToRows(plan.content));
  const [title, setTitle] = useState(plan.title);
  const [description, setDescription] = useState(plan.description ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackKind, setFeedbackKind] = useState<"ok" | "error">("ok");

  useEffect(() => {
    setRows(contentToRows(plan.content));
    //setTitle(plan.title);
    setDescription(plan.description ?? "");
  }, [plan.content, plan.description, plan.title]);

  function updateRow(index: number, field: keyof ExerciseRow, value: string) {
    setRows((current) => {
      const next = [...current];
      next[index] = {
        ...next[index],
        [field]: field === "repeticiones" ? Number(value) || 0 : value,
      };
      return next;
    });
  }

  function addRow() {
    const lastDay = rows.length > 0 ? rows[rows.length - 1].dia : "dia_1";
    setRows((current) => [
      ...current,
      { dia: lastDay, ejercicio: "", repeticiones: 3, peso: "", url_video: "" },
    ]);
  }

  function removeRow(index: number) {
    setRows((current) => current.filter((_, i) => i !== index));
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
      const content = rowsToContent(rows);
      const trimmedDescription = description.trim();
      const updated = await updatePlan(accessToken, plan.id, {
        title: trimmedTitle,
        content,
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
            {rows.map((row, index) => (
              <tr key={index}>
                <td data-label="Día">
                  <input
                    type="text"
                    value={row.dia}
                    placeholder="dia_1"
                    onChange={(event) => updateRow(index, "dia", event.target.value)}
                  />
                </td>
                <td data-label="Ejercicio">
                  <input
                    type="text"
                    value={row.ejercicio}
                    placeholder="Press de banca"
                    onChange={(event) => updateRow(index, "ejercicio", event.target.value)}
                  />
                </td>
                <td data-label="Repeticiones">
                  <input
                    type="number"
                    min={0}
                    value={row.repeticiones}
                    onChange={(event) => updateRow(index, "repeticiones", event.target.value)}
                  />
                </td>
                <td data-label="Peso">
                  <input
                    type="text"
                    value={row.peso}
                    placeholder="70kg"
                    onChange={(event) => updateRow(index, "peso", event.target.value)}
                  />
                </td>
                <td data-label="URL video">
                  <input
                    type="text"
                    value={row.url_video}
                    placeholder="https://..."
                    onChange={(event) => updateRow(index, "url_video", event.target.value)}
                  />
                </td>
                <td className="row-actions">
                  <button
                    className="icon-button"
                    aria-label="Remove exercise"
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
                <td colSpan={6} className="muted center">
                  No exercises yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="panel-actions">
        <button className="secondary-button" onClick={addRow} type="button">
          <Plus size={16} /> Add exercise
        </button>
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

function contentToRows(content: PlanContent | null | undefined): ExerciseRow[] {
  if (!content) {
    return [];
  }
  const rows: ExerciseRow[] = [];
  const sortedDays = Object.keys(content).sort();
  for (const day of sortedDays) {
    const exercises = content[day];
    if (!Array.isArray(exercises)) {
      continue;
    }
    for (const exercise of exercises) {
      rows.push({
        dia: day,
        ejercicio: exercise.ejercicio ?? "",
        repeticiones: Number(exercise.repeticiones) || 0,
        peso: exercise.peso ?? "",
        url_video: exercise.url_video ?? "",
      });
    }
  }
  return rows;
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
