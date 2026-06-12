import { FormEvent, useState } from "react";
import { Dumbbell, LogIn } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AuthUser, GYM_SLUG_STORAGE_KEY, login } from "../../api";

type LoginModuleProps = {
  onLogin: (accessToken: string, user: AuthUser, gymSlug: string) => void;
  onForgotPassword: () => void;
};

export function LoginModule({ onLogin, onForgotPassword }: LoginModuleProps) {
  const { t } = useTranslation();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [gymSlug, setGymSlug] = useState(
    () => localStorage.getItem(GYM_SLUG_STORAGE_KEY) ?? "",
  );
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsLoading(true);

    const trimmedSlug = gymSlug.trim();
    try {
      const session = await login(identifier, password, trimmedSlug || undefined);
      if (trimmedSlug) {
        localStorage.setItem(GYM_SLUG_STORAGE_KEY, trimmedSlug);
      } else {
        localStorage.removeItem(GYM_SLUG_STORAGE_KEY);
      }
      onLogin(session.access_token, session.user, trimmedSlug);
    } catch (currentError) {
      setError(
        currentError instanceof Error ? currentError.message : t("login.errorFallback"),
      );
    } finally {
      setIsLoading(false);
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
          <h1>{t("login.welcome")}</h1>
          <p>{t("login.intro")}</p>
        </div>

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

          <label className="field">
            <span>{t("login.passwordLabel")}</span>
            <input
              autoComplete="current-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>

          {error ? <p className="error-text">{error}</p> : null}

          <button className="primary-button full-width" disabled={isLoading} type="submit">
            <LogIn size={18} />
            {isLoading ? t("login.signingIn") : t("login.signIn")}
          </button>

          <button
            type="button"
            className="ghost-button full-width"
            onClick={onForgotPassword}
          >
            {t("login.forgotPassword")}
          </button>
        </form>
      </section>
    </main>
  );
}
