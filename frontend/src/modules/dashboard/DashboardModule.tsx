import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  ClipboardCheck,
  Dumbbell,
  HeartPulse,
  Users,
} from "lucide-react";
import { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import {
  TrainerDashboard,
  DashboardAppointment,
  fetchTrainerDashboard,
} from "../../api";

type DashboardModuleProps = {
  accessToken?: string;
  trainerName?: string;
  onNavigate?: (target: "clients" | "sessions" | "appointments") => void;
  onSelectClient?: (clientId: number) => void;
};

export function DashboardModule({
  accessToken,
  trainerName,
  onNavigate,
  onSelectClient,
}: DashboardModuleProps) {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState<TrainerDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(accessToken));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    fetchTrainerDashboard(accessToken)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : t("dashboard.trainer.errorLoad"));
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, t]);

  if (!accessToken) {
    return (
      <section className="module-stack" aria-label={t("dashboard.trainer.ariaLabelSignedOut")}>
        <header className="module-header">
          <div>
            <h1>{t("dashboard.trainer.title")}</h1>
            <p>{t("dashboard.trainer.signInPrompt")}</p>
          </div>
        </header>
      </section>
    );
  }

  const stats = data?.stats;
  const buckets = bucketAppointments(data?.upcoming_appointments ?? []);

  return (
    <section className="module-stack" aria-label={t("dashboard.trainer.ariaLabel")}>
      <header className="module-header">
        <div>
          <h1>
            {trainerName
              ? t("dashboard.trainer.greeting", { name: firstName(trainerName) })
              : t("dashboard.trainer.title")}
          </h1>
          <p>{t("dashboard.trainer.subtitle")}</p>
        </div>
      </header>

      {error ? <p className="error-text">{error}</p> : null}

      <section className="stats-grid stats-grid-4" aria-label={t("dashboard.trainer.overviewLabel")}>
        <article className="metric-card">
          <Users size={20} />
          <span>{t("dashboard.trainer.activeClients")}</span>
          <strong>{stats ? stats.active_clients : "—"}</strong>
        </article>
        <article className="metric-card">
          <Dumbbell size={20} />
          <span>{t("dashboard.trainer.activePlans")}</span>
          <strong>{stats ? stats.active_plans : "—"}</strong>
        </article>
        <article className="metric-card">
          <ClipboardCheck size={20} />
          <span>{t("dashboard.trainer.sessionsThisWeek")}</span>
          <strong>{stats ? stats.sessions_this_week : "—"}</strong>
        </article>
        <article className="metric-card">
          <CalendarDays size={20} />
          <span>{t("dashboard.trainer.appointmentsThisWeek")}</span>
          <strong>{stats ? stats.appointments_this_week : "—"}</strong>
        </article>
      </section>

      <section className="content-grid">
        <div className="panel">
          <div className="panel-header">
            <h2>{t("dashboard.trainer.scheduleHeading")}</h2>
            <button
              type="button"
              className="ghost-button"
              onClick={() => onNavigate?.("appointments")}
            >
              {t("dashboard.trainer.openCalendar")}
            </button>
          </div>

          <ScheduleBlock
            label={t("dashboard.trainer.today")}
            appointments={buckets.today}
            empty={t("dashboard.trainer.noAppointmentsToday")}
            isLoading={isLoading}
            loadingLabel={t("dashboard.trainer.loading")}
            locale={i18n.language}
          />
          <ScheduleBlock
            label={t("dashboard.trainer.tomorrow")}
            appointments={buckets.tomorrow}
            empty={t("dashboard.trainer.noAppointmentsTomorrow")}
            isLoading={isLoading}
            loadingLabel={t("dashboard.trainer.loading")}
            locale={i18n.language}
          />
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2>{t("dashboard.trainer.needsAttentionHeading")}</h2>
            <span>{t("dashboard.trainer.itemCount", { count: actionCount(data) })}</span>
          </div>

          <ActionList
            title={t("dashboard.trainer.draftPlansTitle")}
            icon={<ClipboardCheck size={16} />}
            isLoading={isLoading}
            loadingLabel={t("dashboard.trainer.loading")}
            emptyText={t("dashboard.trainer.draftPlansEmpty")}
            items={(data?.draft_plans ?? []).map((plan) => ({
              key: `plan-${plan.id}`,
              primary: plan.title,
              secondary: t("dashboard.trainer.draftPlanSecondary", {
                client: plan.client_name,
                when: formatRelative(plan.updated_at, t, i18n.language),
              }),
              onClick: onSelectClient ? () => onSelectClient(plan.client_id) : undefined,
            }))}
          />

          <ActionList
            title={t("dashboard.trainer.parqAlertsTitle")}
            icon={<HeartPulse size={16} />}
            isLoading={isLoading}
            loadingLabel={t("dashboard.trainer.loading")}
            emptyText={t("dashboard.trainer.parqAlertsEmpty")}
            items={(data?.par_q_alerts ?? []).map((alert) => ({
              key: `parq-${alert.assessment_id}`,
              primary: alert.client_name,
              secondary: alert.completed_at
                ? t("dashboard.trainer.parqAlertSecondaryCompleted", {
                    when: formatRelative(alert.completed_at, t, i18n.language),
                  })
                : t("dashboard.trainer.parqAlertSecondaryNoDate"),
              icon: <AlertTriangle size={14} />,
              onClick: onSelectClient ? () => onSelectClient(alert.client_id) : undefined,
            }))}
          />
        </div>
      </section>
    </section>
  );
}

