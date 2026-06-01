import { useState } from "react";
import { RefreshCw, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ClientDetail, deleteClient, updateClient } from "../../api";

type Props = {
  accessToken: string;
  client: ClientDetail;
  onDeleted: () => void;
  onReactivated: (next: ClientDetail) => void;
};

export function ClientHeaderActions({ accessToken, client, onDeleted, onReactivated }: Props) {
  const { t } = useTranslation();
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (!window.confirm(t("clients.detail.confirmDelete", { name: client.full_name }))) {
      return;
    }
    setIsWorking(true);
    setError(null);
    try {
      await deleteClient(accessToken, client.id);
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("clients.detail.errorDelete"));
      setIsWorking(false);
    }
  }

  async function handleReactivate() {
    setIsWorking(true);
    setError(null);
    try {
      const updated = await updateClient(accessToken, client.id, { active: true });
      onReactivated(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("clients.detail.errorReactivate"));
    } finally {
      setIsWorking(false);
    }
  }

  return (
    <div className="detail-header-actions">
      {client.active ? (
        <button
          type="button"
          className="secondary-button danger-button"
          onClick={handleDelete}
          disabled={isWorking}
        >
          <Trash2 size={16} /> {isWorking ? t("clients.detail.working") : t("clients.detail.delete")}
        </button>
      ) : (
        <button
          type="button"
          className="primary-button"
          onClick={handleReactivate}
          disabled={isWorking}
        >
          <RefreshCw size={16} /> {isWorking ? t("clients.detail.working") : t("clients.detail.reactivate")}
        </button>
      )}
      {error ? <span className="error-text">{error}</span> : null}
    </div>
  );
}
