import { FormEvent, useEffect, useState } from "react";
import {
  Activity,
  ArrowRightLeft,
  CalendarDays,
  ChevronRight,
  IdCard,
  Mail,
  Phone,
  Plus,
  Search,
  UserCircle,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Client,
  UserSummary,
  fetchMyClients,
  fetchProfessionals,
  transferClient,
} from "../../api";

type ClientsModuleProps = {
  accessToken: string;
  canCreate: boolean;
  onSelectClient: (clientId: number) => void;
  onCreateClient: () => void;
};

export function ClientsModule({
  accessToken,
  canCreate,
  onSelectClient,
  onCreateClient,
}: ClientsModuleProps) {
  const { t, i18n } = useTranslation();
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transferTarget, setTransferTarget] = useState<Client | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    fetchMyClients(accessToken, { includeInactive })
      .then((result) => {
        if (!cancelled) {
          setClients(result);
        }
      })
      .catch((currentError) => {
        if (!cancelled) {
          setError(
            currentError instanceof Error ? currentError.message : t("clients.list.errorLoad"),
          );
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
  }, [accessToken, reloadKey, includeInactive, t]);

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
    <section className="module-stack" aria-label={t("clients.list.ariaLabel")}>
      <header className="module-header">
        <div>
          <h1>{t("clients.list.title")}</h1>
          <p>{t("clients.list.subtitle", { count: clients.length })}</p>
        </div>
        {canCreate ? (
          <button className="primary-button" onClick={onCreateClient} type="button">
            <Plus size={18} />
            {t("clients.list.new")}
          </button>
        ) : null}
      </header>

      <section className="client-toolbar" aria-label={t("clients.list.filtersLabel")}>
        <label className="search-field">
          <Search size={18} />
          <input
            placeholder={t("clients.list.searchPlaceholder")}
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
          {t("clients.list.showInactive")}
        </label>
      </section>

      {error ? <p className="error-text">{error}</p> : null}

      {isLoading ? (
        <p>{t("clients.list.loading")}</p>
      ) : filtered.length === 0 ? (
        <p>{clients.length === 0 ? t("clients.list.empty") : t("clients.list.noMatch")}</p>
      ) : (
        <section className="clients-grid">
          {filtered.map((client) => (
            <article
              className={`client-card ${client.active ? "" : "is-inactive"}`}
              key={client.id}
            >
              <div className="client-card-trainer" title={t("clients.list.assignedTrainerTitle")}>
                <UserCircle size={14} />
                <span>{t("clients.list.trainerLabel")}</span>
                <strong>{client.professional_name ?? t("clients.list.unassigned")}</strong>
              </div>

              <div className="client-card-header">
                <div className="client-avatar" aria-hidden="true">
                  {getInitials(client.full_name)}
                </div>
                <div>
                  <strong>{client.full_name}</strong>
                  <span>@{client.username}</span>
                </div>
                {!client.active ? (
                  <span className="status-pill status-inactive">{t("clients.list.inactive")}</span>
                ) : null}
              </div>

              <div className="client-detail-list">
                <span>
                  <Mail size={16} />
                  {client.email}
                </span>
                {client.personal_number ? (
                  <span>
                    <Phone size={16} />
                    {client.personal_number}
                  </span>
                ) : null}
                {client.id_number ? (
                  <span>
                    <IdCard size={16} />
                    {client.id_number}
                  </span>
                ) : null}
                {client.description ? (
                  <span>
                    <Activity size={16} />
                    {client.description}
                  </span>
                ) : null}
                {client.birth_date ? (
                  <span>
                    <CalendarDays size={16} />
                    {formatBirthDate(client.birth_date, i18n.language, (age) =>
                      t("clients.list.age", { age }),
                    )}
                  </span>
                ) : null}
              </div>

              {client.relation_description ? (
                <div className="client-card-footer">
                  <span>{t("clients.list.focus")}</span>
                  <strong>{client.relation_description}</strong>
                </div>
              ) : null}

              <div className="client-card-actions">
                <button
                  className="ghost-button transfer-button"
                  onClick={() => setTransferTarget(client)}
                  type="button"
                >
                  <ArrowRightLeft size={14} /> {t("clients.list.transfer")}
                </button>
                <button
                  className="secondary-button view-detail-button"
                  onClick={() => onSelectClient(client.id)}
                  type="button"
                >
                  {t("clients.list.viewDetail")} <ChevronRight size={16} />
                </button>
              </div>
            </article>
          ))}
        </section>
      )}

      {transferTarget ? (
        <TransferClientModal
          accessToken={accessToken}
          client={transferTarget}
          onCancel={() => setTransferTarget(null)}
          onTransferred={() => {
            setTransferTarget(null);
            setReloadKey((value) => value + 1);
          }}
        />
      ) : null}
    </section>
  );
}

function TransferClientModal({
  accessToken,
  client,
  onCancel,
  onTransferred,
}: {
  accessToken: string;
  client: Client;
  onCancel: () => void;
  onTransferred: () => void;
}) {
  const { t } = useTranslation();
  const [professionals, setProfessionals] = useState<UserSummary[] | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetchProfessionals(accessToken)
      .then((rows) => {
        if (cancelled) return;
        const eligible = rows.filter((row) => row.id !== client.professional_id);
        setProfessionals(eligible);
        setSelectedId(eligible[0]?.id ?? null);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : t("clients.transfer.errorLoad"));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, client.professional_id, t]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (selectedId === null) return;
    setIsSaving(true);
    setError(null);
    try {
      await transferClient(accessToken, client.id, {
        new_professional_id: selectedId,
        note: note.trim() || null,
      });
      onTransferred();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("clients.transfer.errorTransfer"));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={onCancel}>
      <form
        className="modal-panel"
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <h2>{t("clients.transfer.title", { name: client.full_name })}</h2>
        <p className="muted">{t("clients.transfer.intro")}</p>

        <label className="field">
          <span>{t("clients.transfer.newTrainer")}</span>
          {professionals === null ? (
            <p className="muted">{t("clients.transfer.loadingTrainers")}</p>
          ) : professionals.length === 0 ? (
            <p className="muted">{t("clients.transfer.noOtherTrainers")}</p>
          ) : (
            <select
              value={selectedId ?? ""}
              onChange={(event) => setSelectedId(Number(event.target.value))}
            >
              {professionals.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.full_name} (@{person.username})
                </option>
              ))}
            </select>
          )}
        </label>

        <label className="field">
          <span>{t("clients.transfer.note")}</span>
          <textarea
            rows={2}
            value={note}
            placeholder={t("clients.transfer.notePlaceholder")}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>

        {error ? <p className="error-text">{error}</p> : null}

        <div className="modal-actions">
          <button type="button" className="ghost-button" onClick={onCancel} disabled={isSaving}>
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            className="primary-button"
            disabled={isSaving || selectedId === null}
          >
            {isSaving ? t("clients.transfer.transferring") : t("clients.transfer.submit")}
          </button>
        </div>
      </form>
    </div>
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

function formatBirthDate(isoDate: string, locale: string, ageLabel: (age: number) => string) {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return isoDate;
  }
  const age = Math.floor((Date.now() - date.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
  return `${date.toLocaleDateString(locale)} (${ageLabel(age)})`;
}
