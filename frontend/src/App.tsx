import { useEffect, useState } from "react";
import {
  Bot,
  Calendar,
  CalendarDays,
  ClipboardCheck,
  Dumbbell,
  HeartPulse,
  LogOut,
  Menu,
  UserCircle,
  Users,
  X,
} from "lucide-react";
import { AuthUser, getCurrentUser } from "./api";
import { LoginModule } from "./modules/auth/LoginModule";
import { ClientDetailModule } from "./modules/clients/ClientDetailModule";
import { ClientsModule } from "./modules/clients/ClientsModule";
import { NewClientModule } from "./modules/clients/NewClientModule";
import { ClientDashboardModule } from "./modules/dashboard/ClientDashboardModule";
import { DashboardModule } from "./modules/dashboard/DashboardModule";
import { AppointmentsModule } from "./modules/appointments/AppointmentsModule";
import { ParQModule } from "./modules/health/ParQModule";
import { ProfileModule } from "./modules/profile/ProfileModule";
import { PlanSessionsModule } from "./modules/sessions/PlanSessionsModule";

type ActiveView =
  | "dashboard"
  | "clients"
  | "sessions"
  | "appointments"
  | "health"
  | "profile"
  | "assistant";

export function App() {
  const [activeView, setActiveView] = useState<ActiveView>("dashboard");
  const [accessToken, setAccessToken] = useState(() => localStorage.getItem("gym_access_token"));
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [isSessionLoading, setIsSessionLoading] = useState(Boolean(accessToken));
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [isCreatingClient, setIsCreatingClient] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!accessToken) {
      setIsSessionLoading(false);
      return;
    }

    getCurrentUser(accessToken)
      .then(setCurrentUser)
      .catch(() => {
        localStorage.removeItem("gym_access_token");
        setAccessToken(null);
        setCurrentUser(null);
      })
      .finally(() => setIsSessionLoading(false));
  }, [accessToken]);

  function handleLogin(token: string, user: AuthUser) {
    localStorage.setItem("gym_access_token", token);
    setAccessToken(token);
    setCurrentUser(user);
  }

  function handleLogout() {
    localStorage.removeItem("gym_access_token");
    setAccessToken(null);
    setCurrentUser(null);
    setActiveView("dashboard");
    setSelectedClientId(null);
    setIsCreatingClient(false);
  }

  useEffect(() => {
    if (!accessToken) return;
    function handleExpired() {
      handleLogout();
    }
    window.addEventListener("auth:expired", handleExpired);
    return () => window.removeEventListener("auth:expired", handleExpired);
  }, [accessToken]);

  function navigateTo(view: ActiveView) {
    setActiveView(view);
    setSelectedClientId(null);
    setIsCreatingClient(false);
    setIsMobileMenuOpen(false);
  }

  if (isSessionLoading) {
    return (
      <main className="login-shell">
        <section className="login-panel">
          <div className="brand login-brand">
            <div className="brand-mark">
              <Dumbbell size={22} />
            </div>
            <div>
              <strong>Gym AI</strong>
              <span>Loading session</span>
            </div>
          </div>
        </section>
      </main>
    );
  }

  if (!accessToken || !currentUser) {
    return <LoginModule onLogin={handleLogin} />;
  }

  const isClient = currentUser.roles.includes("client");
  const resolvedView: ActiveView =
    activeView === "clients" && isClient
      ? "dashboard"
      : activeView === "health" && !isClient
      ? "dashboard"
      : activeView;

  return (
    <main className="app-shell">
      <aside className={`sidebar ${isMobileMenuOpen ? "is-open" : "is-collapsed"}`}>
        <div className="brand">
          <div className="brand-mark">
            <Dumbbell size={22} />
          </div>
          <div>
            <strong>Gym AI</strong>
            <span>Instructor console</span>
          </div>
        </div>

        <button
          type="button"
          className="menu-toggle"
          aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
          aria-expanded={isMobileMenuOpen}
          onClick={() => setIsMobileMenuOpen((value) => !value)}
        >
          {isMobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>

        <nav className="nav-list" aria-label="Main navigation">
          <button
            className={`nav-item ${resolvedView === "dashboard" ? "active" : ""}`}
            onClick={() => navigateTo("dashboard")}
          >
            <CalendarDays size={18} />
            Dashboard
          </button>
          {!isClient && (
            <button
              className={`nav-item ${resolvedView === "clients" ? "active" : ""}`}
              onClick={() => navigateTo("clients")}
            >
              <Users size={18} />
              Clients
            </button>
          )}
          <button
            className={`nav-item ${resolvedView === "sessions" ? "active" : ""}`}
            onClick={() => navigateTo("sessions")}
          >
            <ClipboardCheck size={18} />
            Plan Sessions
          </button>
          <button
            className={`nav-item ${resolvedView === "appointments" ? "active" : ""}`}
            onClick={() => navigateTo("appointments")}
          >
            <Calendar size={18} />
            Appointments
          </button>
          {isClient ? (
            <button
              className={`nav-item ${resolvedView === "health" ? "active" : ""}`}
              onClick={() => navigateTo("health")}
            >
              <HeartPulse size={18} />
              Health
            </button>
          ) : null}
          <button
            className={`nav-item ${resolvedView === "assistant" ? "active" : ""}`}
            onClick={() => navigateTo("assistant")}
          >
            <Bot size={18} />
            AI Assistant
          </button>
          <button
            className={`nav-item ${resolvedView === "profile" ? "active" : ""}`}
            onClick={() => navigateTo("profile")}
          >
            <UserCircle size={18} />
            Profile
          </button>
        </nav>

        <div className="session-card">
          <span>Signed in as</span>
          <strong>{currentUser.full_name}</strong>
          <small>{currentUser.roles.join(", ") || "No role"}</small>
          <button className="nav-item logout-button" onClick={handleLogout}>
            <LogOut size={18} />
            Sign out
          </button>
        </div>
      </aside>

      <section className="workspace">
        {resolvedView === "clients" && isCreatingClient ? (
          <NewClientModule
            accessToken={accessToken}
            onCancel={() => setIsCreatingClient(false)}
            onCreated={() => setIsCreatingClient(false)}
          />
        ) : resolvedView === "clients" && selectedClientId !== null ? (
          <ClientDetailModule
            accessToken={accessToken}
            clientId={selectedClientId}
            onBack={() => setSelectedClientId(null)}
          />
        ) : resolvedView === "clients" ? (
          <ClientsModule
            accessToken={accessToken}
            canCreate={!isClient}
            onSelectClient={setSelectedClientId}
            onCreateClient={() => setIsCreatingClient(true)}
          />
        ) : resolvedView === "sessions" ? (
          <PlanSessionsModule accessToken={accessToken} currentUser={currentUser} />
        ) : resolvedView === "appointments" ? (
          <AppointmentsModule accessToken={accessToken} currentUser={currentUser} />
        ) : resolvedView === "health" ? (
          <ParQModule accessToken={accessToken} currentUser={currentUser} />
        ) : resolvedView === "profile" ? (
          <ProfileModule
            accessToken={accessToken}
            currentUser={currentUser}
            onProfileUpdated={setCurrentUser}
          />
        ) : resolvedView === "assistant" ? (
          <section className="module-stack" aria-label="AI assistant">
            <header className="module-header">
              <div>
                <h1>AI assistant</h1>
                <p>
                  Open a client to use the Plan Coach. Per-session AI feedback runs automatically
                  when clients save a workout.
                </p>
              </div>
            </header>
          </section>
        ) : isClient ? (
          <ClientDashboardModule
            accessToken={accessToken}
            currentUser={currentUser}
            onNavigateToSessions={() => navigateTo("sessions")}
            onNavigateToHealth={() => navigateTo("health")}
          />
        ) : (
          <DashboardModule
            accessToken={accessToken}
            trainerName={currentUser.full_name}
            onNavigate={(target) => navigateTo(target)}
            onSelectClient={(clientId) => {
              setActiveView("clients");
              setIsCreatingClient(false);
              setSelectedClientId(clientId);
            }}
          />
        )}
      </section>
    </main>
  );
}
