import { useEffect, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { recordMeasurement } from "../../api";
import {
  MeasureRow,
  computeMeasuresChanges,
  measuresToRows,
} from "./clientDetailUtils";

type Props = {
  accessToken: string;
  clientId: number;
  initialMeasures: Record<string, number | string>;
  onSaved: (measures: Record<string, number | string>) => void;
};

export function MeasuresPanel({ accessToken, clientId, initialMeasures, onSaved }: Props) {
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
