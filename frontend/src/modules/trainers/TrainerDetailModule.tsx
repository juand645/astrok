import { FormEvent, useEffect, useState } from "react";
import {
  ArrowLeft,
  IdCard,
  Mail,
  Phone,
  RefreshCw,
  Save,
  Trash2,
  UserCircle,
  Users,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  TrainerDetail,
  deleteTrainer,
  fetchTrainerDetail,
  updateTrainer,
} from "../../api";

type Props = {
  accessToken: string;
  trainerId: number;
  onBack: () => void;
  onDeleted: () => void;
};

export function TrainerDetailModule({ accessToken, trainerId, onBack, onDeleted }: Props) {
  const { t, i18n } = useTranslation();
  const [trainer, setTrainer] = useState<TrainerDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    fetchTrainerDetail(accessToken, trainerId)
      .then((result) => {
        if (!cancelled) setTrainer(result);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : t("trainers.detail.errorLoad"));
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, trainerId, reloadKey, t]);

  if (isLoading) {
    return (
      <section className="module-stack" aria-label={t("trainers.detail.ariaLabel")}>
        <p>{t("trainers.detail.loading")}</p>
      </section>
    );
  }

  if (error || !trainer) {
    return (
      <section className="module-stack" aria-label={t("trainers.detail.ariaLabel")}>
        <header className="module-header">
          <button type="button" className="back-button secondary-button" onClick={onBack}>
            <ArrowLeft size={16} /> {t("trainers.detail.back")}
          </button>
        </header>
        <p className="error-text">{error ?? t("trainers.detail.notFound")}</p>
      </section>
    );
  }

  return (
    <section className="module-stack" aria-label={t("trainers.detail.ariaLabel")}>
      <header className="module-header">
        <button type="button" className="back-button secondary-button" onClick={onBack}>
          <ArrowLeft size={16} /> {t("trainers.detail.back")}
        </button>
      </header>


      <header className="detail-header">
        <div className="client-avatar" aria-hidden="true">
          {getInitials(trainer.full_name)}
        </div>
        <div className="detail-header-body">
          <h1>{trainer.full_name}</h1>
          <p className="muted">@{trainer.username}</p>
          <div className="detail-meta">
            <span>
              <Mail size={14} /> {trainer.email}
            </span>
            {trainer.personal_number ? (
              <span>
                <Phone size={14} /> {trainer.personal_number}
              </span>
            ) : null}
            {trainer.id_number ? (
              <span>
                <IdCard size={14} /> {trainer.id_number}
              </span>
            ) : null}
            {trainer.birth_date ? (
              <span>
                {t("trainers.detail.born", {
                  date: formatBirthDate(trainer.birth_date, i18n.language, (age) =>
                    t("trainers.list.age", { age }),
                  ),
                })}
              </span>
            ) : null}
            <span className={`status-pill ${trainer.active ? "status-approved" : "status-inactive"}`}>
              {trainer.active ? t("trainers.detail.statusActive") : t("trainers.detail.statusInactive")}
            </span>
          </div>
        </div>
        <TrainerHeaderActions
          accessToken={accessToken}
          trainer={trainer}
          onDeleted={onDeleted}
          onReactivated={() => setReloadKey((value) => value + 1)}
        />
      </header>

      <TrainerEditorPanel
        accessToken={accessToken}
        trainer={trainer}
        onSaved={(updated) => setTrainer({ ...trainer, ...updated })}
      />

      <TrainerClientsPanel trainer={trainer} />
    </section>
  );
}

