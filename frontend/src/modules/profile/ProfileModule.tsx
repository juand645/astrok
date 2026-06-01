import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Globe, KeyRound, Ruler, Save, Trash2, Upload, UserCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  AuthUser,
  ClientDetail,
  changePassword,
  deleteMyAvatar,
  fetchClientDetail,
  updateMyProfile,
  uploadMyAvatar,
} from "../../api";

type Props = {
  accessToken: string;
  currentUser: AuthUser;
  onProfileUpdated: (user: AuthUser) => void;
};

export function ProfileModule({ accessToken, currentUser, onProfileUpdated }: Props) {
  const { t } = useTranslation();
  const isClient = currentUser.roles.includes("client");
  return (
    <section className="module-stack" aria-label={t("profile.ariaLabel")}>
      <header className="module-header">
        <div>
          <h1>{t("profile.title")}</h1>
          <p>{t("profile.subtitle")}</p>
        </div>
      </header>

      <AvatarPanel
        accessToken={accessToken}
        currentUser={currentUser}
        onProfileUpdated={onProfileUpdated}
      />

      <LanguagePanel />

      <BasicInfoPanel
        accessToken={accessToken}
        currentUser={currentUser}
        onProfileUpdated={onProfileUpdated}
      />

      <PasswordPanel accessToken={accessToken} />

      {isClient ? (
        <MeasuresPanel accessToken={accessToken} clientId={currentUser.id} />
      ) : null}
    </section>
  );
}

// ---------- Language switcher ----------

function LanguagePanel() {
  const { t, i18n } = useTranslation();

  function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    void i18n.changeLanguage(event.target.value);
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div className="coach-card-header">
          <Globe size={16} />
          <span>{t("profile.language")}</span>
        </div>
        <span className="muted">{t("profile.languageHint")}</span>
      </div>

      <label className="field">
        <span>{t("profile.language")}</span>
        <select value={i18n.resolvedLanguage ?? "en"} onChange={handleChange}>
          <option value="en">{t("profile.english")}</option>
          <option value="es">{t("profile.spanish")}</option>
        </select>
      </label>
    </section>
  );
}

// ---------- Avatar ----------

