import React from 'react';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

type Props = {
  // Legacy toast API (оставляем для существующих сообщений)
  visible: boolean;
  message?: string;
  type?: 'success' | 'error' | 'info';
  onClose?: () => void;

  // Autosave indicator API
  saveStatus?: SaveStatus;
  lastSaved?: Date | null;
  saveError?: string | null;
};

const accentFor = (t?: Props['type']) => {
  switch (t) {
    case 'success':
      return 'bg-emerald-500 text-emerald-200';
    case 'error':
      return 'bg-rose-500 text-rose-200';
    default:
      return 'bg-sky-500 text-sky-200';
  }
};

const autosaveAccentFor = (s: SaveStatus) => {
  switch (s) {
    case 'saving':
      return 'bg-sky-500 text-sky-200';
    case 'saved':
      return 'bg-emerald-500 text-emerald-200';
    case 'error':
      return 'bg-rose-500 text-rose-200';
    default:
      return 'bg-slate-500 text-slate-200';
  }
};

const iconFor = (t?: Props['type']) => {
  switch (t) {
    case 'success':
      return '✓';
    case 'error':
      return '!';
    default:
      return 'i';
  }
};

const formatTime = (d: Date) =>
  d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

const SyncToast: React.FC<Props> = ({
  visible,
  message,
  type = 'info',
  onClose,
  saveStatus = 'idle',
  lastSaved,
  saveError,
}) => {
  // 1) Если есть явное toast-сообщение — показываем его (как и раньше)
  if (visible) {
    return (
      <div
        className="fixed right-4 bottom-4 z-50 w-[calc(100%-2rem)] max-w-sm rounded-2xl border border-border bg-surface/95 text-text-primary shadow-2xl backdrop-blur"
        role="status"
        aria-live="polite"
      >
        <div className="flex items-start gap-3 px-4 py-3">
          <div className={`flex h-8 w-8 items-center justify-center rounded-full ${accentFor(type)}`} aria-hidden="true">
            <span className="text-sm font-semibold">{iconFor(type)}</span>
          </div>
          <div className="flex-1 text-sm leading-snug">
            {message}
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="-mr-1 -mt-1 rounded-full border border-border px-2 py-1 text-xs text-text-secondary transition hover:text-text-primary"
              aria-label="Закрыть"
            >
              ✕
            </button>
          )}
        </div>
      </div>
    );
  }

  // 2) Иначе — компактный индикатор автосохранения
  const shouldShowAutosave = saveStatus !== 'idle' || !!lastSaved || !!saveError;
  if (!shouldShowAutosave) return null;

  const label =
    saveStatus === 'saving'
      ? 'Сохранение…'
      : saveStatus === 'error'
        ? 'Ошибка'
        : 'Сохранено';

  const details =
    saveStatus === 'error'
      ? saveError || 'Не удалось сохранить изменения'
      : lastSaved
        ? `в ${formatTime(lastSaved)}`
        : undefined;

  return (
    <div
      className="fixed right-4 bottom-4 z-40 rounded-xl border border-border bg-surface/90 text-text-primary shadow-xl backdrop-blur"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <span className={`inline-flex h-2.5 w-2.5 rounded-full ${autosaveAccentFor(saveStatus)}`} aria-hidden="true" />
        <div className="text-xs leading-snug whitespace-nowrap">
          {label}
          {details ? <span className="ml-1 text-text-secondary">{details}</span> : null}
        </div>
      </div>
    </div>
  );
};

export default SyncToast;
