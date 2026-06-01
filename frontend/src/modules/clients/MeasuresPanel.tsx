import { useEffect, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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
      setFeedback(t("clients.measures.noChanges"));
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
      if (changed && dropped) {
        setFeedback(t("clients.measures.savedBoth", { changed, removed: dropped }));
      } else if (changed) {
        setFeedback(t("clients.measures.savedChanges", { count: changed }));
      } else {
        setFeedback(t("clients.measures.savedRemoved", { count: dropped }));
      }
    } catch (currentError) {
      setFeedbackKind("error");
      setFeedback(currentError instanceof Error ? currentError.message : t("clients.measures.errorSave"));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>{t("clients.measures.heading")}</h2>
        <span>{t("clients.measures.hint")}</span>
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
            {rows.map((row, index) => (
              <tr key={index}>
                <td data-label={t("clients.measures.fieldHeader")}>
                  <input
                    type="text"
                    value={row.key}
                    placeholder={t("clients.measures.keyPlaceholder")}
                    onChange={(event) => updateRow(index, "key", event.target.value)}
                  />
                </td>
                <td data-label={t("clients.measures.valueHeader")}>
                  <input
                    type="text"
                    value={row.value}
                    placeholder={t("clients.measures.valuePlaceholder")}
                    onChange={(event) => updateRow(index, "value", event.target.value)}
                  />
                </td>
                <td className="row-actions">
                  <button
                    className="icon-button"
                    aria-label={t("clients.measures.removeRow")}
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
                  {t("clients.measures.empty")}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="panel-actions">
        <button className="secondary-button" onClick={addRow} type="button">
          <Plus size={16} /> {t("clients.measures.addRow")}
        </button>
        <button className="primary-button" onClick={save} disabled={isSaving} type="button">
          <Save size={16} /> {isSaving ? t("clients.measures.saving") : t("clients.measures.save")}
        </button>
      </div>
      {feedback ? (
        <p className={feedbackKind === "ok" ? "muted" : "error-text"}>{feedback}</p>
      ) : null}
    </section>
  );
}
