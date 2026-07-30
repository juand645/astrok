import { useEffect, useMemo, useState } from "react";
import { Dumbbell } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { WorkoutSession, fetchSessions } from "../../api";

type Props = {
  accessToken: string;
  clientId: number;
};

type Metric = "e1rm" | "weight";

type ExercisePoint = {
  /** Milliseconds since epoch for the session date — recharts needs numeric x for scale="time". */
  t: number;
  iso: string;
  weight: number;
  reps: number;
  e1rm: number;
};

type ExerciseSeries = {
  /** First-seen casing, used as the human label in the dropdown. */
  name: string;
  points: ExercisePoint[];
};

/** Parse free-form weight strings ("70", "70.5", "70 kg", "70-72") to the
 *  leading positive number. Anything we can't read becomes null. */
function parsePeso(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return raw;
  if (typeof raw !== "string") return null;
  const match = raw.replace(",", ".").match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const value = Number(match[0]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Brzycki 1RM estimate. Clamped to the formula's useful domain (1–30 reps);
 *  outside that, we just return the raw weight so the chart doesn't spike. */
function brzycki(weight: number, reps: number): number {
  if (reps < 1) return weight;
  if (reps > 30) return weight;
  return (weight * 36) / (37 - reps);
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

function buildExerciseIndex(sessions: WorkoutSession[]): Map<string, ExerciseSeries> {
  const index = new Map<string, ExerciseSeries>();
  for (const session of sessions) {
    const date = new Date(session.session_date);
    const t = date.getTime();
    if (!Number.isFinite(t)) continue;
    for (const entry of session.performance ?? []) {
      const label = entry.ejercicio?.trim();
      if (!label) continue;
      const weight = parsePeso(entry.peso);
      const reps = Number(entry.repeticiones);
      if (weight === null || !Number.isFinite(reps) || reps < 1) continue;
      const key = normalizeName(label);
      let series = index.get(key);
      if (!series) {
        series = { name: label, points: [] };
        index.set(key, series);
      }
      series.points.push({
        t,
        iso: session.session_date,
        weight,
        reps,
        e1rm: brzycki(weight, reps),
      });
    }
  }
  for (const series of index.values()) {
    series.points.sort((a, b) => a.t - b.t);
  }
  return index;
}

function formatNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function ExerciseProgressionPanel({ accessToken, clientId }: Props) {
  const { t, i18n } = useTranslation();
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>("");
  const [metric, setMetric] = useState<Metric>("e1rm");

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    fetchSessions(accessToken, clientId)
      .then((rows) => {
        if (!cancelled) setSessions(rows);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : t("clients.exerciseProgression.errorLoad"),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, clientId, t]);

  const index = useMemo(() => buildExerciseIndex(sessions), [sessions]);

  const exerciseList = useMemo(() => {
    return [...index.entries()]
      .map(([key, series]) => ({ key, name: series.name, count: series.points.length }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [index]);

  // Auto-pick the most-logged exercise once data lands, or fall back to the
  // first available if the previously selected one disappeared from the data.
  useEffect(() => {
    if (exerciseList.length === 0) {
      if (selected !== "") setSelected("");
      return;
    }
    if (!selected || !exerciseList.some((e) => e.key === selected)) {
      setSelected(exerciseList[0].key);
    }
  }, [exerciseList, selected]);

  function formatDateAxis(value: number): string {
    return new Date(value).toLocaleDateString(i18n.language, {
      month: "short",
      day: "numeric",
    });
  }
  function formatTooltipDate(value: number): string {
    return new Date(value).toLocaleDateString(i18n.language, { dateStyle: "medium" });
  }

  if (isLoading) {
    return (
      <section className="panel">
        <p className="muted">{t("clients.exerciseProgression.loading")}</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="panel">
        <p className="error-text">{error}</p>
      </section>
    );
  }

  if (exerciseList.length === 0) {
    return (
      <section className="panel">
        <div className="panel-header">
          <div className="coach-card-header">
            <Dumbbell size={16} />
            <span>{t("clients.exerciseProgression.heading")}</span>
          </div>
        </div>
        <p className="muted">{t("clients.exerciseProgression.empty")}</p>
      </section>
    );
  }

  const selectedSeries = index.get(selected);
  const points = selectedSeries?.points ?? [];
  const chartData = points.map((p) => ({
    t: p.t,
    value: metric === "e1rm" ? p.e1rm : p.weight,
    weight: p.weight,
    reps: p.reps,
  }));

  const metricLabel =
    metric === "e1rm"
      ? t("clients.exerciseProgression.metricE1rm")
      : t("clients.exerciseProgression.metricWeight");

  const latest = points[points.length - 1];
  const previous = points.length > 1 ? points[points.length - 2] : null;
  const latestValue = latest
    ? metric === "e1rm"
      ? latest.e1rm
      : latest.weight
    : null;
  const previousValue = previous
    ? metric === "e1rm"
      ? previous.e1rm
      : previous.weight
    : null;
  const delta =
    latestValue !== null && previousValue !== null ? latestValue - previousValue : null;

  return (
    <section className="panel-stack">
      <header className="section-header">
        <h2>{t("clients.exerciseProgression.heading")}</h2>
        <span className="muted">{t("clients.exerciseProgression.hint")}</span>
      </header>

      <article className="trend-card progression-card">
        <div className="progression-controls">
          <label className="progression-control">
            <span className="form-label">
              {t("clients.exerciseProgression.exerciseLabel")}
            </span>
            <select value={selected} onChange={(e) => setSelected(e.target.value)}>
              {exerciseList.map((ex) => (
                <option key={ex.key} value={ex.key}>
                  {ex.name}{" "}
                  {t("clients.exerciseProgression.entryCount", { count: ex.count })}
                </option>
              ))}
            </select>
          </label>

          <fieldset className="progression-metric">
            <legend className="form-label">
              {t("clients.exerciseProgression.metricLabel")}
            </legend>
            <label>
              <input
                type="radio"
                name={`exprog-metric-${clientId}`}
                value="e1rm"
                checked={metric === "e1rm"}
                onChange={() => setMetric("e1rm")}
              />
              <span>{t("clients.exerciseProgression.metricE1rm")}</span>
            </label>
            <label>
              <input
                type="radio"
                name={`exprog-metric-${clientId}`}
                value="weight"
                checked={metric === "weight"}
                onChange={() => setMetric("weight")}
              />
              <span>{t("clients.exerciseProgression.metricWeight")}</span>
            </label>
          </fieldset>
        </div>

        {points.length < 2 ? (
          <p className="muted">
            {t("clients.exerciseProgression.notEnoughData")}
          </p>
        ) : (
          <>
            <div className="progression-summary">
              <div>
                <span className="muted form-label">{metricLabel}</span>
                <div className="trend-card-value">
                  {latestValue !== null ? formatNumber(latestValue) : "—"}
                </div>
              </div>
              {delta !== null ? (
                <div className="muted">
                  {delta >= 0 ? "+" : "−"}
                  {formatNumber(Math.abs(delta))}{" "}
                  {t("clients.exerciseProgression.vsPrevious")}
                </div>
              ) : null}
            </div>

            <div className="trend-card-chart">
              <ResponsiveContainer width="100%" height={260}>
                <LineChart
                  data={chartData}
                  margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
                >
                  <CartesianGrid
                    stroke="#e2e8e0"
                    strokeDasharray="3 3"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="t"
                    type="number"
                    scale="time"
                    domain={["dataMin", "dataMax"]}
                    tickFormatter={formatDateAxis}
                    stroke="#657269"
                    fontSize={11}
                    tickMargin={6}
                  />
                  <YAxis
                    stroke="#657269"
                    fontSize={11}
                    width={36}
                    domain={["auto", "auto"]}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload || payload.length === 0) return null;
                      const p = payload[0].payload as {
                        value: number;
                        weight: number;
                        reps: number;
                      };
                      return (
                        <div
                          style={{
                            background: "#ffffff",
                            border: "1px solid #dfe6da",
                            borderRadius: 6,
                            fontSize: 13,
                            padding: "6px 8px",
                            lineHeight: 1.4,
                          }}
                        >
                          <div style={{ color: "#657269", fontSize: 12 }}>
                            {formatTooltipDate(Number(label))}
                          </div>
                          <div>
                            <strong>{formatNumber(p.value)}</strong>{" "}
                            <span style={{ color: "#657269" }}>{metricLabel}</span>
                          </div>
                          <div style={{ color: "#657269", fontSize: 12 }}>
                            {t("clients.exerciseProgression.tooltipSet", {
                              weight: formatNumber(p.weight),
                              reps: p.reps,
                            })}
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="var(--gym-brand-color)"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "var(--gym-brand-color)" }}
                    activeDot={{ r: 5 }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </article>
    </section>
  );
}