// ---------- internals ----------

type ActionItem = {
  key: string;
  primary: string;
  secondary?: string;
  icon?: React.ReactNode;
  onClick?: () => void;
};

function ActionList({
  title,
  icon,
  items,
  isLoading,
  loadingLabel,
  emptyText,
}: {
  title: string;
  icon: React.ReactNode;
  items: ActionItem[];
  isLoading: boolean;
  loadingLabel: string;
  emptyText: string;
}) {
  return (
    <div className="action-block">
      <div className="coach-card-header">
        {icon}
        <span>{title}</span>
      </div>
      {isLoading ? (
        <p className="muted">{loadingLabel}</p>
      ) : items.length === 0 ? (
        <p className="muted">{emptyText}</p>
      ) : (
        <ul className="action-list">
          {items.map((item) => (
            <li key={item.key}>
              <button
                type="button"
                className="action-row"
                disabled={!item.onClick}
                onClick={item.onClick}
              >
                <span className="action-row-icon">{item.icon ?? <ClipboardCheck size={14} />}</span>
                <span className="action-row-text">
                  <strong>{item.primary}</strong>
                  {item.secondary ? <span>{item.secondary}</span> : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ScheduleBlock({
  label,
  appointments,
  empty,
  isLoading,
  loadingLabel,
  locale,
}: {
  label: string;
  appointments: DashboardAppointment[];
  empty: string;
  isLoading: boolean;
  loadingLabel: string;
  locale: string;
}) {
  return (
    <div className="schedule-block">
      <h3 className="schedule-block-title">{label}</h3>
      {isLoading ? (
        <p className="muted">{loadingLabel}</p>
      ) : appointments.length === 0 ? (
        <p className="muted">{empty}</p>
      ) : (
        <div className="appointment-list">
          {appointments.map((appointment) => (
            <article className="appointment-row" key={appointment.id}>
              <time>{formatTime(appointment.starts_at, locale)}</time>
              <div>
                <strong>{appointment.client_name}</strong>
                <span>{appointment.focus}</span>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function bucketAppointments(items: DashboardAppointment[]): {
  today: DashboardAppointment[];
  tomorrow: DashboardAppointment[];
} {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
  const startOfDayAfter = new Date(startOfTomorrow);
  startOfDayAfter.setDate(startOfDayAfter.getDate() + 1);

  const today: DashboardAppointment[] = [];
  const tomorrow: DashboardAppointment[] = [];
  for (const appointment of items) {
    const starts = new Date(appointment.starts_at);
    if (starts >= startOfToday && starts < startOfTomorrow) {
      today.push(appointment);
    } else if (starts >= startOfTomorrow && starts < startOfDayAfter) {
      tomorrow.push(appointment);
    }
  }
  return { today, tomorrow };
}

function formatTime(iso: string, locale: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", hour12: false });
}

function formatRelative(iso: string, t: TFunction, locale: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = now - then;
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return t("dashboard.trainer.relativeJustNow");
  if (minutes < 60) return t("dashboard.trainer.relativeMinutes", { count: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t("dashboard.trainer.relativeHours", { count: hours });
  const days = Math.round(hours / 24);
  if (days < 30) return t("dashboard.trainer.relativeDays", { count: days });
  return new Date(iso).toLocaleDateString(locale);
}

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

function actionCount(data: TrainerDashboard | null): number {
  if (!data) return 0;
  return data.draft_plans.length + data.par_q_alerts.length;
}
