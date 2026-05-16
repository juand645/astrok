import { useEffect, useState } from "react";
import { Activity, CalendarDays, ChevronRight, Mail, Search } from "lucide-react";
import { Client, fetchMyClients } from "../../api";

type ClientsModuleProps = {
  accessToken: string;
  onSelectClient: (clientId: number) => void;
};

export function ClientsModule({ accessToken, onSelectClient }: ClientsModuleProps) {
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    fetchMyClients(accessToken)
      .then((result) => {
        if (!cancelled) {
          setClients(result);
        }
      })
      .catch((currentError) => {
        if (!cancelled) {
          setError(currentError instanceof Error ? currentError.message : "Could not load clients.");
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
  }, [accessToken]);

  const filtered = clients.filter((client) => {
    const term = search.trim().toLowerCase();
    if (!term) {
      return true;
    }
    return (
      client.full_name.toLowerCase().includes(term) ||
      client.email.toLowerCase().includes(term) ||
      (client.relation_description?.toLowerCase().includes(term) ?? false)
    );
  });

  return (
    <section className="module-stack" aria-label="Clients module">
      <header className="module-header">
        <div>
          <h1>Clients</h1>
          <p>Members assigned to you. {clients.length} total.</p>
        </div>
      </header>

      <section className="client-toolbar" aria-label="Client filters">
        <label className="search-field">
          <Search size={18} />
          <input
            placeholder="Search by name, email, or focus"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      </section>

      {error ? <p className="error-text">{error}</p> : null}

      {isLoading ? (
        <p>Loading clients...</p>
      ) : filtered.length === 0 ? (
        <p>{clients.length === 0 ? "No clients are assigned to you yet." : "No clients match your search."}</p>
      ) : (
        <section className="clients-grid">
          {filtered.map((client) => (
            <article className="client-card" key={client.id}>
              <div className="client-card-header">
                <div className="client-avatar" aria-hidden="true">
                  {getInitials(client.full_name)}
                </div>
                <div>
                  <strong>{client.full_name}</strong>
                  <span>@{client.username}</span>
                </div>
              </div>

              <div className="client-detail-list">
                <span>
                  <Mail size={16} />
                  {client.email}
                </span>
                {client.description ? (
                  <span>
                    <Activity size={16} />
                    {client.description}
                  </span>
                ) : null}
                {client.birth_date ? (
                  <span>
                    <CalendarDays size={16} />
                    {formatBirthDate(client.birth_date)}
                  </span>
                ) : null}
              </div>

              {client.relation_description ? (
                <div className="client-card-footer">
                  <span>Focus</span>
                  <strong>{client.relation_description}</strong>
                </div>
              ) : null}

              <button
                className="secondary-button view-detail-button"
                onClick={() => onSelectClient(client.id)}
                type="button"
              >
                View detail <ChevronRight size={16} />
              </button>
            </article>
          ))}
        </section>
      )}
    </section>
  );
}

function getInitials(fullName: string) {
  return fullName
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function formatBirthDate(isoDate: string) {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return isoDate;
  }
  const age = Math.floor((Date.now() - date.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
  return `${date.toLocaleDateString()} (age ${age})`;
}
