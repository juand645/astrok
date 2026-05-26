import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Eye, HeartPulse, Plus, X } from "lucide-react";
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
      setError(err instanceof Error ? err.message : "Could not load PAR-Q.");
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
      setError(err instanceof Error ? err.message : "Could not enable PAR-Q.");
    } finally {
      setIsEnabling(false);
    }
  }

  const enableLabel =
    latestCompleted && !pending ? "Enable new PAR-Q" : "Enable PAR-Q";

  return (
    <section className="panel">
      <div className="panel-header">
        <div className="coach-card-header">
          <HeartPulse size={16} />
          <span>Health screening</span>
        </div>
        {!pending && !isLoading ? (
          <button
            type="button"
            className="secondary-button"
            onClick={handleEnable}
            disabled={isEnabling}
          >
            <Plus size={16} /> {isEnabling ? "Enabling…" : enableLabel}
          </button>
        ) : null}
      </div>

      {error ? <p className="error-text">{error}</p> : null}

      {isLoading ? <p className="muted">Loading…</p> : null}

      {!isLoading && !pending && !latestCompleted ? (
        <p className="muted">
          No PAR-Q on record. Enable one when this client should complete a health screening.
        </p>
      ) : null}

      {pending ? (
        <div className="parq-status-row">
          <span className="status-pill status-review">Awaiting client</span>
          <span className="muted">
            Sent {new Date(pending.requested_at).toLocaleDateString()}
          </span>
        </div>
      ) : null}

      {latestCompleted ? (
        <div className="parq-status-row">
          {latestCompleted.responses?.any_yes ? (
            <span className="status-pill status-review parq-warning">
              <AlertTriangle size={14} /> Medical clearance recommended
            </span>
          ) : (
            <span className="status-pill status-approved">
              <CheckCircle2 size={14} /> Cleared
            </span>
          )}
          <span className="muted">
            Completed{" "}
            {latestCompleted.completed_at
              ? new Date(latestCompleted.completed_at).toLocaleDateString()
              : "—"}
          </span>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setReviewing(latestCompleted)}
          >
            <Eye size={16} /> View responses
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
  const responses = assessment.responses;
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal-panel parq-review-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>PAR-Q responses</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <p className="muted">
          Completed{" "}
          {assessment.completed_at
            ? new Date(assessment.completed_at).toLocaleString()
            : "—"}
        </p>

        {responses?.any_yes ? (
          <div className="parq-flag">
            <AlertTriangle size={16} />
            <span>
              Client answered <strong>yes</strong> to one or more questions. Medical
              clearance is recommended before training.
            </span>
          </div>
        ) : (
          <p className="muted">All answers were "no" — no flags raised.</p>
        )}

        <ol className="parq-readonly">
          {responses?.questions.map((q, idx) => (
            <li key={q.id}>
              <p>
                <strong>{idx + 1}.</strong> {q.text}
              </p>
              <p className={q.answer === "yes" ? "parq-answer yes" : "parq-answer no"}>
                {q.answer === "yes" ? "Sí" : "No"}
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
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
