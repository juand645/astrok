import { useEffect, useMemo, useState } from "react";
import {
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  Circle,
  HeartPulse,
  Send,
  Sparkles,
} from "lucide-react";
import { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import {
  AuthUser,
  ParQAssessment,
  PlanSummary,
  WorkoutSession,
  fetchClientParQList,
  fetchClientPlans,
  fetchSessions,
  flattenDayContent,
} from "../../api";

type Props = {
  accessToken: string;
  currentUser: AuthUser;
  onNavigateToSessions: () => void;
  onNavigateToHealth: () => void;
};

export function ClientDashboardModule({
  accessToken,
  currentUser,
  onNavigateToSessions,
  onNavigateToHealth,
}: Props) {
  const { t } = useTranslation();
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [parqList, setParqList] = useState<ParQAssessment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const [planList, parq] = await Promise.all([
          fetchClientPlans(accessToken, currentUser.id),
          fetchClientParQList(accessToken, currentUser.id).catch(() => []),
        ]);
        if (cancelled) return;

        const sorted = [...planList].sort((a, b) =>
          b.updated_at.localeCompare(a.updated_at),
        );
        setPlans(sorted);
        setParqList(parq);

        const activePlan = sorted[0];
        if (activePlan) {
          const monday = startOfIsoWeek(new Date());
          const nextMonday = addDays(monday, 7);
          const recent = await fetchSessions(accessToken, currentUser.id, {
            planId: activePlan.id,
            limit: 50,
          });
          if (cancelled) return;
          const inWindow = recent.filter((s) => {
            const date = new Date(`${s.session_date}T00:00:00`);
            return date >= monday && date < nextMonday;
          });
          setSessions([...recent.filter((s) => !inWindow.includes(s)), ...inWindow]);
        } else {
          setSessions([]);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : t("dashboard.client.errorLoad"));
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [accessToken, currentUser.id, t]);

  const firstName = (currentUser.full_name || currentUser.username || "").split(" ")[0];
  const activePlan = plans[0] ?? null;

  const dayKeys = useMemo(
    () => (activePlan ? Object.keys(activePlan.content ?? {}).sort() : []),
    [activePlan],
  );

  const completedThisWeekByDay = useMemo(() => {
    const monday = startOfIsoWeek(new Date());
    const nextMonday = addDays(monday, 7);
    const set = new Set<string>();
    for (const s of sessions) {
      if (!s.completed) continue;
      const date = new Date(`${s.session_date}T00:00:00`);
      if (date >= monday && date < nextMonday) {
        set.add(s.day_key);
      }
    }
    return set;
  }, [sessions]);

  const nextDayKey = dayKeys.find((d) => !completedThisWeekByDay.has(d)) ?? null;
  const allDoneThisWeek = dayKeys.length > 0 && nextDayKey === null;

  const pendingParq = useMemo(
    () => parqList.find((a) => a.status === "requested") ?? null,
    [parqList],
  );

  const latestCompletedSession = useMemo(
    () =>
      [...sessions]
        .filter((s) => s.completed && s.ai_response)
        .sort((a, b) => b.session_date.localeCompare(a.session_date) || b.id - a.id)[0] ?? null,
    [sessions],
  );

  if (isLoading) {
    return (
      <section className="module-stack" aria-label={t("dashboard.client.ariaLabel")}>
        <p className="muted">{t("dashboard.client.loading")}</p>
      </section>
    );
  }

  return (
    <section className="module-stack" aria-label={t("dashboard.client.ariaLabel")}>
      <header className="dash-greeting">
        <h1>
          {t("dashboard.client.greeting", {
            name: firstName || t("dashboard.client.greetingFallbackName"),
          })}
        </h1>
        {activePlan ? (
          <p className="muted">{t("dashboard.client.stillOnPlan", { plan: activePlan.title })}</p>
        ) : (
          <p className="muted">{t("dashboard.client.noPlanYet")}</p>
        )}
      </header>

      {error ? <p className="error-text">{error}</p> : null}

      <section className="dash-grid">
        <NextWorkoutCard
          activePlan={activePlan}
          nextDayKey={nextDayKey}
          allDoneThisWeek={allDoneThisWeek}
          onLogSession={onNavigateToSessions}
        />
        <ThisWeekCard
          dayKeys={dayKeys}
          completedThisWeekByDay={completedThisWeekByDay}
          activePlan={activePlan}
        />
      </section>

      <CoachCard
        pendingParq={pendingParq}
        latestCompletedSession={latestCompletedSession}
        hasPlan={activePlan !== null}
        onNavigateToHealth={onNavigateToHealth}
      />
    </section>
  );
}

// ---------- Cards ----------

