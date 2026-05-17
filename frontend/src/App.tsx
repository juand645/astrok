import { useEffect, useState } from "react";
import { Bot, CalendarDays, Dumbbell, LogOut, Users } from "lucide-react";
import { AuthUser, getCurrentUser } from "./api";
import { LoginModule } from "./modules/auth/LoginModule";
import { ClientDetailModule } from "./modules/clients/ClientDetailModule";
import { ClientsModule } from "./modules/clients/ClientsModule";
import { NewClientModule } from "./modules/clients/NewClientModule";
import { DashboardModule } from "./modules/dashboard/DashboardModule";

type ActiveView = "dashboard" | "clients" | "assistant";

export function App() {
  const [activeView, setActiveView] = useState<ActiveView>("dashboard");
  const [accessToken, setAccessToken] = useState(() => localStorage.getItem("gym_access_token"));
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [isSessionLoading, setIsSessionLoading] = useState(Boolean(accessToken));
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [isCreatingClient, setIsCreatingClient] = useState(false);

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

  function navigateTo(view: ActiveView) {
    setActiveView(view);
    setSelectedClientId(null);
    setIsCreatingClient(false);
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
  const resolvedView: ActiveView = activeView === "clients" && isClient ? "dashboard" : activeView;

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Dumbbell size={22} />
          </div>
          <div>
            <strong>Gym AI</strong>
            <span>Instructor console</span>
          </div>
        </div>

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
            className={`nav-item ${resolvedView === "assistant" ? "active" : ""}`}
            onClick={() => navigateTo("assistant")}
          >
            <Bot size={18} />
            AI Assistant
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
        ) : resolvedView === "assistant" ? (
          <DashboardModule
            title="AI assistant"
            description="Generate routine drafts and prepare appointment support from one workspace."
          />
        ) : (
          <DashboardModule />
        )}
      </section>
    </main>
  );
}
