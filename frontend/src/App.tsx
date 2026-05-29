import { useEffect, useState } from "react";
import {
  Calendar,
  CalendarDays,
  ClipboardCheck,
  Dumbbell,
  HeartPulse,
  LogOut,
  Menu,
  ShieldCheck,
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
import { TrainerDetailModule } from "./modules/trainers/TrainerDetailModule";
import { TrainersModule } from "./modules/trainers/TrainersModule";
import { NewTrainerModule } from "./modules/trainers/NewTrainerModule";

type ActiveView =
  | "dashboard"
  | "clients"
  | "trainers"
  | "sessions"
  | "appointments"
  | "health"
  | "profile";

export function App() {
  const [activeView, setActiveView] = useState<ActiveView>("dashboard");
  const [accessToken, setAccessToken] = useState(() => localStorage.getItem("gym_access_token"));
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [isSessionLoading, setIsSessionLoading] = useState(Boolean(accessToken));
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [isCreatingClient, setIsCreatingClient] = useState(false);
  const [selectedTrainerId, setSelectedTrainerId] = useState<number | null>(null);
  const [isCreatingTrainer, setIsCreatingTrainer] = useState(false);
  const [trainersReloadKey, setTrainersReloadKey] = useState(0);
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
    setSelectedTrainerId(null);
    setIsCreatingTrainer(false);
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
    setSelectedTrainerId(null);
    setIsCreatingTrainer(false);
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
  const isAdmin = currentUser.roles.includes("admin");
  const resolvedView: ActiveView =
    activeView === "clients" && isClient
      ? "dashboard"
      : activeView === "trainers" && !isAdmin
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
          {isAdmin && (
            <button
              className={`nav-item ${resolvedView === "trainers" ? "active" : ""}`}
              onClick={() => navigateTo("trainers")}
            >
              <ShieldCheck size={18} />
              Trainers
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
            className={`nav-item ${resolvedView === "profile" ? "active" : ""}`}
            onClick={() => navigateTo("profile")}
          >
            <UserCircle size={18} />
            Profile
          </button>
        </nav>

        <div className="session-card">
          <div className="session-card-identity">
            <button
              type="button"
              className="session-avatar"
              onClick={() => navigateTo("profile")}
              aria-label="Open profile"
              title="Open profile"
            >
              {currentUser.photo_url ? (
                <img src={currentUser.photo_url} alt="" />
              ) : (
                <span>{sessionInitials(currentUser.full_name)}</span>
              )}
            </button>
            <div className="session-card-text">
              <span>Signed in as</span>
              <strong>{currentUser.full_name}</strong>
              <small>{currentUser.roles.join(", ") || "No role"}</small>
            </div>
          </div>
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
            onDeleted={() => setSelectedClientId(null)}
          />
        ) : resolvedView === "clients" ? (
          <ClientsModule
            accessToken={accessToken}
            canCreate={!isClient}
            onSelectClient={setSelectedClientId}
            onCreateClient={() => setIsCreatingClient(true)}
          />
        ) : resolvedView === "trainers" && isCreatingTrainer ? (
          <NewTrainerModule
            accessToken={accessToken}
            onCancel={() => setIsCreatingTrainer(false)}
            onCreated={() => {
              setIsCreatingTrainer(false);
              setTrainersReloadKey((value) => value + 1);
            }}
          />
        ) : resolvedView === "trainers" && selectedTrainerId !== null ? (
          <TrainerDetailModule
            accessToken={accessToken}
            trainerId={selectedTrainerId}
            onBack={() => setSelectedTrainerId(null)}
            onDeleted={() => {
              setSelectedTrainerId(null);
              setTrainersReloadKey((value) => value + 1);
            }}
          />
        ) : resolvedView === "trainers" ? (
          <TrainersModule
            key={trainersReloadKey}
            accessToken={accessToken}
            onSelectTrainer={setSelectedTrainerId}
            onCreateTrainer={() => setIsCreatingTrainer(true)}
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

function sessionInitials(fullName: string): string {
  return fullName
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
