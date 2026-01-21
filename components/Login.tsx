import React, { useMemo, useState } from 'react';

type LoginProps = {
  onLogin: (username: string, password: string) => Promise<void> | void;
  onGoogleLogin: () => Promise<void> | void;
};

const Login: React.FC<LoginProps> = ({ onLogin, onGoogleLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => username.trim().length > 0 && password.length > 0 && !isSubmitting, [username, password, isSubmitting]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setIsSubmitting(true);
    setError(null);
    try {
      await onLogin(username.trim(), password);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Ошибка входа';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (isGoogleSubmitting) return;
    setIsGoogleSubmitting(true);
    setError(null);
    try {
      await onGoogleLogin();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Ошибка входа через Google';
      setError(message);
    } finally {
      setIsGoogleSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md bg-surface border border-border rounded-lg p-6">
        <h1 className="text-xl font-semibold text-text-primary">Вход</h1>
        <p className="mt-1 text-sm text-text-secondary">Введите логин и пароль или войдите через Google</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm text-text-secondary">Логин</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1 w-full rounded-md bg-background border border-border px-3 py-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
              autoComplete="username"
            />
          </div>

          <div>
            <label className="block text-sm text-text-secondary">Пароль</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-md bg-background border border-border px-3 py-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
              autoComplete="current-password"
            />
          </div>

          {error && (
            <div className="text-sm text-primary">{error}</div>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full rounded-md bg-primary px-4 py-2 text-text-primary font-medium disabled:opacity-60 hover:bg-primary-hover"
          >
            {isSubmitting ? 'Проверка…' : 'Войти'}
          </button>
        </form>

        <div className="mt-4">
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={isGoogleSubmitting}
            className="w-full rounded-md border border-border bg-background px-4 py-2 text-text-primary font-medium hover:bg-surface disabled:opacity-60"
          >
            {isGoogleSubmitting ? 'Открываю Google…' : 'Войти через Google'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Login;
