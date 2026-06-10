import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, History } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Measurement, fetchClientMeasurements } from "../../api";

type Props = {
  accessToken: string;
  clientId: number;
  /** Bumped by the parent after each successful save in MeasuresPanel; the
   *  effect re-fetches when this changes so the new row appears immediately. */
  reloadKey: number;
};

export function MeasuresHistoryPanel({ accessToken, clientId, reloadKey }: Props) {
  const { t, i18n } = useTranslation();
  const [history, setHistory] = useState<Measurement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

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
          setError(err instanceof Error ? err.message : t("clients.measuresHistory.errorLoad"));
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, clientId, reloadKey, t]);

  return (
    <section className="panel">
      <div className="panel-header">
        <div className="coach-card-header">
          <History size={16} />
          <span>{t("clients.measuresHistory.heading")}</span>
        </div>
        <button
          type="button"
          className="ghost-button"
          onClick={() => setIsExpanded((value) => !value)}
          aria-expanded={isExpanded}
        >
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          {isExpanded ? t("clients.measuresHistory.hide") : t("clients.measuresHistory.show")}
          {history.length > 0 ? ` (${history.length})` : ""}
        </button>
      </div>

      <span className="muted">{t("clients.measuresHistory.hint")}</span>

      {isExpanded ? (
        <>
          {error ? <p className="error-text">{error}</p> : null}
          {isLoading ? (
            <p className="muted">{t("clients.measuresHistory.loading")}</p>
          ) : history.length === 0 ? (
            <p className="muted">{t("clients.measuresHistory.empty")}</p>
          ) : (
            <ul className="measure-history-list">
              {history.map((entry) => (
                <li key={entry.id} className="measure-history-entry">
                  <div className="measure-history-meta">
                    <strong>
                      {t("clients.measuresHistory.recordedOn", {
                        datetime: new Date(entry.recorded_at).toLocaleString(i18n.language, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }),
                      })}
                    </strong>
                  </div>
                  {Object.keys(entry.measures).length > 0 ? (
                    <ul className="measure-history-fields">
                      {Object.entries(entry.measures).map(([key, value]) => (
                        <li key={key}>
                          <span className="muted">{key}:</span>{" "}
                          <strong>{String(value)}</strong>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {entry.notes ? (
                    <p className="muted measure-history-notes">
                      <em>{t("clients.measuresHistory.notesLabel")}</em> {entry.notes}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </section>
  );
}
