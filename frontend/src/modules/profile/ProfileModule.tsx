import { FormEvent, useEffect, useMemo, useState } from "react";
import { KeyRound, Ruler, Save, UserCircle } from "lucide-react";
import {
  AuthUser,
  ClientDetail,
  changePassword,
  fetchClientDetail,
  updateMyProfile,
} from "../../api";

type Props = {
  accessToken: string;
  currentUser: AuthUser;
  onProfileUpdated: (user: AuthUser) => void;
};

export function ProfileModule({ accessToken, currentUser, onProfileUpdated }: Props) {
  const isClient = currentUser.roles.includes("client");
  return (
    <section className="module-stack" aria-label="Profile">
      <header className="module-header">
        <div>
          <h1>Profile</h1>
          <p>Update your details, change your password, and review your data.</p>
        </div>
      </header>

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
      setFeedback("Full name is required.");
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
      setFeedback("Profile updated.");
    } catch (err) {
      setFeedbackKind("error");
      setFeedback(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="panel" onSubmit={handleSubmit}>
      <div className="panel-header">
        <div className="coach-card-header">
          <UserCircle size={16} />
          <span>Basic info</span>
        </div>
        <span className="muted">@{currentUser.username}</span>
      </div>

      <div className="form-grid">
        <label className="field">
          <span>Full name *</span>
          <input
            type="text"
            value={fullName}
            required
            onChange={(event) => setFullName(event.target.value)}
          />
        </label>
        <label className="field">
          <span>Email *</span>
          <input
            type="email"
            value={email}
            required
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label className="field">
          <span>Personal number</span>
          <input
            type="tel"
            value={personalNumber}
            placeholder="e.g. +52 555 123 4567"
            onChange={(event) => setPersonalNumber(event.target.value)}
          />
        </label>
        <label className="field">
          <span>National ID number</span>
          <input
            type="text"
            value={idNumber}
            placeholder="e.g. CURP / DNI / passport"
            onChange={(event) => setIdNumber(event.target.value)}
          />
        </label>
        <label className="field">
          <span>Birth date</span>
          <input
            type="date"
            value={birthDate}
            onChange={(event) => setBirthDate(event.target.value)}
          />
        </label>
      </div>

      <label className="field">
        <span>Description</span>
        <textarea
          rows={3}
          value={description}
          placeholder="Bio, goals, or anything you want to share."
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>

      <div className="panel-actions">
        <button
          type="submit"
          className="primary-button"
          disabled={isSaving || !dirty}
        >
          <Save size={16} /> {isSaving ? "Saving…" : "Save changes"}
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
      setFeedback("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setFeedbackKind("error");
      setFeedback("New password and confirmation don't match.");
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
      setFeedback("Password changed.");
    } catch (err) {
      setFeedbackKind("error");
      setFeedback(err instanceof Error ? err.message : "Could not change password.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="panel" onSubmit={handleSubmit}>
      <div className="panel-header">
        <div className="coach-card-header">
          <KeyRound size={16} />
          <span>Change password</span>
        </div>
      </div>

      <div className="form-grid">
        <label className="field">
          <span>Current password *</span>
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
          <span>New password * (min 8 chars)</span>
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
          <span>Confirm new password *</span>
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
          <Save size={16} /> {isSaving ? "Saving…" : "Change password"}
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
          setError(err instanceof Error ? err.message : "Could not load measurements.");
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, clientId]);

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
          <span>Your measurements</span>
        </div>
        <span className="muted">Read-only · your trainer maintains these</span>
      </div>

      {error ? <p className="error-text">{error}</p> : null}
      {isLoading ? <p className="muted">Loading…</p> : null}

      {!isLoading && rows.length === 0 ? (
        <p className="muted">
          Tu profesional aún no ha registrado mediciones. Aparecerán aquí en cuanto las añada.
        </p>
      ) : null}

      {rows.length > 0 ? (
        <div className="table-wrap">
          <table className="detail-table">
            <thead>
              <tr>
                <th>Field</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <td data-label="Field">{row.key}</td>
                  <td data-label="Value">{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
