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

const bgFor = (t?: Props['type']) => {
  switch (t) {
    case 'success':
      return 'bg-green-600';
    case 'error':
      return 'bg-red-600';
    default:
      return 'bg-slate-700';
  }
};

const autosaveBgFor = (s: SaveStatus) => {
  switch (s) {
    case 'saving':
      return 'bg-slate-700';
    case 'saved':
      return 'bg-green-600';
    case 'error':
      return 'bg-red-600';
    default:
      return 'bg-slate-700';
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
        className={`fixed right-3 bottom-3 z-50 max-w-xs ${bgFor(type)} text-white rounded-md shadow-lg`}
        role="status"
      >
        <div className="px-3 py-2">
          <div className="flex items-start gap-2">
            <span className="mt-1 inline-block w-2 h-2 rounded-full bg-white/90" aria-hidden="true" />
            <div className="flex-1 text-xs leading-snug">{message}</div>
            {onClose && (
              <button
                onClick={onClose}
                className="ml-1 text-white/90 hover:text-white text-xs"
                aria-label="Закрыть"
              >
                ✕
              </button>
            )}
          </div>
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
      className={`fixed right-3 bottom-3 z-40 ${autosaveBgFor(saveStatus)} text-white rounded-md shadow-lg`}
      role="status"
    >
      <div className="px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-white/90" aria-hidden="true" />
          <div className="text-xs leading-snug whitespace-nowrap">
            {label}
            {details ? <span className="ml-1 text-white/90">{details}</span> : null}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SyncToast;
