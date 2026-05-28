import { FormEvent, useState } from "react";
import { ArrowLeft, Save } from "lucide-react";
import { TrainerCreatePayload, createTrainer } from "../../api";

type NewTrainerModuleProps = {
  accessToken: string;
  onCancel: () => void;
  onCreated: () => void;
};

export function NewTrainerModule({ accessToken, onCancel, onCreated }: NewTrainerModuleProps) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [personalNumber, setPersonalNumber] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [description, setDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    const payload: TrainerCreatePayload = {
      full_name: fullName.trim(),
      email: email.trim(),
      username: username.trim(),
      password,
      personal_number: personalNumber.trim() || null,
      id_number: idNumber.trim() || null,
      birth_date: birthDate || null,
      description: description.trim() || null,
    };

    setIsSaving(true);
    try {
      await createTrainer(accessToken, payload);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create trainer.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="module-stack" aria-label="New trainer">
      <header className="module-header">
        <button type="button" className="back-button secondary-button" onClick={onCancel}>
          <ArrowLeft size={16} /> Back to trainers
        </button>
      </header>

      <article className="panel">
        <div className="panel-header">
          <div>
            <h1>New trainer</h1>
            <p>Create a trainer account and a temporary password they can change later.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <section className="panel">
            <div className="panel-header">
              <h2>Basic info</h2>
              <span>Account credentials and identity</span>
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
                <span>Username *</span>
                <input
                  type="text"
                  value={username}
                  required
                  onChange={(event) => setUsername(event.target.value)}
                />
              </label>
              <label className="field">
                <span>Temporary password * (min 8 chars)</span>
                <input
                  type="text"
                  value={password}
                  required
                  minLength={8}
                  onChange={(event) => setPassword(event.target.value)}
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
            </div>

            <label className="field">
              <span>Description</span>
              <textarea
                rows={3}
                value={description}
                placeholder="Specialization, years of experience, anything that helps identify them."
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
          </section>

          {error ? <p className="error-text">{error}</p> : null}

          <div className="panel-actions">
            <button className="secondary-button" type="button" onClick={onCancel}>
              Cancel
            </button>
            <button className="primary-button" type="submit" disabled={isSaving}>
              <Save size={16} /> {isSaving ? "Creating..." : "Create trainer"}
            </button>
          </div>
        </form>
      </article>
    </section>
  );
}
