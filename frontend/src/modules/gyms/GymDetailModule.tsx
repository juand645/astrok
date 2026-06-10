import { FormEvent, useEffect, useRef, useState } from "react";
import { ArrowLeft, Building2, Save, Trash2, Upload } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Gym,
  deleteGymLogo,
  fetchGyms,
  updateGym,
  uploadGymLogo,
} from "../../api";

type Props = {
  accessToken: string;
  gymId: number;
  onBack: () => void;
};

const DEFAULT_BRAND_COLOR = "#9be564";

export function GymDetailModule({ accessToken, gymId, onBack }: Props) {
  const { t } = useTranslation();
  const [gym, setGym] = useState<Gym | null>(null);
  const [name, setName] = useState("");
  const [brandColor, setBrandColor] = useState<string | null>(null);
  const [active, setActive] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackKind, setFeedbackKind] = useState<"ok" | "error">("ok");

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    fetchGyms(accessToken)
      .then((all) => {
        if (cancelled) return;
        const match = all.find((g) => g.id === gymId);
        if (!match) {
          setFeedbackKind("error");
          setFeedback(t("gyms.edit.errorLoad"));
          return;
        }
        setGym(match);
        setName(match.name);
        setBrandColor(match.brand_color);
        setActive(match.active);
      })
      .catch((err) => {
        if (!cancelled) {
          setFeedbackKind("error");
          setFeedback(err instanceof Error ? err.message : t("gyms.edit.errorLoad"));
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, gymId, t]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!gym) return;
    setFeedback(null);
    setIsSaving(true);
    try {
      const updated = await updateGym(accessToken, gym.id, {
        name: name.trim() || undefined,
        brand_color: brandColor,
        active,
      });
      setGym(updated);
      setFeedbackKind("ok");
      setFeedback(t("gyms.edit.saved"));
    } catch (err) {
      setFeedbackKind("error");
      setFeedback(err instanceof Error ? err.message : t("gyms.edit.errorSave"));
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <section className="module-stack" aria-label={t("gyms.edit.ariaLabel")}>
        <p className="muted">{t("common.loading")}</p>
      </section>
    );
  }

  if (!gym) {
    return (
      <section className="module-stack" aria-label={t("gyms.edit.ariaLabel")}>
        <header className="module-header">
          <button type="button" className="back-button secondary-button" onClick={onBack}>
            <ArrowLeft size={16} /> {t("gyms.edit.back")}
          </button>
        </header>
        {feedback ? <p className="error-text">{feedback}</p> : null}
      </section>
    );
  }

  const effectiveColor = brandColor ?? DEFAULT_BRAND_COLOR;

  return (
    <section className="module-stack" aria-label={t("gyms.edit.ariaLabel")}>
      <header className="module-header">
        <button type="button" className="back-button secondary-button" onClick={onBack}>
          <ArrowLeft size={16} /> {t("gyms.edit.back")}
        </button>
      </header>

      <article className="panel">
        <div className="panel-header">
          <div>
            <h1>
              {t("gyms.edit.title")} — {gym.name}
            </h1>
            <p className="muted">{t("gyms.edit.subtitle")}</p>
          </div>
        </div>

        <GymLogoPanel
          accessToken={accessToken}
          gym={gym}
          onUpdated={(updated) => setGym(updated)}
        />

        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <label className="field">
              <span>{t("gyms.list.slugLabel")}</span>
              <input type="text" value={gym.slug} disabled readOnly />
            </label>
            <label className="field">
              <span>{t("gyms.edit.name")}</span>
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label className="field">
              <span>{t("gyms.edit.brandColor")}</span>
              <div className="color-picker-row">
                <input
                  type="color"
                  value={effectiveColor}
                  onChange={(event) => setBrandColor(event.target.value)}
                  aria-label={t("gyms.edit.brandColor")}
                />
                <span className="muted color-picker-hex">{effectiveColor}</span>
                {brandColor !== null ? (
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => setBrandColor(null)}
                  >
                    {t("gyms.edit.brandColorClear")}
                  </button>
                ) : null}
              </div>
            </label>
          </div>

          <label className="inline-toggle">
            <input
              type="checkbox"
              checked={active}
              onChange={(event) => setActive(event.target.checked)}
            />
            {t("gyms.edit.active")}
          </label>
          <small className="muted">{t("gyms.edit.activeHint")}</small>

          <div className="panel-actions">
            <button className="primary-button" type="submit" disabled={isSaving}>
              <Save size={16} /> {isSaving ? t("gyms.edit.saving") : t("gyms.edit.save")}
            </button>
          </div>

          {feedback ? (
            <p className={feedbackKind === "ok" ? "muted" : "error-text"}>{feedback}</p>
          ) : null}
        </form>
      </article>
    </section>
  );
}

function GymLogoPanel({
  accessToken,
  gym,
  onUpdated,
}: {
  accessToken: string;
  gym: Gym;
  onUpdated: (gym: Gym) => void;
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
      const updated = await uploadGymLogo(accessToken, gym.id, file);
      onUpdated(updated);
      setFeedbackKind("ok");
      setFeedback(t("gyms.edit.logoUploaded"));
    } catch (err) {
      setFeedbackKind("error");
      setFeedback(err instanceof Error ? err.message : t("gyms.edit.errorLogoUpload"));
    } finally {
      setIsWorking(false);
    }
  }

  async function handleRemove() {
    setIsWorking(true);
    setFeedback(null);
    try {
      const updated = await deleteGymLogo(accessToken, gym.id);
      onUpdated(updated);
      setFeedbackKind("ok");
      setFeedback(t("gyms.edit.logoRemoved"));
    } catch (err) {
      setFeedbackKind("error");
      setFeedback(err instanceof Error ? err.message : t("gyms.edit.errorLogoRemove"));
    } finally {
      setIsWorking(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div className="coach-card-header">
          <Building2 size={16} />
          <span>{t("gyms.edit.logo")}</span>
        </div>
        <span className="muted">{t("gyms.edit.logoHint")}</span>
      </div>

      <div className="avatar-panel-body">
        <div
          className="avatar-preview"
          aria-hidden="true"
          style={
            gym.brand_color
              ? { background: gym.brand_color }
              : undefined
          }
        >
          {gym.logo_url ? (
            <img src={gym.logo_url} alt="" />
          ) : (
            <Building2 size={28} />
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
              ? t("gyms.edit.logoUploading")
              : gym.logo_url
                ? t("gyms.edit.logoReplace")
                : t("gyms.edit.logoUpload")}
          </button>
          {gym.logo_url ? (
            <button
              type="button"
              className="secondary-button danger-button"
              onClick={handleRemove}
              disabled={isWorking}
            >
              <Trash2 size={16} /> {t("gyms.edit.logoRemove")}
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
