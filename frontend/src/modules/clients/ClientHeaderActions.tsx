import { useState } from "react";
import { RefreshCw, Trash2 } from "lucide-react";
import { ClientDetail, deleteClient, updateClient } from "../../api";

type Props = {
  accessToken: string;
  client: ClientDetail;
  onDeleted: () => void;
  onReactivated: (next: ClientDetail) => void;
};

export function ClientHeaderActions({ accessToken, client, onDeleted, onReactivated }: Props) {
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (
      !window.confirm(
        `Soft-delete ${client.full_name}? Their plans, sessions, and history stay intact and they can be reactivated later.`,
      )
    ) {
      return;
    }
    setIsWorking(true);
    setError(null);
    try {
      await deleteClient(accessToken, client.id);
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
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
      setError(err instanceof Error ? err.message : "Reactivate failed.");
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
          <Trash2 size={16} /> {isWorking ? "Working…" : "Delete client"}
        </button>
      ) : (
        <button
          type="button"
          className="primary-button"
          onClick={handleReactivate}
          disabled={isWorking}
        >
          <RefreshCw size={16} /> {isWorking ? "Working…" : "Reactivate client"}
        </button>
      )}
      {error ? <span className="error-text">{error}</span> : null}
    </div>
  );
}
