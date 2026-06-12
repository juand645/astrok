import { FormEvent, useState } from "react";
import { Calculator, X } from "lucide-react";
import { useTranslation } from "react-i18next";

type Props = {
  onClose: () => void;
};

type Unit = "kg" | "lb";

type Calculation = {
  oneRepMax: number;
  unit: Unit;
};

/** Standard %-of-1RM → rep-range chart used in strength programming. The
 *  reps column is conventional (Prilepin-adjacent); the table simply scales
 *  the computed 1RM by each percentage. */
const REP_MAX_TABLE: ReadonlyArray<{ percentage: number; reps: number }> = [
  { percentage: 100, reps: 1 },
  { percentage: 95, reps: 2 },
  { percentage: 90, reps: 4 },
  { percentage: 85, reps: 6 },
  { percentage: 80, reps: 8 },
  { percentage: 75, reps: 10 },
  { percentage: 70, reps: 12 },
  { percentage: 65, reps: 16 },
  { percentage: 60, reps: 20 },
  { percentage: 55, reps: 24 },
  { percentage: 50, reps: 30 },
];

/** Brzycki: 1RM = weight × 36 / (37 − reps). Chosen over Epley because at
 *  reps=1 it returns exactly the input weight (intuitive), and it matches the
 *  conventional %-of-1RM table closely for low-rep work where you actually
 *  use this estimate. Drops to ~10% error past 10 reps — surfaced in the UI. */
function brzyckiOneRepMax(weight: number, reps: number): number {
  if (reps <= 0 || reps >= 37) return NaN;
  return (weight * 36) / (37 - reps);
}

/** Round to the nearest 0.5 of whatever unit so the trainer sees plate-
 *  friendly numbers ("82.5 kg") rather than "82.37 kg". */
function roundHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

export function OneRepMaxModule({ onClose }: Props) {
  const { t } = useTranslation();
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [unit, setUnit] = useState<Unit>("kg");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Calculation | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const w = Number(weight);
    const r = Number(reps);
    if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(r) || r < 1 || r > 30) {
      setError(t("clients.rmCalculator.errorInvalid"));
      setResult(null);
      return;
    }
    const oneRepMax = brzyckiOneRepMax(w, r);
    setResult({ oneRepMax: roundHalf(oneRepMax), unit });
  }

  function handleReset() {
    setWeight("");
    setReps("");
    setError(null);
    setResult(null);
  }

  const unitLabel =
    unit === "kg" ? t("clients.rmCalculator.unitKg") : t("clients.rmCalculator.unitLb");

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div
        className="modal-panel rm-modal-panel"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div className="coach-card-header">
            <Calculator size={18} />
            <h2 style={{ margin: 0 }}>{t("clients.rmCalculator.title")}</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label={t("clients.rmCalculator.close")}
          >
            <X size={16} />
          </button>
        </div>

        <p className="muted">{t("clients.rmCalculator.intro")}</p>

        <form className="rm-form" onSubmit={handleSubmit}>
          <div className="form-grid">
            <label className="field">
              <span>{t("clients.rmCalculator.weight")}</span>
              <div className="rm-weight-row">
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={0.5}
                  value={weight}
                  onChange={(event) => setWeight(event.target.value)}
                  required
                  autoFocus
                />
                <select
                  value={unit}
                  onChange={(event) => setUnit(event.target.value as Unit)}
                  aria-label="unit"
                >
                  <option value="kg">{t("clients.rmCalculator.unitKg")}</option>
                  <option value="lb">{t("clients.rmCalculator.unitLb")}</option>
                </select>
              </div>
            </label>
            <label className="field">
              <span>{t("clients.rmCalculator.reps")}</span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={30}
                step={1}
                value={reps}
                onChange={(event) => setReps(event.target.value)}
                required
              />
            </label>
          </div>

          {error ? <p className="error-text">{error}</p> : null}

          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={handleReset}>
              {t("clients.rmCalculator.reset")}
            </button>
            <button type="submit" className="primary-button">
              <Calculator size={16} /> {t("clients.rmCalculator.calculate")}
            </button>
          </div>
        </form>

        {result ? (
          <section className="rm-result">
            <h3 className="rm-result-headline">
              {t("clients.rmCalculator.result", {
                weight: result.oneRepMax,
                unit: unitLabel,
              })}
            </h3>
            <p className="muted">{t("clients.rmCalculator.resultHint")}</p>

            <div className="table-wrap">
              <table className="detail-table">
                <thead>
                  <tr>
                    <th>{t("clients.rmCalculator.tablePercentage")}</th>
                    <th>{t("clients.rmCalculator.tableWeight")}</th>
                    <th>{t("clients.rmCalculator.tableReps")}</th>
                  </tr>
                </thead>
                <tbody>
                  {REP_MAX_TABLE.map((row) => {
                    const targetWeight = roundHalf(
                      (result.oneRepMax * row.percentage) / 100,
                    );
                    return (
                      <tr key={row.percentage}>
                        <td data-label={t("clients.rmCalculator.tablePercentage")}>
                          {row.percentage}%
                        </td>
                        <td data-label={t("clients.rmCalculator.tableWeight")}>
                          {targetWeight} {unitLabel}
                        </td>
                        <td data-label={t("clients.rmCalculator.tableReps")}>
                          {row.reps}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
