import { FormEvent, useEffect, useRef, useState } from "react";
import { Send, Sparkles, Trash2, X } from "lucide-react";
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
      setError(err instanceof Error ? err.message : "Could not send the message.");
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
      setError(err instanceof Error ? err.message : "Could not create the plan.");
      setIsApplying(false);
      setPendingApply(false);
    }
  }

  const dayCount = draftPlan ? Object.keys(draftPlan.content).length : 0;
  const exerciseCount = draftPlan
    ? Object.values(draftPlan.content).reduce((sum, day) => sum + day.length, 0)
    : 0;

  return (
    <section className="panel coach-panel" aria-label="Plan coach chat">
      <div className="panel-header">
        <div className="coach-card-header">
          <Sparkles size={16} />
          <span>Plan coach</span>
        </div>
        <div className="coach-panel-actions">
          {messages.length > 0 ? (
            <button
              type="button"
              className="icon-button"
              onClick={clearConversation}
              aria-label="Clear conversation"
              title="Clear conversation"
              disabled={isSending || isApplying}
            >
              <Trash2 size={16} />
            </button>
          ) : null}
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <ClientContextCard client={client} />

      <div className="chat-log" ref={scrollRef}>
        {messages.length === 0 ? (
          <p className="muted center">
            Start by describing the plan you want — focus, weekly frequency, equipment, any
            limitations. The coach can fill in missing details from {client.full_name}&apos;s profile.
          </p>
        ) : (
          messages.map((msg, index) => (
            <article
              key={index}
              className={`chat-bubble chat-bubble-${msg.role}`}
              aria-label={msg.role === "user" ? "Your message" : "Coach reply"}
            >
              <span className="chat-bubble-role">{msg.role === "user" ? "You" : "Coach"}</span>
              <p>{msg.content}</p>
            </article>
          ))
        )}
        {isSending ? (
          <article className="chat-bubble chat-bubble-assistant pending">
            <span className="chat-bubble-role">Coach</span>
            <p className="muted">Thinking…</p>
          </article>
        ) : null}
      </div>

      {draftPlan ? (
        <div className="plan-draft-card">
          <div className="coach-card-header">
            <Sparkles size={14} />
            <span>Plan ready</span>
          </div>
          <div>
            <strong>{draftPlan.title}</strong>
            {draftPlan.description ? <p className="muted">{draftPlan.description}</p> : null}
            <p className="muted">
              {dayCount} day(s), {exerciseCount} exercise(s)
            </p>
          </div>
          <div className="panel-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() => setDraftPlan(null)}
              disabled={isApplying}
            >
              Discard draft
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={() => setPendingApply(true)}
              disabled={isApplying}
            >
              {isApplying ? "Creating…" : "Apply as new plan"}
            </button>
          </div>
        </div>
      ) : null}

      {error ? <p className="error-text">{error}</p> : null}

      <form className="chat-input" onSubmit={send}>
        <input
          type="text"
          value={input}
          placeholder="Ask the coach or describe the plan…"
          onChange={(e) => setInput(e.target.value)}
          disabled={isSending || isApplying}
        />
        <button
          type="submit"
          className="primary-button"
          disabled={isSending || isApplying || !input.trim()}
          aria-label="Send"
        >
          <Send size={16} />
          Send
        </button>
      </form>

      {pendingApply && draftPlan ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={() => setPendingApply(false)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Create this plan?</h2>
              <button
                type="button"
                className="icon-button"
                onClick={() => setPendingApply(false)}
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>
            <p>
              <strong>{draftPlan.title}</strong>
              <br />
              <span className="muted">
                {dayCount} day(s), {exerciseCount} exercise(s) · status: draft
              </span>
            </p>
            <p className="muted">It will appear in this client&apos;s plans and you can keep editing it.</p>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setPendingApply(false)}
                disabled={isApplying}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={applyPlan}
                disabled={isApplying}
              >
                {isApplying ? "Creating…" : "Create plan"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ClientContextCard({ client }: { client: ClientDetail }) {
  const age = client.birth_date ? computeAge(client.birth_date) : null;
  const measures = client.measures ?? {};
  const peso = measures["peso"];
  const altura = measures["altura"];

  const lines: string[] = [];
  if (age !== null) lines.push(`age ${age}`);
  if (peso !== undefined) lines.push(`${peso} kg`);
  if (altura !== undefined) lines.push(`${altura} cm`);

  return (
    <div className="coach-context">
      <strong>The coach knows:</strong>
      <ul>
        <li>
          {client.full_name}
          {lines.length > 0 ? ` · ${lines.join(" · ")}` : ""}
        </li>
        {client.description ? <li>Goal / notes: {client.description}</li> : null}
      </ul>
      <p className="muted">Override anything by mentioning it in your message.</p>
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
