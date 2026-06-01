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
import { useTranslation } from "react-i18next";
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
  const { t, i18n } = useTranslation();
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
          setError(err instanceof Error ? err.message : t("trainers.list.errorLoad"));
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, includeInactive, t]);

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
    <section className="module-stack" aria-label={t("trainers.list.ariaLabel")}>
      <header className="module-header">
        <div>
          <h1>{t("trainers.list.title")}</h1>
          <p>{t("trainers.list.subtitle", { count: trainers.length })}</p>
        </div>
        <button className="primary-button" onClick={onCreateTrainer} type="button">
          <Plus size={18} />
          {t("trainers.list.new")}
        </button>
      </header>

      <section className="client-toolbar" aria-label={t("trainers.list.filtersLabel")}>
        <label className="search-field">
          <Search size={18} />
          <input
            placeholder={t("trainers.list.searchPlaceholder")}
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
          {t("trainers.list.showInactive")}
        </label>
      </section>

      {error ? <p className="error-text">{error}</p> : null}

      {isLoading ? (
        <p>{t("trainers.list.loading")}</p>
      ) : filtered.length === 0 ? (
        <p>
          {trainers.length === 0
            ? t("trainers.list.empty")
            : t("trainers.list.noMatch")}
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
                  <span className="status-pill status-inactive">{t("trainers.list.inactive")}</span>
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
                    {formatBirthDate(trainer.birth_date, i18n.language, (age) =>
                      t("trainers.list.age", { age }),
                    )}
                  </span>
                ) : null}
                <span>
                  <Users size={16} />
                  {t("trainers.list.activeClientCount", { count: trainer.active_client_count })}
                </span>
              </div>

              <div className="client-card-actions">
                <button
                  className="secondary-button view-detail-button"
                  onClick={() => onSelectTrainer(trainer.id)}
                  type="button"
                >
                  {t("trainers.list.viewDetail")} <ChevronRight size={16} />
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

function formatBirthDate(
  isoDate: string,
  locale: string,
  ageLabel: (age: number) => string,
) {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return isoDate;
  const age = Math.floor((Date.now() - date.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
  return `${date.toLocaleDateString(locale)} (${ageLabel(age)})`;
}
