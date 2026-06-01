import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Eye, HeartPulse, Plus, X } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import {
  ParQAssessment,
  enableParQ,
  fetchClientParQList,
} from "../../api";

type Props = {
  accessToken: string;
  clientId: number;
};

export function HealthScreeningCard({ accessToken, clientId }: Props) {
  const { t, i18n } = useTranslation();
  const [assessments, setAssessments] = useState<ParQAssessment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEnabling, setIsEnabling] = useState(false);
  const [reviewing, setReviewing] = useState<ParQAssessment | null>(null);

  async function reload() {
    setIsLoading(true);
    setError(null);
    try {
      const list = await fetchClientParQList(accessToken, clientId);
      setAssessments(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("clients.health.errorLoad"));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, clientId]);

  const pending = useMemo(
    () => assessments.find((a) => a.status === "requested") ?? null,
    [assessments],
  );
  const latestCompleted = useMemo(
    () => assessments.find((a) => a.status === "completed") ?? null,
    [assessments],
  );

  async function handleEnable() {
    setError(null);
    setIsEnabling(true);
    try {
      await enableParQ(accessToken, clientId);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("clients.health.errorEnable"));
    } finally {
      setIsEnabling(false);
    }
  }

  const enableLabel =
    latestCompleted && !pending ? t("clients.health.enableNew") : t("clients.health.enable");

  return (
    <section className="panel">
      <div className="panel-header">
        <div className="coach-card-header">
          <HeartPulse size={16} />
          <span>{t("clients.health.heading")}</span>
        </div>
        {!pending && !isLoading ? (
          <button
            type="button"
            className="secondary-button"
            onClick={handleEnable}
            disabled={isEnabling}
          >
            <Plus size={16} /> {isEnabling ? t("clients.health.enabling") : enableLabel}
          </button>
        ) : null}
      </div>

      {error ? <p className="error-text">{error}</p> : null}

      {isLoading ? <p className="muted">{t("clients.health.loading")}</p> : null}

      {!isLoading && !pending && !latestCompleted ? (
        <p className="muted">{t("clients.health.empty")}</p>
      ) : null}

      {pending ? (
        <div className="parq-status-row">
          <span className="status-pill status-review">{t("clients.health.awaitingClient")}</span>
          <span className="muted">
            {t("clients.health.sentOn", {
              date: new Date(pending.requested_at).toLocaleDateString(i18n.language),
            })}
          </span>
        </div>
      ) : null}

      {latestCompleted ? (
        <div className="parq-status-row">
          {latestCompleted.responses?.any_yes ? (
            <span className="status-pill status-review parq-warning">
              <AlertTriangle size={14} /> {t("clients.health.clearanceRecommended")}
            </span>
          ) : (
            <span className="status-pill status-approved">
              <CheckCircle2 size={14} /> {t("clients.health.cleared")}
            </span>
          )}
          <span className="muted">
            {t("clients.health.completedOn", {
              date: latestCompleted.completed_at
                ? new Date(latestCompleted.completed_at).toLocaleDateString(i18n.language)
                : "—",
            })}
          </span>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setReviewing(latestCompleted)}
          >
            <Eye size={16} /> {t("clients.health.viewResponses")}
          </button>
        </div>
      ) : null}

      {reviewing ? (
        <ParQReviewModal assessment={reviewing} onClose={() => setReviewing(null)} />
      ) : null}
    </section>
  );
}

function ParQReviewModal({
  assessment,
  onClose,
}: {
  assessment: ParQAssessment;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const responses = assessment.responses;
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal-panel parq-review-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{t("clients.health.responsesTitle")}</h2>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label={t("common.close")}
          >
            <X size={16} />
          </button>
        </div>
        <p className="muted">
          {t("clients.health.completedAt", {
            datetime: assessment.completed_at
              ? new Date(assessment.completed_at).toLocaleString(i18n.language)
              : "—",
          })}
        </p>

        {responses?.any_yes ? (
          <div className="parq-flag">
            <AlertTriangle size={16} />
            <span>
              <Trans i18nKey="clients.health.flaggedYes">
                Client answered <strong>yes</strong> to one or more questions. Medical clearance is
                recommended before training.
              </Trans>
            </span>
          </div>
        ) : (
          <p className="muted">{t("clients.health.allNo")}</p>
        )}

        <ol className="parq-readonly">
          {responses?.questions.map((q, idx) => (
            <li key={q.id}>
              <p>
                <strong>{idx + 1}.</strong> {q.text}
              </p>
              <p className={q.answer === "yes" ? "parq-answer yes" : "parq-answer no"}>
                {q.answer === "yes" ? t("clients.health.answerYes") : t("clients.health.answerNo")}
                {q.follow_up ? ` — ${q.follow_up}` : ""}
              </p>
            </li>
          ))}
        </ol>

        {responses?.client_acknowledgement ? (
          <p className="muted">
            <em>"{responses.client_acknowledgement}"</em>
          </p>
        ) : null}

        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            {t("common.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
