import { FormEvent, useState } from "react";
import { Dumbbell, LogIn } from "lucide-react";
import { AuthUser, login } from "../../api";

type LoginModuleProps = {
  onLogin: (accessToken: string, user: AuthUser) => void;
};

export function LoginModule({ onLogin }: LoginModuleProps) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const session = await login(identifier, password);
      onLogin(session.access_token, session.user);
    } catch (currentError) {
      setError(currentError instanceof Error ? currentError.message : "Could not sign in.");
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
            <span>Instructor console</span>
          </div>
        </div>

        <div className="login-copy">
          <h1>Welcome back</h1>
          <p>Sign in with your gym username or email to manage appointments and routines.</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <label className="field">
            <span>Username or email</span>
            <input
              autoComplete="username"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              required
            />
          </label>

          <label className="field">
            <span>Password</span>
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
            {isLoading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}
