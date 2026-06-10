import { useEffect, useState } from "react";
import { Building2, ChevronRight, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Gym, fetchGyms } from "../../api";

type Props = {
  accessToken: string;
  onSelectGym: (gymId: number) => void;
  onCreateGym: () => void;
};

export function GymsModule({ accessToken, onSelectGym, onCreateGym }: Props) {
  const { t } = useTranslation();
  const [gyms, setGyms] = useState<Gym[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    fetchGyms(accessToken)
      .then((result) => {
        if (!cancelled) setGyms(result);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : t("gyms.list.errorLoad"));
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, t]);

  return (
    <section className="module-stack" aria-label={t("gyms.list.ariaLabel")}>
      <header className="module-header">
        <div>
          <h1>{t("gyms.list.title")}</h1>
          <p>{t("gyms.list.subtitle", { count: gyms.length })}</p>
        </div>
        <button className="primary-button" onClick={onCreateGym} type="button">
          <Plus size={18} />
          {t("gyms.list.new")}
        </button>
      </header>

      {error ? <p className="error-text">{error}</p> : null}

      {isLoading ? (
        <p>{t("gyms.list.loading")}</p>
      ) : gyms.length === 0 ? (
        <p>{t("gyms.list.empty")}</p>
      ) : (
        <section className="clients-grid">
          {gyms.map((gym) => (
            <article
              className={`client-card ${gym.active ? "" : "is-inactive"}`}
              key={gym.id}
            >
              <div className="client-card-header">
                <div
                  className="client-avatar"
                  aria-hidden="true"
                  style={
                    gym.brand_color
                      ? { background: gym.brand_color, color: "#17201b" }
                      : undefined
                  }
                >
                  {gym.logo_url ? (
                    <img
                      src={gym.logo_url}
                      alt=""
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    <Building2 size={20} />
                  )}
                </div>
                <div>
                  <strong>{gym.name}</strong>
                  <span>
                    {t("gyms.list.slugLabel")}: {gym.slug}
                  </span>
                </div>
                {!gym.active ? (
                  <span className="status-pill status-inactive">
                    {t("gyms.list.inactive")}
                  </span>
                ) : (
                  <span className="status-pill status-approved">
                    {t("gyms.list.active")}
                  </span>
                )}
              </div>

              {gym.brand_color ? (
                <div className="client-detail-list">
                  <span>
                    <span
                      aria-hidden="true"
                      style={{
                        display: "inline-block",
                        width: 14,
                        height: 14,
                        borderRadius: 4,
                        background: gym.brand_color,
                        marginRight: 8,
                        verticalAlign: "middle",
                      }}
                    />
                    {t("gyms.list.colorPreview")}: {gym.brand_color}
                  </span>
                </div>
              ) : null}

              <div className="client-card-actions">
                <button
                  className="secondary-button view-detail-button"
                  onClick={() => onSelectGym(gym.id)}
                  type="button"
                >
                  {t("gyms.list.viewDetail")} <ChevronRight size={16} />
                </button>
              </div>
            </article>
          ))}
        </section>
      )}
    </section>
  );
}
