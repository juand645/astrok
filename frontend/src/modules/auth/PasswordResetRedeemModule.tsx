import { FormEvent, useState } from "react";
import { Dumbbell, KeyRound, LogIn } from "lucide-react";
import { useTranslation } from "react-i18next";
import { redeemPasswordReset } from "../../api";

type Props = {
  token: string | null;
  onDone: () => void;
};

export function PasswordResetRedeemModule({ token, onDone }: Props) {
  const { t } = useTranslation();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) {
      setError(t("passwordReset.redeem.errorMissingToken"));
      return;
    }
    setError(null);

    if (newPassword.length < 8) {
      setError(t("passwordReset.redeem.errorTooShort"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t("passwordReset.redeem.errorMismatch"));
      return;
    }

    setIsSubmitting(true);
    try {
      await redeemPasswordReset(token, newPassword);
      setSuccess(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("passwordReset.redeem.errorInvalid"),
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
          <h1>{t("passwordReset.redeem.title")}</h1>
          {!success ? <p>{t("passwordReset.redeem.intro")}</p> : null}
        </div>

        {success ? (
          <>
            <p className="muted">{t("passwordReset.redeem.success")}</p>
            <button
              type="button"
              className="primary-button full-width"
              onClick={onDone}
            >
              <LogIn size={18} /> {t("passwordReset.redeem.signInNow")}
            </button>
          </>
        ) : !token ? (
          <>
            <p className="error-text">
              {t("passwordReset.redeem.errorMissingToken")}
            </p>
            <button
              type="button"
              className="secondary-button full-width"
              onClick={onDone}
            >
              {t("passwordReset.request.back")}
            </button>
          </>
        ) : (
          <form className="login-form" onSubmit={handleSubmit}>
            <label className="field">
              <span>{t("passwordReset.redeem.newPassword")}</span>
              <input
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </label>

            <label className="field">
              <span>{t("passwordReset.redeem.confirmPassword")}</span>
              <input
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            </label>

            {error ? <p className="error-text">{error}</p> : null}

            <button
              type="submit"
              className="primary-button full-width"
              disabled={isSubmitting}
            >
              <KeyRound size={18} />
              {isSubmitting
                ? t("passwordReset.redeem.submitting")
                : t("passwordReset.redeem.submit")}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
