import { FormEvent, useState } from "react";
import { ArrowLeft, Dumbbell, Send } from "lucide-react";
import { useTranslation } from "react-i18next";
import { GYM_SLUG_STORAGE_KEY, requestPasswordReset } from "../../api";

type Props = {
  onBack: () => void;
};

export function PasswordResetRequestModule({ onBack }: Props) {
  const { t } = useTranslation();
  const [identifier, setIdentifier] = useState("");
  const [gymSlug, setGymSlug] = useState(
    () => localStorage.getItem(GYM_SLUG_STORAGE_KEY) ?? "",
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await requestPasswordReset(identifier.trim(), gymSlug.trim() || undefined);
      // Backend always returns 204 to prevent enumeration — we show the same
      // confirmation regardless of whether the user actually exists.
      setSubmitted(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("passwordReset.request.errorFallback"),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-panel">
        <div className="brand login-brand">
          <div className="brand-mark">
            <Dumbbell size={22} />
          </div>
          <div>
            <strong>Gym AI</strong>
            <span>{t("login.brandTagline")}</span>
          </div>
        </div>

        <div className="login-copy">
          <h1>{t("passwordReset.request.title")}</h1>
          <p>{t("passwordReset.request.intro")}</p>
        </div>

        {submitted ? (
          <>
            <p className="muted">{t("passwordReset.request.success")}</p>
            <button
              type="button"
              className="secondary-button full-width"
              onClick={onBack}
            >
              <ArrowLeft size={18} /> {t("passwordReset.request.back")}
            </button>
          </>
        ) : (
          <form className="login-form" onSubmit={handleSubmit}>
            <label className="field">
              <span>{t("login.gymSlugLabel")}</span>
              <input
                autoComplete="organization"
                value={gymSlug}
                placeholder={t("login.gymSlugPlaceholder")}
                onChange={(event) => setGymSlug(event.target.value)}
              />
              <small className="muted">{t("login.gymSlugHint")}</small>
            </label>

            <label className="field">
              <span>{t("login.identifierLabel")}</span>
              <input
                autoComplete="username"
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                required
              />
            </label>

            {error ? <p className="error-text">{error}</p> : null}

            <button
              className="primary-button full-width"
              disabled={isSubmitting}
              type="submit"
            >
              <Send size={18} />
              {isSubmitting
                ? t("passwordReset.request.submitting")
                : t("passwordReset.request.submit")}
            </button>

            <button
              type="button"
              className="ghost-button full-width"
              onClick={onBack}
            >
              <ArrowLeft size={16} /> {t("passwordReset.request.back")}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
