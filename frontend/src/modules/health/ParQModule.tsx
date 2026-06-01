import { FormEvent, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, HeartPulse, Send } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import {
  AuthUser,
  ParQAnswer,
  ParQAssessment,
  ParQQuestion,
  fetchClientParQList,
  fetchParQQuestions,
  submitParQ,
} from "../../api";

type Props = {
  accessToken: string;
  currentUser: AuthUser;
};

type Draft = Record<string, { answer: "yes" | "no" | ""; follow_up: string }>;

export function ParQModule({ accessToken, currentUser }: Props) {
  const { t, i18n } = useTranslation();
  const [questions, setQuestions] = useState<ParQQuestion[]>([]);
  const [assessments, setAssessments] = useState<ParQAssessment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    setIsLoading(true);
    setError(null);
    try {
      const [qs, list] = await Promise.all([
        fetchParQQuestions(accessToken),
        fetchClientParQList(accessToken, currentUser.id),
      ]);
      setQuestions(qs);
      setAssessments(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("parq.errorLoad"));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, currentUser.id]);

  const pending = useMemo(
    () => assessments.find((a) => a.status === "requested") ?? null,
    [assessments],
  );
  const latestCompleted = useMemo(
    () => assessments.find((a) => a.status === "completed") ?? null,
    [assessments],
  );

  return (
    <section className="module-stack" aria-label={t("parq.ariaLabel")}>
      <header className="module-header">
        <div>
          <h1>{t("parq.title")}</h1>
          <p>{t("parq.subtitle")}</p>
        </div>
      </header>

      {error ? <p className="error-text">{error}</p> : null}
      {isLoading ? <p className="muted">{t("parq.loading")}</p> : null}

      {!isLoading && !pending && assessments.length === 0 ? (
        <section className="panel">
          <p className="muted">{t("parq.noneRequested")}</p>
        </section>
      ) : null}

      {pending ? (
        <ParQForm
          accessToken={accessToken}
          assessment={pending}
          questions={questions}
          onSubmitted={reload}
        />
      ) : null}

      {latestCompleted ? (
        <CompletedSummary assessment={latestCompleted} canEdit={pending !== null} />
      ) : null}

      {assessments.filter((a) => a.status === "completed").length > 1 ? (
        <section className="panel">
          <div className="panel-header">
            <h3>{t("parq.historyHeading")}</h3>
          </div>
          <ul className="parq-history-list">
            {assessments
              .filter((a) => a.status === "completed")
              .slice(1)
              .map((a) => (
                <li key={a.id}>
                  {a.completed_at ? new Date(a.completed_at).toLocaleDateString(i18n.language) : "—"} ·{" "}
                  {a.responses?.any_yes ? t("parq.historyAnyYes") : t("parq.historyNoYes")}
                </li>
              ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
}

function ParQForm({
  accessToken,
  assessment,
  questions,
  onSubmitted,
}: {
  accessToken: string;
  assessment: ParQAssessment;
  questions: ParQQuestion[];
  onSubmitted: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [draft, setDraft] = useState<Draft>(() => {
    const initial: Draft = {};
    for (const q of questions) initial[q.id] = { answer: "", follow_up: "" };
    return initial;
  });
  const [acknowledgement, setAcknowledgement] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    setDraft((current) => {
      const next: Draft = { ...current };
      for (const q of questions) {
        if (!(q.id in next)) next[q.id] = { answer: "", follow_up: "" };
      }
      return next;
    });
  }, [questions]);

  function setAnswer(id: string, answer: "yes" | "no") {
    setDraft((d) => ({ ...d, [id]: { ...d[id], answer } }));
  }

  function setFollowUp(id: string, follow_up: string) {
    setDraft((d) => ({ ...d, [id]: { ...d[id], follow_up } }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    const missing = questions.filter((q) => draft[q.id]?.answer === "");
    if (missing.length > 0) {
      setFormError(t("parq.form.errorMissing", { count: missing.length }));
      return;
    }
    if (!acknowledgement.trim()) {
      setFormError(t("parq.form.errorAcknowledgement"));
      return;
    }

    const answers: ParQAnswer[] = questions.map((q) => {
      const row = draft[q.id];
      return {
        id: q.id,
        text: q.text,
        answer: row.answer as "yes" | "no",
        follow_up: row.answer === "yes" ? row.follow_up.trim() || null : null,
      };
    });

    setSubmitting(true);
    try {
      await submitParQ(accessToken, assessment.id, {
        answers,
        client_acknowledgement: acknowledgement.trim(),
      });
      onSubmitted();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t("parq.form.errorSubmit"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="panel parq-form" onSubmit={handleSubmit}>
      <div className="panel-header">
        <div className="coach-card-header">
          <HeartPulse size={16} />
          <span>{t("parq.form.pendingTitle")}</span>
        </div>
        <span>
          {t("parq.form.requestedOn", {
            date: new Date(assessment.requested_at).toLocaleDateString(i18n.language),
          })}
        </span>
      </div>

      <p className="muted">
        <Trans i18nKey="parq.form.intro">
          Answer honestly. If you answer <strong>yes</strong> to any question, we'll recommend
          consulting a health professional before starting or changing your physical activity.
        </Trans>
      </p>

      <ol className="parq-questions">
        {questions.map((q, index) => (
          <li key={q.id}>
            <p className="parq-question">
              <strong>{index + 1}.</strong> {q.text}
            </p>
            <div className="parq-answer-row">
              <label className="parq-radio">
                <input
                  type="radio"
                  name={q.id}
                  checked={draft[q.id]?.answer === "yes"}
                  onChange={() => setAnswer(q.id, "yes")}
                />
                <span>{t("parq.form.answerYes")}</span>
              </label>
              <label className="parq-radio">
                <input
                  type="radio"
                  name={q.id}
                  checked={draft[q.id]?.answer === "no"}
                  onChange={() => setAnswer(q.id, "no")}
                />
                <span>{t("parq.form.answerNo")}</span>
              </label>
            </div>
            {draft[q.id]?.answer === "yes" ? (
              <label className="field parq-followup">
                <span>{t("parq.form.followUp")}</span>
                <textarea
                  rows={2}
                  value={draft[q.id]?.follow_up ?? ""}
                  onChange={(e) => setFollowUp(q.id, e.target.value)}
                  placeholder={t("parq.form.followUpPlaceholder")}
                />
              </label>
            ) : null}
          </li>
        ))}
      </ol>

      <label className="field">
        <span>{t("parq.form.acknowledgement")}</span>
        <textarea
          rows={2}
          value={acknowledgement}
          placeholder={t("parq.form.acknowledgementPlaceholder")}
          onChange={(e) => setAcknowledgement(e.target.value)}
          required
        />
      </label>

      {formError ? <p className="error-text">{formError}</p> : null}

      <div className="panel-actions">
        <button type="submit" className="primary-button" disabled={submitting}>
          <Send size={16} /> {submitting ? t("parq.form.submitting") : t("parq.form.submit")}
        </button>
      </div>
    </form>
  );
}

function CompletedSummary({
  assessment,
  canEdit,
}: {
  assessment: ParQAssessment;
  canEdit: boolean;
}) {
  const { t, i18n } = useTranslation();
  const yesEntries = assessment.responses?.questions.filter((q) => q.answer === "yes") ?? [];

  return (
    <section className="panel">
      <div className="panel-header">
        <div className="coach-card-header">
          <CheckCircle2 size={16} />
          <span>
            {canEdit ? t("parq.completed.latestTitle") : t("parq.completed.title")}
          </span>
        </div>
        <span>
          {assessment.completed_at
            ? new Date(assessment.completed_at).toLocaleDateString(i18n.language)
            : "—"}
        </span>
      </div>

      {assessment.responses?.any_yes ? (
        <div className="parq-flag">
          <AlertTriangle size={16} />
          <span>
            <Trans i18nKey="parq.completed.flaggedYes">
              You answered <strong>yes</strong> to one or more questions. We recommend consulting a
              health professional before starting or changing your physical activity.
            </Trans>
          </span>
        </div>
      ) : (
        <p className="muted">{t("parq.completed.noYes")}</p>
      )}

      <details className="parq-details">
        <summary>{t("parq.completed.viewAll")}</summary>
        <ol className="parq-readonly">
          {assessment.responses?.questions.map((q, idx) => (
            <li key={q.id}>
              <p>
                <strong>{idx + 1}.</strong> {q.text}
              </p>
              <p className={q.answer === "yes" ? "parq-answer yes" : "parq-answer no"}>
                {q.answer === "yes" ? t("parq.completed.answerYes") : t("parq.completed.answerNo")}
                {q.follow_up ? ` — ${q.follow_up}` : ""}
              </p>
            </li>
          ))}
        </ol>
        {assessment.responses?.client_acknowledgement ? (
          <p className="muted">
            <em>{assessment.responses.client_acknowledgement}</em>
          </p>
        ) : null}
      </details>

      {yesEntries.length > 0 && !assessment.responses?.any_yes ? (
        <p className="muted">{t("parq.completed.yesCountFallback", { count: yesEntries.length })}</p>
      ) : null}
    </section>
  );
}
