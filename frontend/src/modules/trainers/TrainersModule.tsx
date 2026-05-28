import { useEffect, useState } from "react";
import {
  Activity,
  CalendarDays,
  ChevronRight,
  IdCard,
  Mail,
  Phone,
  Plus,
  Search,
  Users,
} from "lucide-react";
import { Trainer, fetchTrainers } from "../../api";

type TrainersModuleProps = {
  accessToken: string;
  onSelectTrainer: (trainerId: number) => void;
  onCreateTrainer: () => void;
};

export function TrainersModule({
  accessToken,
  onSelectTrainer,
  onCreateTrainer,
}: TrainersModuleProps) {
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [search, setSearch] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    fetchTrainers(accessToken, { includeInactive })
      .then((result) => {
        if (!cancelled) setTrainers(result);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load trainers.");
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, includeInactive]);

  const filtered = trainers.filter((trainer) => {
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return (
      trainer.full_name.toLowerCase().includes(term) ||
      trainer.email.toLowerCase().includes(term) ||
      trainer.username.toLowerCase().includes(term)
    );
  });

  return (
    <section className="module-stack" aria-label="Trainers module">
      <header className="module-header">
        <div>
          <h1>Trainers</h1>
          <p>Every active trainer on the platform. {trainers.length} total.</p>
        </div>
        <button className="primary-button" onClick={onCreateTrainer} type="button">
          <Plus size={18} />
          New trainer
        </button>
      </header>

      <section className="client-toolbar" aria-label="Trainer filters">
        <label className="search-field">
          <Search size={18} />
          <input
            placeholder="Search by name, email, or username"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <label className="inline-toggle">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(event) => setIncludeInactive(event.target.checked)}
          />
          Show inactive
        </label>
      </section>

      {error ? <p className="error-text">{error}</p> : null}

      {isLoading ? (
        <p>Loading trainers...</p>
      ) : filtered.length === 0 ? (
        <p>
          {trainers.length === 0
            ? "No trainers yet. Create the first one."
            : "No trainers match your search."}
        </p>
      ) : (
        <section className="clients-grid">
          {filtered.map((trainer) => (
            <article
              className={`client-card ${trainer.active ? "" : "is-inactive"}`}
              key={trainer.id}
            >
              <div className="client-card-header">
                <div className="client-avatar" aria-hidden="true">
                  {getInitials(trainer.full_name)}
                </div>
                <div>
                  <strong>{trainer.full_name}</strong>
                  <span>@{trainer.username}</span>
                </div>
                {!trainer.active ? (
                  <span className="status-pill status-inactive">Inactive</span>
                ) : null}
              </div>

              <div className="client-detail-list">
                <span>
                  <Mail size={16} />
                  {trainer.email}
                </span>
                {trainer.personal_number ? (
                  <span>
                    <Phone size={16} />
                    {trainer.personal_number}
                  </span>
                ) : null}
                {trainer.id_number ? (
                  <span>
                    <IdCard size={16} />
                    {trainer.id_number}
                  </span>
                ) : null}
                {trainer.description ? (
                  <span>
                    <Activity size={16} />
                    {trainer.description}
                  </span>
                ) : null}
                {trainer.birth_date ? (
                  <span>
                    <CalendarDays size={16} />
                    {formatBirthDate(trainer.birth_date)}
                  </span>
                ) : null}
                <span>
                  <Users size={16} />
                  {trainer.active_client_count} active client(s)
                </span>
              </div>

              <div className="client-card-actions">
                <button
                  className="secondary-button view-detail-button"
                  onClick={() => onSelectTrainer(trainer.id)}
                  type="button"
                >
                  View detail <ChevronRight size={16} />
                </button>
              </div>
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
  if (Number.isNaN(date.getTime())) return isoDate;
  const age = Math.floor((Date.now() - date.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
  return `${date.toLocaleDateString()} (age ${age})`;
}
