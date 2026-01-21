import React, { useMemo, useState } from 'react';

type LoginProps = {
  onLogin: (username: string, password: string) => Promise<void> | void;
  onGoogleLogin: () => Promise<void> | void;
  onEmailLogin?: (email: string, password: string) => Promise<void> | void;
  onEmailSignup?: (payload: { name: string; email: string; password: string; phone?: string }) => Promise<void> | void;
  onResetPassword?: (email: string) => Promise<void> | void;
  useSupabaseAuth?: boolean;
};

const Login: React.FC<LoginProps> = ({ onLogin, onGoogleLogin, onEmailLogin, onEmailSignup, onResetPassword, useSupabaseAuth = false }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [showSignupModal, setShowSignupModal] = useState(false);
  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupPhone, setSignupPhone] = useState('');
  const [isSignupSubmitting, setIsSignupSubmitting] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [isResetSubmitting, setIsResetSubmitting] = useState(false);

  const canSubmit = useMemo(() => username.trim().length > 0 && password.length > 0 && !isSubmitting, [username, password, isSubmitting]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setIsSubmitting(true);
    setError(null);
    setInfoMessage(null);
    try {
      if (useSupabaseAuth) {
        if (!onEmailLogin) throw new Error('Вход по email недоступен');
        await onEmailLogin(username.trim(), password);
      } else {
        await onLogin(username.trim(), password);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Ошибка входа';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignup = async () => {
    if (isSignupSubmitting) return;
    setIsSignupSubmitting(true);
    setError(null);
    setInfoMessage(null);
    try {
      if (!onEmailSignup) throw new Error('Регистрация недоступна');
      if (!signupName.trim() || !signupEmail.trim() || !signupPassword) {
        throw new Error('Заполните имя, email и пароль');
      }
      await onEmailSignup({
        name: signupName.trim(),
        email: signupEmail.trim(),
        password: signupPassword,
        phone: signupPhone.trim() || undefined,
      });
      setShowSignupModal(false);
      setSignupName('');
      setSignupEmail('');
      setSignupPassword('');
      setSignupPhone('');
      setInfoMessage('Письмо с подтверждением отправлено на вашу почту.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Ошибка регистрации';
      setError(message);
    } finally {
      setIsSignupSubmitting(false);
    }
  };

  const handleResetPassword = async () => {
    if (isResetSubmitting) return;
    setIsResetSubmitting(true);
    setError(null);
    setResetMessage(null);
    setInfoMessage(null);
    try {
      if (!onResetPassword) throw new Error('Восстановление пароля недоступно');
      if (!resetEmail.trim()) throw new Error('Введите email');
      await onResetPassword(resetEmail.trim());
      setResetMessage('Ссылка для восстановления отправлена на вашу почту.');
      setInfoMessage('Ссылка для восстановления отправлена на вашу почту.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Ошибка восстановления пароля';
      setError(message);
    } finally {
      setIsResetSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (isGoogleSubmitting) return;
    setIsGoogleSubmitting(true);
    setError(null);
    setInfoMessage(null);
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
        <p className="mt-1 text-sm text-text-secondary">
          {useSupabaseAuth ? 'Введите email и пароль или войдите через Google' : 'Введите логин и пароль'}
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="block text-sm text-text-secondary">{useSupabaseAuth ? 'Email' : 'Логин'}</label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="mt-1 w-full rounded-md bg-background border border-border px-3 py-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
                autoComplete={useSupabaseAuth ? 'email' : 'username'}
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
            {infoMessage && (
              <div className="text-sm text-text-secondary">{infoMessage}</div>
            )}

            {useSupabaseAuth ? (
              <div className="flex flex-col gap-3">
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={!canSubmit}
                    className="flex-1 rounded-md bg-primary px-4 py-2 text-text-primary font-medium disabled:opacity-60 hover:bg-primary-hover"
                  >
                    {isSubmitting ? 'Проверка…' : 'Войти'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSignupModal(true)}
                    className="flex-1 rounded-md border border-border bg-background px-4 py-2 text-text-primary font-medium hover:bg-surface"
                  >
                    Зарегистрироваться
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setShowResetModal(true)}
                  className="text-sm text-text-secondary hover:text-text-primary"
                >
                  Забыли пароль?
                </button>
              </div>
            ) : (
              <button
                type="submit"
                disabled={!canSubmit}
                className="w-full rounded-md bg-primary px-4 py-2 text-text-primary font-medium disabled:opacity-60 hover:bg-primary-hover"
              >
                {isSubmitting ? 'Проверка…' : 'Войти'}
              </button>
            )}
          </form>

        {useSupabaseAuth && (
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
        )}
      </div>

      {showSignupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md rounded-lg bg-surface p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-text-primary">Регистрация</h2>
              <button
                type="button"
                onClick={() => setShowSignupModal(false)}
                className="text-text-secondary hover:text-text-primary"
              >
                ×
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-sm text-text-secondary">Имя</label>
                <input
                  value={signupName}
                  onChange={(e) => setSignupName(e.target.value)}
                  className="mt-1 w-full rounded-md bg-background border border-border px-3 py-2 text-text-primary"
                />
              </div>
              <div>
                <label className="block text-sm text-text-secondary">Email</label>
                <input
                  value={signupEmail}
                  onChange={(e) => setSignupEmail(e.target.value)}
                  className="mt-1 w-full rounded-md bg-background border border-border px-3 py-2 text-text-primary"
                  autoComplete="email"
                />
              </div>
              <div>
                <label className="block text-sm text-text-secondary">Пароль</label>
                <input
                  type="password"
                  value={signupPassword}
                  onChange={(e) => setSignupPassword(e.target.value)}
                  className="mt-1 w-full rounded-md bg-background border border-border px-3 py-2 text-text-primary"
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label className="block text-sm text-text-secondary">Телефон (необязательно)</label>
                <input
                  value={signupPhone}
                  onChange={(e) => setSignupPhone(e.target.value)}
                  className="mt-1 w-full rounded-md bg-background border border-border px-3 py-2 text-text-primary"
                  autoComplete="tel"
                />
              </div>
            </div>
            <div className="mt-6 flex gap-2">
              <button
                type="button"
                onClick={handleSignup}
                disabled={isSignupSubmitting}
                className="flex-1 rounded-md bg-primary px-4 py-2 text-text-primary font-medium disabled:opacity-60 hover:bg-primary-hover"
              >
                {isSignupSubmitting ? 'Создаю…' : 'Сохранить'}
              </button>
              <button
                type="button"
                onClick={() => setShowSignupModal(false)}
                className="flex-1 rounded-md border border-border bg-background px-4 py-2 text-text-primary font-medium hover:bg-surface"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md rounded-lg bg-surface p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-text-primary">Восстановление пароля</h2>
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
                className="text-text-secondary hover:text-text-primary"
              >
                ×
              </button>
            </div>
            <div className="mt-4">
              <label className="block text-sm text-text-secondary">Email</label>
              <input
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                className="mt-1 w-full rounded-md bg-background border border-border px-3 py-2 text-text-primary"
                autoComplete="email"
              />
              {resetMessage && (
                <div className="mt-3 text-sm text-text-secondary">{resetMessage}</div>
              )}
            </div>
            <div className="mt-6 flex gap-2">
              <button
                type="button"
                onClick={handleResetPassword}
                disabled={isResetSubmitting}
                className="flex-1 rounded-md bg-primary px-4 py-2 text-text-primary font-medium disabled:opacity-60 hover:bg-primary-hover"
              >
                {isResetSubmitting ? 'Отправляю…' : 'Отправить ссылку'}
              </button>
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
                className="flex-1 rounded-md border border-border bg-background px-4 py-2 text-text-primary font-medium hover:bg-surface"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Login;
