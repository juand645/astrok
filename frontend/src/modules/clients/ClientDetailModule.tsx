import { useEffect, useState } from "react";
import { ArrowLeft, IdCard, Mail, Phone, Plus, Sparkles } from "lucide-react";
import {
  ClientDetail,
  PlanSummary,
  fetchClientDetail,
  fetchClientPlans,
} from "../../api";
import { AddPlanForm } from "./AddPlanForm";
import { ClientHeaderActions } from "./ClientHeaderActions";
import { ClientNotesPanel } from "./ClientNotesPanel";
import { HealthScreeningCard } from "./HealthScreeningCard";
import { MeasuresPanel } from "./MeasuresPanel";
import { PlanCoachPanel } from "./PlanCoachPanel";
import { PlanPanel } from "./PlanPanel";
import { formatBirthDate, getInitials } from "./clientDetailUtils";

type ClientDetailModuleProps = {
  accessToken: string;
  clientId: number;
  onBack: () => void;
  onDeleted?: () => void;
};

export function ClientDetailModule({
  accessToken,
  clientId,
  onBack,
  onDeleted,
}: ClientDetailModuleProps) {
  const [client, setClient] = useState<ClientDetail | null>(null);
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAddingPlan, setIsAddingPlan] = useState(false);
  const [isCoachOpen, setIsCoachOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    Promise.all([fetchClientDetail(accessToken, clientId), fetchClientPlans(accessToken, clientId)])
      .then(([detail, planList]) => {
        if (!cancelled) {
          setClient(detail);
          setPlans(planList);
        }
      })
      .catch((currentError) => {
        if (!cancelled) {
          setError(
            currentError instanceof Error ? currentError.message : "Could not load client.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, clientId]);

  function handlePlanSaved(updated: PlanSummary) {
    setPlans((current) => current.map((plan) => (plan.id === updated.id ? updated : plan)));
  }

  function handleMeasuresSaved(newMeasures: Record<string, number | string>) {
    setClient((current) => (current ? { ...current, measures: newMeasures } : current));
  }

  function handleClientUpdated(updated: ClientDetail) {
    setClient(updated);
  }

  if (isLoading) {
    return (
      <div className="detail-shell">
        <p>Loading client...</p>
      </div>
    );
  }

  if (error || !client) {
    return (
      <div className="detail-shell">
        <button className="secondary-button" onClick={onBack}>
          <ArrowLeft size={16} /> Back
        </button>
        <p className="error-text">{error ?? "Client not available."}</p>
      </div>
    );
  }

  return (
    <section className="detail-shell" aria-label="Client detail">
      <button className="secondary-button back-button" onClick={onBack}>
        <ArrowLeft size={16} /> Back to clients
      </button>

      <header className="detail-header">
        <div className="client-avatar large" aria-hidden="true">
          {getInitials(client.full_name)}
        </div>
        <div className="detail-header-body">
          <h1>{client.full_name}</h1>
          <p className="muted">@{client.username}</p>
          <div className="detail-meta">
            <span>
              <Mail size={14} /> {client.email}
            </span>
            {client.personal_number ? (
              <span>
                <Phone size={14} /> {client.personal_number}
              </span>
            ) : null}
            {client.id_number ? (
              <span>
                <IdCard size={14} /> {client.id_number}
              </span>
            ) : null}
            {client.birth_date ? (
              <span>Born {formatBirthDate(client.birth_date)}</span>
            ) : null}
            {client.relation_description ? <span>Focus: {client.relation_description}</span> : null}
            <span
              className={`status-pill ${
                client.active ? "status-approved" : "status-inactive"
              }`}
            >
              {client.active ? "Active" : "Inactive"}
            </span>
          </div>
        </div>
        <ClientHeaderActions
          accessToken={accessToken}
          client={client}
          onDeleted={onDeleted ?? onBack}
          onReactivated={handleClientUpdated}
        />
      </header>

      <ClientNotesPanel
        accessToken={accessToken}
        client={client}
        onSaved={handleClientUpdated}
      />

      <MeasuresPanel
        accessToken={accessToken}
        clientId={client.id}
        initialMeasures={client.measures}
        onSaved={handleMeasuresSaved}
      />

      <HealthScreeningCard accessToken={accessToken} clientId={client.id} />

      <section className="panel-stack">
        <div className="section-header">
          <h2>Plans</h2>
          {!isAddingPlan ? (
            <button
              type="button"
              className="primary-button"
              onClick={() => setIsAddingPlan(true)}
            >
              <Plus size={16} /> Add plan
            </button>
          ) : null}
        </div>

        {plans.length === 0 && !isAddingPlan ? (
          <p className="muted">No plans yet for this client.</p>
        ) : null}

        {isAddingPlan ? (
          <AddPlanForm
            accessToken={accessToken}
            clientId={client.id}
            onCreated={(plan) => {
              setPlans((current) => [plan, ...current]);
              setIsAddingPlan(false);
            }}
            onCancel={() => setIsAddingPlan(false)}
          />
        ) : null}

        {plans.map((plan) => (
          <PlanPanel
            key={plan.id}
            accessToken={accessToken}
            plan={plan}
            onSaved={handlePlanSaved}
            onDeleted={(deletedId) =>
              setPlans((current) => current.filter((p) => p.id !== deletedId))
            }
          />
        ))}
      </section>

      <section className="panel-stack" aria-label="Plan coach">
        {!isCoachOpen ? (
          <div className="panel-actions">
            <button
              type="button"
              className="primary-button"
              onClick={() => setIsCoachOpen(true)}
            >
              <Sparkles size={16} /> Generate a plan with AI
            </button>
          </div>
        ) : (
          <PlanCoachPanel
            accessToken={accessToken}
            client={client}
            onPlanCreated={(plan) => {
              setPlans((current) => [plan, ...current]);
              setIsCoachOpen(false);
            }}
            onClose={() => setIsCoachOpen(false)}
          />
        )}
      </section>
    </section>
  );
}
