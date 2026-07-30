import { useEffect, useState } from "react";
import { ArrowLeft, IdCard, Mail, Phone, Plus, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
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
import { MeasuresHistoryPanel } from "./MeasuresHistoryPanel";
import { MeasuresPanel } from "./MeasuresPanel";
import { MeasureTrendsPanel } from "./MeasureTrendsPanel";
import { ExerciseProgressionPanel } from "./ExerciseProgressionPanel";
import { PlanCoachPanel } from "./PlanCoachPanel";
import { PlanPanel } from "./PlanPanel";
import { formatBirthDate, getInitials } from "./clientDetailUtils";

type TabKey = "detail" | "trends";

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
  const { t, i18n } = useTranslation();
  const [client, setClient] = useState<ClientDetail | null>(null);
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAddingPlan, setIsAddingPlan] = useState(false);
  const [isCoachOpen, setIsCoachOpen] = useState(false);
  // Bumped after a successful save in MeasuresPanel so the history panel
  // re-fetches and shows the new entry without a page reload.
  const [measuresReloadKey, setMeasuresReloadKey] = useState(0);
  const [activeTab, setActiveTab] = useState<TabKey>("detail");

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
            currentError instanceof Error ? currentError.message : t("clients.detail.errorLoad"),
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
  }, [accessToken, clientId, t]);

  function handlePlanSaved(updated: PlanSummary) {
    setPlans((current) => current.map((plan) => (plan.id === updated.id ? updated : plan)));
  }

  function handleMeasuresSaved(newMeasures: Record<string, number | string>) {
    setClient((current) => (current ? { ...current, measures: newMeasures } : current));
    setMeasuresReloadKey((value) => value + 1);
  }

  function handleClientUpdated(updated: ClientDetail) {
    setClient(updated);
  }

  if (isLoading) {
    return (
      <div className="detail-shell">
        <p>{t("clients.detail.loading")}</p>
      </div>
    );
  }

  if (error || !client) {
    return (
      <div className="detail-shell">
        <button className="secondary-button" onClick={onBack}>
          <ArrowLeft size={16} /> {t("common.back")}
        </button>
        <p className="error-text">{error ?? t("clients.detail.notFound")}</p>
      </div>
    );
  }

  return (
    <section className="detail-shell" aria-label={t("clients.detail.ariaLabel")}>
      <button className="secondary-button back-button" onClick={onBack}>
        <ArrowLeft size={16} /> {t("clients.detail.back")}
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
              <span>
                {t("clients.detail.born", {
                  date: formatBirthDate(client.birth_date, i18n.language, (age) =>
                    t("clients.list.age", { age }),
                  ),
                })}
              </span>
            ) : null}
            {client.relation_description ? (
              <span>{t("clients.detail.focusPrefix", { value: client.relation_description })}</span>
            ) : null}
            <span
              className={`status-pill ${
                client.active ? "status-approved" : "status-inactive"
              }`}
            >
              {client.active ? t("clients.detail.statusActive") : t("clients.detail.statusInactive")}
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

      <nav className="client-tabs" role="tablist" aria-label={t("clients.detail.ariaLabel")}>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "detail"}
          className={`client-tab ${activeTab === "detail" ? "active" : ""}`}
          onClick={() => setActiveTab("detail")}
        >
          {t("clients.tabs.detail")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "trends"}
          className={`client-tab ${activeTab === "trends" ? "active" : ""}`}
          onClick={() => setActiveTab("trends")}
        >
          {t("clients.tabs.trends")}
        </button>
      </nav>

      {activeTab === "trends" ? (
        <>
          <MeasureTrendsPanel accessToken={accessToken} clientId={client.id} />
          <ExerciseProgressionPanel accessToken={accessToken} clientId={client.id} />
        </>
      ) : (
        <>
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

      <MeasuresHistoryPanel
        accessToken={accessToken}
        clientId={client.id}
        reloadKey={measuresReloadKey}
      />

      <HealthScreeningCard accessToken={accessToken} clientId={client.id} />

      <section className="panel-stack">
        <div className="section-header">
          <h2>{t("clients.detail.plansHeading")}</h2>
          {!isAddingPlan ? (
            <button
              type="button"
              className="primary-button"
              onClick={() => setIsAddingPlan(true)}
            >
              <Plus size={16} /> {t("clients.detail.addPlan")}
            </button>
          ) : null}
        </div>

        {plans.length === 0 && !isAddingPlan ? (
          <p className="muted">{t("clients.detail.noPlans")}</p>
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

      <section className="panel-stack" aria-label={t("clients.detail.coachAriaLabel")}>
        {!isCoachOpen ? (
          <div className="panel-actions">
            <button
              type="button"
              className="primary-button"
              onClick={() => setIsCoachOpen(true)}
            >
              <Sparkles size={16} /> {t("clients.detail.generateWithAi")}
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
        </>
      )}
    </section>
  );
}
