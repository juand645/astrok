import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { ClientDetail, updateClient } from "../../api";

type Props = {
  accessToken: string;
  client: ClientDetail;
  onSaved: (client: ClientDetail) => void;
};

export function ClientNotesPanel({ accessToken, client, onSaved }: Props) {
  const [description, setDescription] = useState(client.description ?? "");
  const [personalNumber, setPersonalNumber] = useState(client.personal_number ?? "");
  const [idNumber, setIdNumber] = useState(client.id_number ?? "");
  const [relationDescription, setRelationDescription] = useState(
    client.relation_description ?? "",
  );
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackKind, setFeedbackKind] = useState<"ok" | "error">("ok");

  useEffect(() => {
    setDescription(client.description ?? "");
    setPersonalNumber(client.personal_number ?? "");
    setIdNumber(client.id_number ?? "");
    setRelationDescription(client.relation_description ?? "");
  }, [
    client.description,
    client.personal_number,
    client.id_number,
    client.relation_description,
  ]);

  async function save() {
    setFeedback(null);
    setIsSaving(true);
    try {
      const trimmedDescription = description.trim();
      const trimmedPersonalNumber = personalNumber.trim();
      const trimmedIdNumber = idNumber.trim();
      const trimmedRelationDescription = relationDescription.trim();
      const updated = await updateClient(accessToken, client.id, {
        description: trimmedDescription === "" ? null : trimmedDescription,
        personal_number: trimmedPersonalNumber === "" ? null : trimmedPersonalNumber,
        id_number: trimmedIdNumber === "" ? null : trimmedIdNumber,
        relation_description: trimmedRelationDescription === "" ? null : trimmedRelationDescription,
      });
      onSaved(updated);
      setFeedbackKind("ok");
      setFeedback("Saved.");
    } catch (currentError) {
      setFeedbackKind("error");
      setFeedback(currentError instanceof Error ? currentError.message : "Save failed.");
    } finally {
      setIsSaving(false);
    }
  }

  const dirty =
    description.trim() !== (client.description ?? "") ||
    personalNumber.trim() !== (client.personal_number ?? "") ||
    idNumber.trim() !== (client.id_number ?? "") ||
    relationDescription.trim() !== (client.relation_description ?? "");

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Notes</h2>
        <span>Goal, history, anything the client needs you to remember.</span>
      </div>

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
        <span>Focus (relation note)</span>
        <input
          type="text"
          value={relationDescription}
          placeholder="e.g. Strength baseline"
          onChange={(event) => setRelationDescription(event.target.value)}
        />
      </label>

      <label className="field">
        <span>Description</span>
        <textarea
          rows={3}
          value={description}
          placeholder="Goal, observations, training history..."
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>

      <div className="panel-actions">
        <button
          className="primary-button"
          onClick={save}
          disabled={isSaving || !dirty}
          type="button"
        >
          <Save size={16} /> {isSaving ? "Saving..." : "Save notes"}
        </button>
      </div>
      {feedback ? (
        <p className={feedbackKind === "ok" ? "muted" : "error-text"}>{feedback}</p>
      ) : null}
    </section>
  );
}