function TrainerEditorPanel({
  accessToken,
  trainer,
  onSaved,
}: {
  accessToken: string;
  trainer: TrainerDetail;
  onSaved: (trainer: TrainerDetail) => void;
}) {
  const { t } = useTranslation();
  const [fullName, setFullName] = useState(trainer.full_name);
  const [email, setEmail] = useState(trainer.email);
  const [personalNumber, setPersonalNumber] = useState(trainer.personal_number ?? "");
  const [idNumber, setIdNumber] = useState(trainer.id_number ?? "");
  const [birthDate, setBirthDate] = useState(trainer.birth_date ?? "");
  const [description, setDescription] = useState(trainer.description ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackKind, setFeedbackKind] = useState<"ok" | "error">("ok");

  useEffect(() => {
    setFullName(trainer.full_name);
    setEmail(trainer.email);
    setPersonalNumber(trainer.personal_number ?? "");
    setIdNumber(trainer.id_number ?? "");
    setBirthDate(trainer.birth_date ?? "");
    setDescription(trainer.description ?? "");
  }, [trainer]);

  const dirty =
    fullName.trim() !== trainer.full_name ||
    email.trim() !== trainer.email ||
    personalNumber.trim() !== (trainer.personal_number ?? "") ||
    idNumber.trim() !== (trainer.id_number ?? "") ||
    (birthDate || null) !== (trainer.birth_date ?? null) ||
    description.trim() !== (trainer.description ?? "");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFeedback(null);
    const trimmedName = fullName.trim();
    if (!trimmedName) {
      setFeedbackKind("error");
      setFeedback(t("trainers.detail.errorRequired"));
      return;
    }
    setIsSaving(true);
    try {
      const updated = await updateTrainer(accessToken, trainer.id, {
        full_name: trimmedName,
        email: email.trim(),
        personal_number: personalNumber.trim() || null,
        id_number: idNumber.trim() || null,
        birth_date: birthDate || null,
        description: description.trim() || null,
      });
      onSaved({ ...trainer, ...updated });
      setFeedbackKind("ok");
      setFeedback(t("trainers.detail.saved"));
    } catch (err) {
      setFeedbackKind("error");
      setFeedback(err instanceof Error ? err.message : t("trainers.detail.errorSave"));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="panel" onSubmit={handleSubmit}>
      <div className="panel-header">
        <div className="coach-card-header">
          <UserCircle size={16} />
          <span>{t("trainers.detail.profileHeading")}</span>
        </div>
      </div>

      <div className="form-grid">
        <label className="field">
          <span>{t("trainers.detail.fullName")}</span>
          <input
            type="text"
            value={fullName}
            required
            onChange={(event) => setFullName(event.target.value)}
          />
        </label>
        <label className="field">
          <span>{t("trainers.detail.email")}</span>
          <input
            type="email"
            value={email}
            required
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label className="field">
          <span>{t("trainers.detail.personalNumber")}</span>
          <input
            type="tel"
            value={personalNumber}
            placeholder={t("trainers.detail.personalNumberPlaceholder")}
            onChange={(event) => setPersonalNumber(event.target.value)}
          />
        </label>
        <label className="field">
          <span>{t("trainers.detail.idNumber")}</span>
          <input
            type="text"
            value={idNumber}
            placeholder={t("trainers.detail.idNumberPlaceholder")}
            onChange={(event) => setIdNumber(event.target.value)}
          />
        </label>
        <label className="field">
          <span>{t("trainers.detail.birthDate")}</span>
          <input
            type="date"
            value={birthDate}
            onChange={(event) => setBirthDate(event.target.value)}
          />
        </label>
      </div>

      <label className="field">
        <span>{t("trainers.detail.description")}</span>
        <textarea
          rows={3}
          value={description}
          placeholder={t("trainers.detail.descriptionPlaceholder")}
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>

      <div className="panel-actions">
        <button type="submit" className="primary-button" disabled={isSaving || !dirty}>
          <Save size={16} /> {isSaving ? t("trainers.detail.saving") : t("trainers.detail.save")}
        </button>
      </div>

      {feedback ? (
        <p className={feedbackKind === "ok" ? "muted" : "error-text"}>{feedback}</p>
      ) : null}
    </form>
  );
}

function TrainerClientsPanel({ trainer }: { trainer: TrainerDetail }) {
  const { t } = useTranslation();
  return (
    <section className="panel">
      <div className="panel-header">
        <div className="coach-card-header">
          <Users size={16} />
          <span>{t("trainers.detail.clientsHeading")}</span>
        </div>
        <span className="muted">
          {t("trainers.detail.clientsHint", { count: trainer.clients.length })}
        </span>
      </div>

      {trainer.clients.length === 0 ? (
        <p className="muted">{t("trainers.detail.noClients")}</p>
      ) : (
        <ul className="parq-history-list">
          {trainer.clients.map((client) => (
            <li key={client.id}>
              <strong>{client.full_name}</strong>{" "}
              <span className="muted">
                @{client.username} · {client.email}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TrainerHeaderActions({
  accessToken,
  trainer,
  onDeleted,
  onReactivated,
}: {
  accessToken: string;
  trainer: TrainerDetail;
  onDeleted: () => void;
  onReactivated: () => void;
}) {
  const { t } = useTranslation();
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (!window.confirm(t("trainers.detail.confirmDelete", { name: trainer.full_name }))) {
      return;
    }
    setIsWorking(true);
    setError(null);
    try {
      await deleteTrainer(accessToken, trainer.id);
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("trainers.detail.errorDelete"));
      setIsWorking(false);
    }
  }

  async function handleReactivate() {
    setIsWorking(true);
    setError(null);
    try {
      await updateTrainer(accessToken, trainer.id, { active: true });
      onReactivated();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("trainers.detail.errorReactivate"));
    } finally {
      setIsWorking(false);
    }
  }

  return (
    <div className="detail-header-actions">
      {trainer.active ? (
        <button
          type="button"
          className="secondary-button danger-button"
          onClick={handleDelete}
          disabled={isWorking}
        >
          <Trash2 size={16} /> {isWorking ? t("trainers.detail.working") : t("trainers.detail.delete")}
        </button>
      ) : (
        <button
          type="button"
          className="primary-button"
          onClick={handleReactivate}
          disabled={isWorking}
        >
          <RefreshCw size={16} /> {isWorking ? t("trainers.detail.working") : t("trainers.detail.reactivate")}
        </button>
      )}
      {error ? <span className="error-text">{error}</span> : null}
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
