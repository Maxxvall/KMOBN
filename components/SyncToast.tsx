import React from 'react';
import { IconAlertTriangle, IconCheck, IconClose, IconInfoCircle, IconRefresh } from '@devigner-ui/icons';
import { Island } from './ui/island';

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

// One accent mapping for both toast APIs; only the idle fallback differs.
const accentFor = (t?: Props['type'], fallback = 'bg-sky-500 text-sky-200') => {
  switch (t) {
    case 'success':
      return 'bg-emerald-500 text-emerald-200';
    case 'error':
      return 'bg-rose-500 text-rose-200';
    default:
      return fallback;
  }
};

const autosaveAccentFor = (s: SaveStatus) =>
  s === 'saving'
    ? 'bg-sky-500 text-sky-200'
    : accentFor(s === 'saved' ? 'success' : s === 'error' ? 'error' : undefined, 'bg-slate-500 text-slate-200');

// R10.1: текстовые глифы `✓ ! i` заменены на иконки пакета; семантика та же.
const statusIconFor = (t?: Props['type']) => {
  switch (t) {
    case 'success':
      return <IconCheck aria-hidden="true" className="size-4" />;
    case 'error':
      return <IconAlertTriangle aria-hidden="true" className="size-4" />;
    default:
      return <IconInfoCircle aria-hidden="true" className="size-4" />;
  }
};

const autosaveIconFor = (s: SaveStatus) => {
  switch (s) {
    case 'saving':
      return <IconRefresh aria-hidden="true" className="size-3.5 animate-spin" />;
    case 'error':
      return <IconAlertTriangle aria-hidden="true" className="size-3.5" />;
    default:
      return <IconCheck aria-hidden="true" className="size-3.5" />;
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
  // 1) Если есть явное toast-сообщение — показываем его островком (как и раньше)
  if (visible) {
    return (
      <div className="fixed right-4 bottom-4 z-50 w-[calc(100%-2rem)] max-w-sm">
        <Island open={visible}>
          <div
            className="flex items-start gap-3 py-0.5"
            role="status"
            aria-live="polite"
          >
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${accentFor(type)}`}
              aria-hidden="true"
            >
              {statusIconFor(type)}
            </div>
            <div className="min-w-0 flex-1 self-center text-sm leading-snug">
              {message}
            </div>
            {onClose && (
              <button
                onClick={onClose}
                className="-mr-1 -mt-0.5 shrink-0 rounded-full p-1.5 text-text-secondary transition hover:bg-white/5 hover:text-text-primary"
                aria-label="Закрыть"
              >
                <IconClose aria-hidden="true" className="size-4" />
              </button>
            )}
          </div>
        </Island>
      </div>
    );
  }

  // 2) Иначе — компактный индикатор автосохранения в той же пилюле-островке
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
    <div className="fixed right-4 bottom-4 z-40 max-w-[calc(100%-2rem)]">
      <Island open>
        <div
          className="flex items-center gap-2 py-0.5"
          role="status"
          aria-live="polite"
        >
          <span
            className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${autosaveAccentFor(saveStatus)}`}
            aria-hidden="true"
          >
            {autosaveIconFor(saveStatus)}
          </span>
          <div className="text-xs leading-snug whitespace-nowrap">
            {label}
            {details ? <span className="ml-1 text-text-secondary">{details}</span> : null}
          </div>
        </div>
      </Island>
    </div>
  );
};

export default React.memo(SyncToast);
