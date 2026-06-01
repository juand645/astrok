import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ClientDetail, updateClient } from "../../api";

type Props = {
  accessToken: string;
  client: ClientDetail;
  onSaved: (client: ClientDetail) => void;
};

export function ClientNotesPanel({ accessToken, client, onSaved }: Props) {
  const { t } = useTranslation();
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
      setFeedback(t("clients.notes.saved"));
    } catch (currentError) {
      setFeedbackKind("error");
      setFeedback(currentError instanceof Error ? currentError.message : t("clients.notes.errorSave"));
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
        <h2>{t("clients.notes.heading")}</h2>
        <span>{t("clients.notes.hint")}</span>
      </div>

      <label className="field">
        <span>{t("clients.notes.personalNumber")}</span>
        <input
          type="tel"
          value={personalNumber}
          placeholder={t("clients.notes.personalNumberPlaceholder")}
          onChange={(event) => setPersonalNumber(event.target.value)}
        />
      </label>

      <label className="field">
        <span>{t("clients.notes.idNumber")}</span>
        <input
          type="text"
          value={idNumber}
          placeholder={t("clients.notes.idNumberPlaceholder")}
          onChange={(event) => setIdNumber(event.target.value)}
        />
      </label>

      <label className="field">
        <span>{t("clients.notes.focus")}</span>
        <input
          type="text"
          value={relationDescription}
          placeholder={t("clients.notes.focusPlaceholder")}
          onChange={(event) => setRelationDescription(event.target.value)}
        />
      </label>

      <label className="field">
        <span>{t("clients.notes.description")}</span>
        <textarea
          rows={3}
          value={description}
          placeholder={t("clients.notes.descriptionPlaceholder")}
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
          <Save size={16} /> {isSaving ? t("clients.notes.saving") : t("clients.notes.save")}
        </button>
      </div>
      {feedback ? (
        <p className={feedbackKind === "ok" ? "muted" : "error-text"}>{feedback}</p>
      ) : null}
    </section>
  );
}
