import { FormEvent, useState } from "react";
import { ArrowLeft, Save } from "lucide-react";
import { useTranslation } from "react-i18next";
import { GymCreatePayload, createGym } from "../../api";

type Props = {
  accessToken: string;
  onCancel: () => void;
  onCreated: () => void;
};

const DEFAULT_BRAND_COLOR = "#9be564";

export function NewGymModule({ accessToken, onCancel, onCreated }: Props) {
  const { t } = useTranslation();
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [brandColor, setBrandColor] = useState<string | null>(null);
  const [adminFullName, setAdminFullName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminUsername, setAdminUsername] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (adminPassword.length < 8) {
      setError(t("gyms.new.errorPasswordShort"));
      return;
    }

    const payload: GymCreatePayload = {
      slug: slug.trim(),
      name: name.trim(),
      brand_color: brandColor,
      logo_url: null,
      admin: {
        full_name: adminFullName.trim(),
        email: adminEmail.trim(),
        username: adminUsername.trim(),
        password: adminPassword,
      },
    };

    setIsSaving(true);
    try {
      await createGym(accessToken, payload);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("gyms.new.errorCreate"));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="module-stack" aria-label={t("gyms.new.ariaLabel")}>
      <header className="module-header">
        <button type="button" className="back-button secondary-button" onClick={onCancel}>
          <ArrowLeft size={16} /> {t("gyms.new.back")}
        </button>
      </header>

      <article className="panel">
        <div className="panel-header">
          <div>
            <h1>{t("gyms.new.title")}</h1>
            <p>{t("gyms.new.subtitle")}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <section className="panel">
            <div className="panel-header">
              <h2>{t("gyms.new.gymSection")}</h2>
            </div>

            <div className="form-grid">
              <label className="field">
                <span>{t("gyms.new.slug")}</span>
                <input
                  type="text"
                  value={slug}
                  required
                  pattern="^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$"
                  placeholder={t("gyms.new.slugPlaceholder")}
                  onChange={(event) => setSlug(event.target.value)}
                />
                <small className="muted">{t("gyms.new.slugHint")}</small>
              </label>
              <label className="field">
                <span>{t("gyms.new.name")}</span>
                <input
                  type="text"
                  value={name}
                  required
                  placeholder={t("gyms.new.namePlaceholder")}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <label className="field">
                <span>{t("gyms.new.brandColor")}</span>
                <div className="color-picker-row">
                  <input
                    type="color"
                    value={brandColor ?? DEFAULT_BRAND_COLOR}
                    onChange={(event) => setBrandColor(event.target.value)}
                    aria-label={t("gyms.new.brandColor")}
                  />
                  <span className="muted color-picker-hex">
                    {brandColor ?? DEFAULT_BRAND_COLOR}
                  </span>
                </div>
                <small className="muted">{t("gyms.new.brandColorHint")}</small>
              </label>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>{t("gyms.new.adminSection")}</h2>
                <span className="muted">{t("gyms.new.adminHint")}</span>
              </div>
            </div>

            <div className="form-grid">
              <label className="field">
                <span>{t("gyms.new.adminFullName")}</span>
                <input
                  type="text"
                  value={adminFullName}
                  required
                  onChange={(event) => setAdminFullName(event.target.value)}
                />
              </label>
              <label className="field">
                <span>{t("gyms.new.adminEmail")}</span>
                <input
                  type="email"
                  value={adminEmail}
                  required
                  onChange={(event) => setAdminEmail(event.target.value)}
                />
              </label>
              <label className="field">
                <span>{t("gyms.new.adminUsername")}</span>
                <input
                  type="text"
                  value={adminUsername}
                  required
                  onChange={(event) => setAdminUsername(event.target.value)}
                />
              </label>
              <label className="field">
                <span>{t("gyms.new.adminPassword")}</span>
                <input
                  type="text"
                  value={adminPassword}
                  required
                  minLength={8}
                  onChange={(event) => setAdminPassword(event.target.value)}
                />
              </label>
            </div>
          </section>

          {error ? <p className="error-text">{error}</p> : null}

          <div className="panel-actions">
            <button className="secondary-button" type="button" onClick={onCancel}>
              {t("common.cancel")}
            </button>
            <button className="primary-button" type="submit" disabled={isSaving}>
              <Save size={16} /> {isSaving ? t("gyms.new.creating") : t("gyms.new.submit")}
            </button>
          </div>
        </form>
      </article>
    </section>
  );
}