function AvatarPanel({
  accessToken,
  currentUser,
  onProfileUpdated,
}: {
  accessToken: string;
  currentUser: AuthUser;
  onProfileUpdated: (user: AuthUser) => void;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackKind, setFeedbackKind] = useState<"ok" | "error">("ok");

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setIsWorking(true);
    setFeedback(null);
    try {
      const updated = await uploadMyAvatar(accessToken, file);
      onProfileUpdated(updated);
      setFeedbackKind("ok");
      setFeedback(t("profile.avatar.photoUpdated"));
    } catch (err) {
      setFeedbackKind("error");
      setFeedback(err instanceof Error ? err.message : t("profile.avatar.errorUpload"));
    } finally {
      setIsWorking(false);
    }
  }

  async function handleRemove() {
    setIsWorking(true);
    setFeedback(null);
    try {
      const updated = await deleteMyAvatar(accessToken);
      onProfileUpdated(updated);
      setFeedbackKind("ok");
      setFeedback(t("profile.avatar.photoRemoved"));
    } catch (err) {
      setFeedbackKind("error");
      setFeedback(err instanceof Error ? err.message : t("profile.avatar.errorRemove"));
    } finally {
      setIsWorking(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div className="coach-card-header">
          <UserCircle size={16} />
          <span>{t("profile.avatar.heading")}</span>
        </div>
        <span className="muted">{t("profile.avatar.hint")}</span>
      </div>

      <div className="avatar-panel-body">
        <div className="avatar-preview" aria-hidden="true">
          {currentUser.photo_url ? (
            <img src={currentUser.photo_url} alt="" />
          ) : (
            <span>{getInitials(currentUser.full_name)}</span>
          )}
        </div>
        <div className="avatar-panel-actions">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="visually-hidden"
            onChange={handleFile}
          />
          <button
            type="button"
            className="primary-button"
            onClick={() => inputRef.current?.click()}
            disabled={isWorking}
          >
            <Upload size={16} />
            {isWorking
              ? t("profile.avatar.working")
              : currentUser.photo_url
                ? t("profile.avatar.replace")
                : t("profile.avatar.upload")}
          </button>
          {currentUser.photo_url ? (
            <button
              type="button"
              className="secondary-button danger-button"
              onClick={handleRemove}
              disabled={isWorking}
            >
              <Trash2 size={16} /> {t("profile.avatar.remove")}
            </button>
          ) : null}
        </div>
      </div>

      {feedback ? (
        <p className={feedbackKind === "ok" ? "muted" : "error-text"}>{feedback}</p>
      ) : null}
    </section>
  );
}

function getInitials(fullName: string): string {
  return fullName
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// ---------- Basic info ----------

function BasicInfoPanel({
  accessToken,
  currentUser,
  onProfileUpdated,
}: {
  accessToken: string;
  currentUser: AuthUser;
  onProfileUpdated: (user: AuthUser) => void;
}) {
  const { t } = useTranslation();
  const [fullName, setFullName] = useState(currentUser.full_name);
  const [email, setEmail] = useState(currentUser.email);
  const [personalNumber, setPersonalNumber] = useState(currentUser.personal_number ?? "");
  const [idNumber, setIdNumber] = useState(currentUser.id_number ?? "");
  const [birthDate, setBirthDate] = useState(currentUser.birth_date ?? "");
  const [description, setDescription] = useState(currentUser.description ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackKind, setFeedbackKind] = useState<"ok" | "error">("ok");

  useEffect(() => {
    setFullName(currentUser.full_name);
    setEmail(currentUser.email);
    setPersonalNumber(currentUser.personal_number ?? "");
    setIdNumber(currentUser.id_number ?? "");
    setBirthDate(currentUser.birth_date ?? "");
    setDescription(currentUser.description ?? "");
  }, [currentUser]);

  const dirty =
    fullName.trim() !== currentUser.full_name ||
    email.trim() !== currentUser.email ||
    personalNumber.trim() !== (currentUser.personal_number ?? "") ||
    idNumber.trim() !== (currentUser.id_number ?? "") ||
    (birthDate || null) !== (currentUser.birth_date ?? null) ||
    description.trim() !== (currentUser.description ?? "");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFeedback(null);

    const trimmedName = fullName.trim();
    if (!trimmedName) {
      setFeedbackKind("error");
      setFeedback(t("profile.basic.errorRequired"));
      return;
    }

    setIsSaving(true);
    try {
      const updated = await updateMyProfile(accessToken, {
        full_name: trimmedName,
        email: email.trim(),
        personal_number: personalNumber.trim() || null,
        id_number: idNumber.trim() || null,
        birth_date: birthDate || null,
        description: description.trim() || null,
      });
      onProfileUpdated(updated);
      setFeedbackKind("ok");
      setFeedback(t("profile.basic.saved"));
    } catch (err) {
      setFeedbackKind("error");
      setFeedback(err instanceof Error ? err.message : t("profile.basic.errorSave"));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="panel" onSubmit={handleSubmit}>
      <div className="panel-header">
        <div className="coach-card-header">
          <UserCircle size={16} />
          <span>{t("profile.basic.heading")}</span>
        </div>
        <span className="muted">@{currentUser.username}</span>
      </div>

      <div className="form-grid">
        <label className="field">
          <span>{t("profile.basic.fullName")}</span>
          <input
            type="text"
            value={fullName}
            required
            onChange={(event) => setFullName(event.target.value)}
          />
        </label>
        <label className="field">
          <span>{t("profile.basic.email")}</span>
          <input
            type="email"
            value={email}
            required
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label className="field">
          <span>{t("profile.basic.personalNumber")}</span>
          <input
            type="tel"
            value={personalNumber}
            placeholder={t("profile.basic.personalNumberPlaceholder")}
            onChange={(event) => setPersonalNumber(event.target.value)}
          />
        </label>
        <label className="field">
          <span>{t("profile.basic.idNumber")}</span>
          <input
            type="text"
            value={idNumber}
            placeholder={t("profile.basic.idNumberPlaceholder")}
            onChange={(event) => setIdNumber(event.target.value)}
          />
        </label>
        <label className="field">
          <span>{t("profile.basic.birthDate")}</span>
          <input
            type="date"
            value={birthDate}
            onChange={(event) => setBirthDate(event.target.value)}
          />
        </label>
      </div>

      <label className="field">
        <span>{t("profile.basic.description")}</span>
        <textarea
          rows={3}
          value={description}
          placeholder={t("profile.basic.descriptionPlaceholder")}
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>

      <div className="panel-actions">
        <button
          type="submit"
          className="primary-button"
          disabled={isSaving || !dirty}
        >
          <Save size={16} /> {isSaving ? t("profile.basic.saving") : t("profile.basic.save")}
        </button>
      </div>

      {feedback ? (
        <p className={feedbackKind === "ok" ? "muted" : "error-text"}>{feedback}</p>
      ) : null}
    </form>
  );
}

// ---------- Password ----------

function PasswordPanel({ accessToken }: { accessToken: string }) {
  const { t } = useTranslation();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackKind, setFeedbackKind] = useState<"ok" | "error">("ok");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFeedback(null);

    if (newPassword.length < 8) {
      setFeedbackKind("error");
      setFeedback(t("profile.password.errorShort"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setFeedbackKind("error");
      setFeedback(t("profile.password.errorMismatch"));
      return;
    }

    setIsSaving(true);
    try {
      await changePassword(accessToken, {
        current_password: currentPassword,
        new_password: newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setFeedbackKind("ok");
      setFeedback(t("profile.password.saved"));
    } catch (err) {
      setFeedbackKind("error");
      setFeedback(err instanceof Error ? err.message : t("profile.password.errorSave"));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="panel" onSubmit={handleSubmit}>
      <div className="panel-header">
        <div className="coach-card-header">
          <KeyRound size={16} />
          <span>{t("profile.password.heading")}</span>
        </div>
      </div>

      <div className="form-grid">
        <label className="field">
          <span>{t("profile.password.current")}</span>
          <input
            type="password"
            value={currentPassword}
            required
            autoComplete="current-password"
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
        </label>
        <span aria-hidden="true" />
        <label className="field">
          <span>{t("profile.password.new")}</span>
          <input
            type="password"
            value={newPassword}
            required
            minLength={8}
            autoComplete="new-password"
            onChange={(event) => setNewPassword(event.target.value)}
          />
        </label>
        <label className="field">
          <span>{t("profile.password.confirm")}</span>
          <input
            type="password"
            value={confirmPassword}
            required
            minLength={8}
            autoComplete="new-password"
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
        </label>
      </div>

      <div className="panel-actions">
        <button
          type="submit"
          className="primary-button"
          disabled={isSaving || !currentPassword || !newPassword || !confirmPassword}
        >
          <Save size={16} /> {isSaving ? t("profile.password.saving") : t("profile.password.save")}
        </button>
      </div>

      {feedback ? (
        <p className={feedbackKind === "ok" ? "muted" : "error-text"}>{feedback}</p>
      ) : null}
    </form>
  );
}

// ---------- Measurements (read-only, clients only) ----------

function MeasuresPanel({
  accessToken,
  clientId,
}: {
  accessToken: string;
  clientId: number;
}) {
  const { t } = useTranslation();
  const [detail, setDetail] = useState<ClientDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    fetchClientDetail(accessToken, clientId)
      .then((result) => {
        if (!cancelled) setDetail(result);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : t("profile.measures.errorLoad"));
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, clientId, t]);

  const rows = useMemo(() => {
    if (!detail) return [];
    return Object.entries(detail.measures ?? {}).map(([key, value]) => ({
      key,
      value: String(value),
    }));
  }, [detail]);

  return (
    <section className="panel">
      <div className="panel-header">
        <div className="coach-card-header">
          <Ruler size={16} />
          <span>{t("profile.measures.heading")}</span>
        </div>
        <span className="muted">{t("profile.measures.hint")}</span>
      </div>

      {error ? <p className="error-text">{error}</p> : null}
      {isLoading ? <p className="muted">{t("profile.measures.loading")}</p> : null}

      {!isLoading && rows.length === 0 ? (
        <p className="muted">{t("profile.measures.empty")}</p>
      ) : null}

      {rows.length > 0 ? (
        <div className="table-wrap">
          <table className="detail-table">
            <thead>
              <tr>
                <th>{t("profile.measures.field")}</th>
                <th>{t("profile.measures.value")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <td data-label={t("profile.measures.field")}>{row.key}</td>
                  <td data-label={t("profile.measures.value")}>{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
