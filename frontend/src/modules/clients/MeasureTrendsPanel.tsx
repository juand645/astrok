import { useEffect, useMemo, useState } from "react";
import { LineChart as LineChartIcon, TrendingDown, TrendingUp, Minus } from "lucide-react";
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
import { Measurement, fetchClientMeasurements } from "../../api";

type Props = {
  accessToken: string;
  clientId: number;
};

type Point = {
  /** Milliseconds since epoch — recharts needs a numeric x for scale="time" */
  t: number;
  /** ISO string for the tooltip's human-readable label */
  iso: string;
  value: number;
};

type Series = {
  key: string;
  points: Point[];
  current: number;
  previous: number;
  delta: number;
  /** Delta as a percentage of the previous reading. Useful when raw deltas
   *  are unitless to the reader ("82.5" vs "82" → 0.6% is small). */
  deltaPct: number;
};

/** Coerce a measurement value to a finite number. Strings like "62.5" become
 *  62.5; non-numeric strings ("recovered", "yes") are filtered out so they
 *  don't appear as 0-line entries on the chart. */
function numericValue(raw: number | string): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const parsed = Number(raw.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/** Group the history into per-key time series, dropping any key that has
 *  fewer than two numeric readings (you can't draw a trend from one point). */
function buildSeries(history: Measurement[]): Series[] {
  const byKey = new Map<string, Point[]>();
  // History is newest-first from the API; chart wants oldest-first.
  for (const entry of [...history].reverse()) {
    const date = new Date(entry.recorded_at);
    const t = date.getTime();
    if (!Number.isFinite(t)) continue;
    for (const [key, raw] of Object.entries(entry.measures)) {
      const value = numericValue(raw);
      if (value === null) continue;
      const list = byKey.get(key) ?? [];
      list.push({ t, iso: entry.recorded_at, value });
      byKey.set(key, list);
    }
  }

  const series: Series[] = [];
  for (const [key, points] of byKey) {
    if (points.length < 2) continue;
    const current = points[points.length - 1].value;
    const previous = points[points.length - 2].value;
    const delta = current - previous;
    const deltaPct = previous === 0 ? 0 : (delta / previous) * 100;
    series.push({ key, points, current, previous, delta, deltaPct });
  }
  // Stable, friendly order — keys with more data first, alphabetical as tiebreak.
  series.sort(
    (a, b) => b.points.length - a.points.length || a.key.localeCompare(b.key),
  );
  return series;
}

function formatNumber(n: number): string {
  // Trim trailing .0 for whole numbers so "62" reads as "62", not "62.0".
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function formatSigned(n: number): string {
  if (n === 0) return "0";
  return n > 0 ? `+${formatNumber(n)}` : `−${formatNumber(Math.abs(n))}`;
}

export function MeasureTrendsPanel({ accessToken, clientId }: Props) {
  const { t, i18n } = useTranslation();
  const [history, setHistory] = useState<Measurement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    fetchClientMeasurements(accessToken, clientId)
      .then((rows) => {
        if (!cancelled) setHistory(rows);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : t("clients.measuresTrends.errorLoad"),
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

  const series = useMemo(() => buildSeries(history), [history]);

  function formatDateAxis(value: number): string {
    return new Date(value).toLocaleDateString(i18n.language, {
      month: "short",
      day: "numeric",
    });
  }
  function formatTooltipDate(value: number): string {
    return new Date(value).toLocaleDateString(i18n.language, {
      dateStyle: "medium",
    });
  }

  if (isLoading) {
    return (
      <section className="panel">
        <p className="muted">{t("clients.measuresTrends.loading")}</p>
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

  if (series.length === 0) {
    return (
      <section className="panel">
        <div className="panel-header">
          <div className="coach-card-header">
            <LineChartIcon size={16} />
            <span>{t("clients.measuresTrends.heading")}</span>
          </div>
        </div>
        <p className="muted">{t("clients.measuresTrends.empty")}</p>
      </section>
    );
  }

  return (
    <section className="panel-stack">
      <header className="section-header">
        <h2>{t("clients.measuresTrends.heading")}</h2>
        <span className="muted">{t("clients.measuresTrends.hint")}</span>
      </header>

      <div className="trends-grid">
        {series.map((s) => {
          const arrow =
            s.delta === 0 ? <Minus size={14} /> : s.delta > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />;
          return (
            <article className="trend-card" key={s.key}>
              <div className="trend-card-head">
                <h3 className="trend-card-title">{s.key}</h3>
                <div className="trend-card-value">{formatNumber(s.current)}</div>
                <div className="trend-card-delta muted">
                  {arrow}
                  <span>
                    {formatSigned(s.delta)}
                    {s.previous !== 0 ? ` (${formatSigned(s.deltaPct)}%)` : ""}
                  </span>
                </div>
                <span className="muted trend-card-subtle">
                  {t("clients.measuresTrends.readingCount", { count: s.points.length })}
                </span>
              </div>

              <div className="trend-card-chart">
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart
                    data={s.points}
                    margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid stroke="#e2e8e0" strokeDasharray="3 3" vertical={false} />
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
                      formatter={(v) => [formatNumber(Number(v)), s.key]}
                      labelFormatter={(label) => formatTooltipDate(Number(label))}
                      contentStyle={{
                        background: "#ffffff",
                        border: "1px solid #dfe6da",
                        borderRadius: 6,
                        fontSize: 13,
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
            </article>
          );
        })}
      </div>
    </section>
  );
}