function NextWorkoutCard({
  activePlan,
  nextDayKey,
  allDoneThisWeek,
  onLogSession,
}: {
  activePlan: PlanSummary | null;
  nextDayKey: string | null;
  allDoneThisWeek: boolean;
  onLogSession: () => void;
}) {
  const { t } = useTranslation();
  if (!activePlan) {
    return (
      <article className="dash-card">
        <header className="dash-card-header">
          <ClipboardCheck size={18} />
          <span>{t("dashboard.client.nextWorkoutHeading")}</span>
        </header>
        <p className="muted">{t("dashboard.client.nextWorkoutNoPlan")}</p>
      </article>
    );
  }

  if (allDoneThisWeek) {
    return (
      <article className="dash-card dash-card-done">
        <header className="dash-card-header">
          <CheckCircle2 size={18} />
          <span>{t("dashboard.client.weekDoneHeading")}</span>
        </header>
        <p>{t("dashboard.client.weekDoneBody")}</p>
      </article>
    );
  }

  if (!nextDayKey) {
    return (
      <article className="dash-card">
        <header className="dash-card-header">
          <ClipboardCheck size={18} />
          <span>{t("dashboard.client.nextWorkoutHeading")}</span>
        </header>
        <p className="muted">{t("dashboard.client.noDaysDefined")}</p>
      </article>
    );
  }

  const exercises = flattenDayContent(activePlan.content[nextDayKey]);
  const preview = exercises
    .slice(0, 3)
    .map((e) => e.ejercicio)
    .filter(Boolean)
    .join(", ");

  return (
    <article className="dash-card">
      <header className="dash-card-header">
        <ClipboardCheck size={18} />
        <span>{t("dashboard.client.nextWorkoutHeading")}</span>
      </header>
      <div>
        <strong className="dash-card-title">{prettyDayLabel(nextDayKey, t)}</strong>
        {preview ? <p className="muted">{preview}{exercises.length > 3 ? "…" : ""}</p> : null}
        <p className="muted">{t("dashboard.client.exerciseCount", { count: exercises.length })}</p>
      </div>
      <div className="panel-actions">
        <button type="button" className="primary-button" onClick={onLogSession}>
          <Send size={16} /> {t("dashboard.client.logSession")}
        </button>
      </div>
    </article>
  );
}

function ThisWeekCard({
  dayKeys,
  completedThisWeekByDay,
  activePlan,
}: {
  dayKeys: string[];
  completedThisWeekByDay: Set<string>;
  activePlan: PlanSummary | null;
}) {
  const { t } = useTranslation();
  return (
    <article className="dash-card">
      <header className="dash-card-header">
        <Calendar size={18} />
        <span>{t("dashboard.client.thisWeekHeading")}</span>
      </header>
      {!activePlan ? (
        <p className="muted">{t("dashboard.client.thisWeekNoPlan")}</p>
      ) : dayKeys.length === 0 ? (
        <p className="muted">{t("dashboard.client.thisWeekEmpty")}</p>
      ) : (
        <ul className="dash-week-list">
          {dayKeys.map((day) => {
            const isDone = completedThisWeekByDay.has(day);
            return (
              <li key={day} className={`dash-week-pill ${isDone ? "is-done" : ""}`}>
                {isDone ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                <span>{prettyDayLabel(day, t)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </article>
  );
}

function CoachCard({
  pendingParq,
  latestCompletedSession,
  hasPlan,
  onNavigateToHealth,
}: {
  pendingParq: ParQAssessment | null;
  latestCompletedSession: WorkoutSession | null;
  hasPlan: boolean;
  onNavigateToHealth: () => void;
}) {
  const { t } = useTranslation();
  if (pendingParq) {
    return (
      <article className="dash-card dash-card-attention">
        <header className="dash-card-header">
          <HeartPulse size={18} />
          <span>{t("dashboard.client.actionRequiredHeading")}</span>
        </header>
        <p>{t("dashboard.client.parqPendingBody")}</p>
        <div className="panel-actions">
          <button type="button" className="primary-button" onClick={onNavigateToHealth}>
            {t("dashboard.client.completeParq")}
          </button>
        </div>
      </article>
    );
  }

  if (latestCompletedSession?.ai_response) {
    return (
      <article className="dash-card dash-card-coach">
        <header className="dash-card-header">
          <Sparkles size={16} />
          <span>{t("dashboard.client.yourCoachHeading")}</span>
        </header>
        <p>{latestCompletedSession.ai_response}</p>
      </article>
    );
  }

  if (!hasPlan) {
    return (
      <article className="dash-card">
        <header className="dash-card-header">
          <Sparkles size={16} />
          <span>{t("dashboard.client.welcomeHeading")}</span>
        </header>
        <p className="muted">{t("dashboard.client.welcomeBody")}</p>
      </article>
    );
  }

  return (
    <article className="dash-card">
      <header className="dash-card-header">
        <Sparkles size={16} />
        <span>{t("dashboard.client.yourCoachHeading")}</span>
      </header>
      <p className="muted">{t("dashboard.client.coachWaitingBody")}</p>
    </article>
  );
}

// ---------- helpers ----------

function startOfIsoWeek(reference: Date): Date {
  const d = new Date(reference);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const shift = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + shift);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function prettyDayLabel(dayKey: string, t: TFunction): string {
  if (!dayKey) return t("dashboard.client.dayLabel", { number: "" }).trim();
  const match = dayKey.match(/^dia[_-]?(\d+)$/i);
  if (match) return t("dashboard.client.dayLabel", { number: match[1] });
  return dayKey;
}
