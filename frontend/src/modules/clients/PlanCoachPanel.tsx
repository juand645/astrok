import { FormEvent, useEffect, useRef, useState } from "react";
import { Send, Sparkles, Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  ChatMessage,
  ClientDetail,
  PlanContent,
  PlanDraft,
  PlanSummary,
  createPlan,
  sendCoachChatTurn,
} from "../../api";

type Props = {
  accessToken: string;
  client: ClientDetail;
  onPlanCreated: (plan: PlanSummary) => void;
  onClose: () => void;
};

export function PlanCoachPanel({ accessToken, client, onPlanCreated, onClose }: Props) {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftPlan, setDraftPlan] = useState<PlanDraft | null>(null);
  const [pendingApply, setPendingApply] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isSending]);

  async function send(event?: FormEvent) {
    event?.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isSending) return;

    const next: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setInput("");
    setError(null);
    setIsSending(true);

    try {
      const response = await sendCoachChatTurn(accessToken, client.id, next);
      setMessages((current) => [...current, response.message]);
      if (response.plan) {
        setDraftPlan(response.plan);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("clients.coach.errorSend"));
    } finally {
      setIsSending(false);
    }
  }

  function clearConversation() {
    setMessages([]);
    setDraftPlan(null);
    setError(null);
  }

  async function applyPlan() {
    if (!draftPlan) return;
    setIsApplying(true);
    setError(null);
    try {
      const wrapped: PlanContent = {};
      for (const [day, exercises] of Object.entries(draftPlan.content)) {
        wrapped[day] = [{ series: 3, exercises }];
      }
      const created = await createPlan(accessToken, {
        client_id: client.id,
        title: draftPlan.title,
        description: draftPlan.description ?? null,
        content: wrapped,
        status: "draft",
      });
      onPlanCreated(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("clients.coach.errorCreate"));
      setIsApplying(false);
      setPendingApply(false);
    }
  }

  const dayCount = draftPlan ? Object.keys(draftPlan.content).length : 0;
  const exerciseCount = draftPlan
    ? Object.values(draftPlan.content).reduce((sum, day) => sum + day.length, 0)
    : 0;

  return (
    <section className="panel coach-panel" aria-label={t("clients.coach.ariaLabel")}>
      <div className="panel-header">
        <div className="coach-card-header">
          <Sparkles size={16} />
          <span>{t("clients.coach.heading")}</span>
        </div>
        <div className="coach-panel-actions">
          {messages.length > 0 ? (
            <button
              type="button"
              className="icon-button"
              onClick={clearConversation}
              aria-label={t("clients.coach.clearConversation")}
              title={t("clients.coach.clearConversation")}
              disabled={isSending || isApplying}
            >
              <Trash2 size={16} />
            </button>
          ) : null}
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label={t("common.close")}
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <ClientContextCard client={client} />

      <div className="chat-log" ref={scrollRef}>
        {messages.length === 0 ? (
          <p className="muted center">
            {t("clients.coach.starterHint", { name: client.full_name })}
          </p>
        ) : (
          messages.map((msg, index) => (
            <article
              key={index}
              className={`chat-bubble chat-bubble-${msg.role}`}
              aria-label={msg.role === "user" ? t("clients.coach.yourMessage") : t("clients.coach.coachReply")}
            >
              <span className="chat-bubble-role">
                {msg.role === "user" ? t("clients.coach.you") : t("clients.coach.coach")}
              </span>
              <p>{msg.content}</p>
            </article>
          ))
        )}
        {isSending ? (
          <article className="chat-bubble chat-bubble-assistant pending">
            <span className="chat-bubble-role">{t("clients.coach.coach")}</span>
            <p className="muted">{t("clients.coach.thinking")}</p>
          </article>
        ) : null}
      </div>

      {draftPlan ? (
        <div className="plan-draft-card">
          <div className="coach-card-header">
            <Sparkles size={14} />
            <span>{t("clients.coach.planReady")}</span>
          </div>
          <div>
            <strong>{draftPlan.title}</strong>
            {draftPlan.description ? <p className="muted">{draftPlan.description}</p> : null}
            <p className="muted">
              {t("clients.coach.planMeta", { days: dayCount, exercises: exerciseCount })}
            </p>
          </div>
          <div className="panel-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() => setDraftPlan(null)}
              disabled={isApplying}
            >
              {t("clients.coach.discardDraft")}
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={() => setPendingApply(true)}
              disabled={isApplying}
            >
              {isApplying ? t("clients.coach.applying") : t("clients.coach.applyAsNewPlan")}
            </button>
          </div>
        </div>
      ) : null}

      {error ? <p className="error-text">{error}</p> : null}

      <form className="chat-input" onSubmit={send}>
        <input
          type="text"
          value={input}
          placeholder={t("clients.coach.inputPlaceholder")}
          onChange={(e) => setInput(e.target.value)}
          disabled={isSending || isApplying}
        />
        <button
          type="submit"
          className="primary-button"
          disabled={isSending || isApplying || !input.trim()}
          aria-label={t("clients.coach.send")}
        >
          <Send size={16} />
          {t("clients.coach.send")}
        </button>
      </form>

      {pendingApply && draftPlan ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={() => setPendingApply(false)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{t("clients.coach.confirmTitle")}</h2>
              <button
                type="button"
                className="icon-button"
                onClick={() => setPendingApply(false)}
                aria-label={t("common.close")}
              >
                <X size={16} />
              </button>
            </div>
            <p>
              <strong>{draftPlan.title}</strong>
              <br />
              <span className="muted">
                {t("clients.coach.planMetaStatus", { days: dayCount, exercises: exerciseCount })}
              </span>
            </p>
            <p className="muted">{t("clients.coach.confirmHint")}</p>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setPendingApply(false)}
                disabled={isApplying}
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={applyPlan}
                disabled={isApplying}
              >
                {isApplying ? t("clients.coach.applying") : t("clients.coach.confirmCreate")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ClientContextCard({ client }: { client: ClientDetail }) {
  const { t } = useTranslation();
  const age = client.birth_date ? computeAge(client.birth_date) : null;
  const measures = client.measures ?? {};
  const peso = measures["peso"];
  const altura = measures["altura"];

  const lines: string[] = [];
  if (age !== null) lines.push(t("clients.coach.ageWithValue", { value: age }));
  if (peso !== undefined) lines.push(`${peso} kg`);
  if (altura !== undefined) lines.push(`${altura} cm`);

  return (
    <div className="coach-context">
      <strong>{t("clients.coach.contextKnows")}</strong>
      <ul>
        <li>
          {client.full_name}
          {lines.length > 0 ? ` · ${lines.join(" · ")}` : ""}
        </li>
        {client.description ? (
          <li>{t("clients.coach.contextGoal", { value: client.description })}</li>
        ) : null}
      </ul>
      <p className="muted">{t("clients.coach.contextHint")}</p>
    </div>
  );
}

function computeAge(isoDate: string): number | null {
  const birth = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age;
}
