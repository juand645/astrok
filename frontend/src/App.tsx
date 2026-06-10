import { useEffect, useState } from "react";
import {
  Building2,
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
import { useTranslation } from "react-i18next";
import { AuthUser, GYM_SLUG_STORAGE_KEY, Gym, fetchMyGym, getCurrentUser } from "./api";
import { pickContrastTextColor } from "./utils/contrast";
import { LoginModule } from "./modules/auth/LoginModule";
import { ClientDetailModule } from "./modules/clients/ClientDetailModule";
import { ClientsModule } from "./modules/clients/ClientsModule";
import { NewClientModule } from "./modules/clients/NewClientModule";
import { ClientDashboardModule } from "./modules/dashboard/ClientDashboardModule";
import { DashboardModule } from "./modules/dashboard/DashboardModule";
import { AppointmentsModule } from "./modules/appointments/AppointmentsModule";
import { GymsModule } from "./modules/gyms/GymsModule";
import { GymDetailModule } from "./modules/gyms/GymDetailModule";
import { NewGymModule } from "./modules/gyms/NewGymModule";
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
  | "gyms"
  | "sessions"
  | "appointments"
  | "health"
  | "profile";

export function App() {
  const { t } = useTranslation();
  const [activeView, setActiveView] = useState<ActiveView>("dashboard");
  const [accessToken, setAccessToken] = useState(() => localStorage.getItem("gym_access_token"));
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [currentGym, setCurrentGym] = useState<Gym | null>(null);
  const [isSessionLoading, setIsSessionLoading] = useState(Boolean(accessToken));
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [isCreatingClient, setIsCreatingClient] = useState(false);
  const [selectedTrainerId, setSelectedTrainerId] = useState<number | null>(null);
  const [isCreatingTrainer, setIsCreatingTrainer] = useState(false);
  const [trainersReloadKey, setTrainersReloadKey] = useState(0);
  const [selectedGymId, setSelectedGymId] = useState<number | null>(null);
  const [isCreatingGym, setIsCreatingGym] = useState(false);
  const [gymsReloadKey, setGymsReloadKey] = useState(0);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!accessToken) {
      setIsSessionLoading(false);
      return;
    }

    Promise.all([
      getCurrentUser(accessToken),
      fetchMyGym(accessToken).catch(() => null),
    ])
      .then(([user, gym]) => {
        setCurrentUser(user);
        setCurrentGym(gym);
      })
      .catch(() => {
        localStorage.removeItem("gym_access_token");
        setAccessToken(null);
        setCurrentUser(null);
        setCurrentGym(null);
      })
      .finally(() => setIsSessionLoading(false));
  }, [accessToken]);

  function handleLogin(token: string, user: AuthUser, gymSlug: string) {
    localStorage.setItem("gym_access_token", token);
    if (gymSlug) {
      localStorage.setItem(GYM_SLUG_STORAGE_KEY, gymSlug);
    }
    setAccessToken(token);
    setCurrentUser(user);
    // currentGym hydrates in the useEffect once accessToken changes.
  }

  function handleLogout() {
    localStorage.removeItem("gym_access_token");
    setAccessToken(null);
    setCurrentUser(null);
    setCurrentGym(null);
    setActiveView("dashboard");
    setSelectedClientId(null);
    setIsCreatingClient(false);
    setSelectedTrainerId(null);
    setIsCreatingTrainer(false);
    setSelectedGymId(null);
    setIsCreatingGym(false);
  }

  useEffect(() => {
    if (!accessToken) return;
    function handleExpired() {
      handleLogout();
    }
    window.addEventListener("auth:expired", handleExpired);
    return () => window.removeEventListener("auth:expired", handleExpired);
  }, [accessToken]);

  useEffect(() => {
    const root = document.documentElement;
    if (currentGym?.brand_color) {
      root.style.setProperty("--gym-brand-color", currentGym.brand_color);
      // Pick light or dark ink for text/icons that sit on top of the brand
      // color — keeps primary buttons + active nav item readable regardless
      // of how dark the gym picks.
      root.style.setProperty(
        "--gym-brand-text-color",
        pickContrastTextColor(currentGym.brand_color),
      );
    } else {
      root.style.removeProperty("--gym-brand-color");
      root.style.removeProperty("--gym-brand-text-color");
    }
  }, [currentGym?.brand_color]);

  function navigateTo(view: ActiveView) {
    setActiveView(view);
    setSelectedClientId(null);
    setIsCreatingClient(false);
    setSelectedTrainerId(null);
    setIsCreatingTrainer(false);
    setSelectedGymId(null);
    setIsCreatingGym(false);
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
              <span>{t("session.loading")}</span>
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
  const isSuperAdmin = currentUser.roles.includes("super_admin");
  const resolvedView: ActiveView =
    activeView === "clients" && isClient
      ? "dashboard"
      : activeView === "trainers" && !isAdmin
      ? "dashboard"
      : activeView === "gyms" && !isSuperAdmin
      ? "dashboard"
      : activeView === "health" && !isClient
      ? "dashboard"
      : activeView;

  return (
    <main className="app-shell">
      <aside className={`sidebar ${isMobileMenuOpen ? "is-open" : "is-collapsed"}`}>
        <div className="brand">
          <div className="brand-mark">
            {currentGym?.logo_url ? (
              <img src={currentGym.logo_url} alt="" className="brand-logo" />
            ) : (
              <Dumbbell size={22} />
            )}
          </div>
          <div>
            <strong>Gym AI</strong>
            <span>{currentGym?.name ?? t("login.brandTagline")}</span>
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
            {t("nav.dashboard")}
          </button>
          {!isClient && (
            <button
              className={`nav-item ${resolvedView === "clients" ? "active" : ""}`}
              onClick={() => navigateTo("clients")}
            >
              <Users size={18} />
              {t("nav.clients")}
            </button>
          )}
          {isAdmin && (
            <button
              className={`nav-item ${resolvedView === "trainers" ? "active" : ""}`}
              onClick={() => navigateTo("trainers")}
            >
              <ShieldCheck size={18} />
              {t("nav.trainers")}
            </button>
          )}
          {isSuperAdmin && (
            <button
              className={`nav-item ${resolvedView === "gyms" ? "active" : ""}`}
              onClick={() => navigateTo("gyms")}
            >
              <Building2 size={18} />
              {t("nav.gyms")}
            </button>
          )}
          <button
            className={`nav-item ${resolvedView === "sessions" ? "active" : ""}`}
            onClick={() => navigateTo("sessions")}
          >
            <ClipboardCheck size={18} />
            {t("nav.sessions")}
          </button>
          <button
            className={`nav-item ${resolvedView === "appointments" ? "active" : ""}`}
            onClick={() => navigateTo("appointments")}
          >
            <Calendar size={18} />
            {t("nav.appointments")}
          </button>
          {isClient ? (
            <button
              className={`nav-item ${resolvedView === "health" ? "active" : ""}`}
              onClick={() => navigateTo("health")}
            >
              <HeartPulse size={18} />
              {t("nav.health")}
            </button>
          ) : null}
          <button
            className={`nav-item ${resolvedView === "profile" ? "active" : ""}`}
            onClick={() => navigateTo("profile")}
          >
            <UserCircle size={18} />
            {t("nav.profile")}
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
              <span>{t("session.signedInAs")}</span>
              <strong>{currentUser.full_name}</strong>
              <small>{currentUser.roles.join(", ") || t("session.noRole")}</small>
            </div>
          </div>
          <button className="nav-item logout-button" onClick={handleLogout}>
            <LogOut size={18} />
            {t("session.signOut")}
          </button>
        </div>
      </aside>

      <section className="workspace">
        {resolvedView === "clients" && isCreatingClient ? (
          <NewClientModule
            accessToken={accessToken}
            currentUser={currentUser}
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
        ) : resolvedView === "gyms" && isCreatingGym ? (
          <NewGymModule
            accessToken={accessToken}
            onCancel={() => setIsCreatingGym(false)}
            onCreated={() => {
              setIsCreatingGym(false);
              setGymsReloadKey((value) => value + 1);
            }}
          />
        ) : resolvedView === "gyms" && selectedGymId !== null ? (
          <GymDetailModule
            accessToken={accessToken}
            gymId={selectedGymId}
            onBack={() => {
              setSelectedGymId(null);
              setGymsReloadKey((value) => value + 1);
            }}
          />
        ) : resolvedView === "gyms" ? (
          <GymsModule
            key={gymsReloadKey}
            accessToken={accessToken}
            onSelectGym={setSelectedGymId}
            onCreateGym={() => setIsCreatingGym(true)}
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
