import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  ClipboardCheck,
  Dumbbell,
  HeartPulse,
  Users,
} from "lucide-react";
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
          setError(err instanceof Error ? err.message : "Could not load dashboard.");
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  if (!accessToken) {
    return (
      <section className="module-stack" aria-label="Dashboard">
        <header className="module-header">
          <div>
            <h1>Dashboard</h1>
            <p>Sign in to see your day at a glance.</p>
          </div>
        </header>
      </section>
    );
  }

  const stats = data?.stats;
  const buckets = bucketAppointments(data?.upcoming_appointments ?? []);

  return (
    <section className="module-stack" aria-label="Trainer dashboard">
      <header className="module-header">
        <div>
          <h1>{trainerName ? `Hi, ${firstName(trainerName)}` : "Dashboard"}</h1>
          <p>Your day, your queue, and what needs attention.</p>
        </div>
      </header>

      {error ? <p className="error-text">{error}</p> : null}

      <section className="stats-grid stats-grid-4" aria-label="Overview">
        <article className="metric-card">
          <Users size={20} />
          <span>Active clients</span>
          <strong>{stats ? stats.active_clients : "—"}</strong>
        </article>
        <article className="metric-card">
          <Dumbbell size={20} />
          <span>Active plans</span>
          <strong>{stats ? stats.active_plans : "—"}</strong>
        </article>
        <article className="metric-card">
          <ClipboardCheck size={20} />
          <span>Sessions this week</span>
          <strong>{stats ? stats.sessions_this_week : "—"}</strong>
        </article>
        <article className="metric-card">
          <CalendarDays size={20} />
          <span>Appointments this week</span>
          <strong>{stats ? stats.appointments_this_week : "—"}</strong>
        </article>
      </section>

      <section className="content-grid">
        <div className="panel">
          <div className="panel-header">
            <h2>Schedule</h2>
            <button
              type="button"
              className="ghost-button"
              onClick={() => onNavigate?.("appointments")}
            >
              Open calendar
            </button>
          </div>

          <ScheduleBlock
            label="Today"
            appointments={buckets.today}
            empty="No appointments today."
            isLoading={isLoading}
          />
          <ScheduleBlock
            label="Tomorrow"
            appointments={buckets.tomorrow}
            empty="No appointments tomorrow."
            isLoading={isLoading}
          />
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2>Needs attention</h2>
            <span>{actionCount(data)} item(s)</span>
          </div>

          <ActionList
            title="Draft plans to review"
            icon={<ClipboardCheck size={16} />}
            isLoading={isLoading}
            emptyText="No drafts pending approval."
            items={(data?.draft_plans ?? []).map((plan) => ({
              key: `plan-${plan.id}`,
              primary: plan.title,
              secondary: `${plan.client_name} · updated ${formatRelative(plan.updated_at)}`,
              onClick: onSelectClient ? () => onSelectClient(plan.client_id) : undefined,
            }))}
          />

          <ActionList
            title="PAR-Q flagged for clearance"
            icon={<HeartPulse size={16} />}
            isLoading={isLoading}
            emptyText="No PAR-Q results need clearance."
            items={(data?.par_q_alerts ?? []).map((alert) => ({
              key: `parq-${alert.assessment_id}`,
              primary: alert.client_name,
              secondary: alert.completed_at
                ? `Completed ${formatRelative(alert.completed_at)} · medical clearance recommended`
                : "Medical clearance recommended",
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
  emptyText,
}: {
  title: string;
  icon: React.ReactNode;
  items: ActionItem[];
  isLoading: boolean;
  emptyText: string;
}) {
  return (
    <div className="action-block">
      <div className="coach-card-header">
        {icon}
        <span>{title}</span>
      </div>
      {isLoading ? (
        <p className="muted">Loading…</p>
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
}: {
  label: string;
  appointments: DashboardAppointment[];
  empty: string;
  isLoading: boolean;
}) {
  return (
    <div className="schedule-block">
      <h3 className="schedule-block-title">{label}</h3>
      {isLoading ? (
        <p className="muted">Loading…</p>
      ) : appointments.length === 0 ? (
        <p className="muted">{empty}</p>
      ) : (
        <div className="appointment-list">
          {appointments.map((appointment) => (
            <article className="appointment-row" key={appointment.id}>
              <time>{formatTime(appointment.starts_at)}</time>
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

function formatTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = now - then;
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

function actionCount(data: TrainerDashboard | null): number {
  if (!data) return 0;
  return data.draft_plans.length + data.par_q_alerts.length;
}
