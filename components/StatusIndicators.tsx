import React from 'react';
import type { SyncStatus, WorkspaceStatus } from '../hooks/useOfflineSync';

type Props = {
  isOnline: boolean;
  isSupabaseConnected: boolean;
  isGoogleAuthOk: boolean;
  pendingCount: number;
  syncStatus: SyncStatus;
  workspaceStatus: WorkspaceStatus;
  missingTableCount: number;
  lastPreparedAt: string | null;
  retryAt: string | null;
  syncError: string | null;
  onSync?: () => void;
};

const dot = (ok: boolean) => ok ? 'bg-emerald-500' : 'bg-red-500';

const formatTime = (value: string | null): string => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
};

const StatusIndicators: React.FC<Props> = ({
  isOnline,
  isSupabaseConnected,
  isGoogleAuthOk,
  pendingCount,
  syncStatus,
  workspaceStatus,
  missingTableCount,
  lastPreparedAt,
  retryAt,
  syncError,
  onSync,
}) => {
  const lastPreparedTime = formatTime(lastPreparedAt);
  const retryTime = formatTime(retryAt);
  const statusText = workspaceStatus === 'ready'
    ? `Офлайн готово${lastPreparedTime ? ` · ${lastPreparedTime}` : ''}`
    : workspaceStatus === 'downloading'
      ? 'Загрузка данных для офлайн…'
      : workspaceStatus === 'syncing'
        ? 'Отправка локальных изменений…'
        : workspaceStatus === 'checking'
          ? 'Проверка офлайн-данных…'
          : workspaceStatus === 'partial'
            ? `Офлайн не готово: ${missingTableCount} разд.`
            : retryTime
              ? `Повтор синхронизации в ${retryTime}`
              : 'Ошибка синхронизации';
  const statusStyle = workspaceStatus === 'ready'
    ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
    : workspaceStatus === 'error'
      ? 'border-red-500/40 bg-red-500/15 text-red-300'
      : 'border-amber-500/40 bg-amber-500/15 text-amber-300';
  const canRetry = Boolean(onSync && isOnline && (pendingCount > 0 || workspaceStatus === 'partial' || workspaceStatus === 'error'));

  return (
    <div className="flex flex-col items-start gap-1.5 rounded-lg bg-slate-950/80 p-2 shadow-lg backdrop-blur">
      <div className="flex items-center gap-2 px-1">
        <div className={`h-2.5 w-2.5 rounded-full ${dot(isOnline)}`} title={isOnline ? 'Интернет подключён' : 'Интернет отключён'} />
        <div className={`h-2.5 w-2.5 rounded-full ${dot(isSupabaseConnected)}`} title={isSupabaseConnected ? 'База доступна' : 'База недоступна'} />
        <div className={`h-2.5 w-2.5 rounded-full ${dot(isGoogleAuthOk)}`} title={isGoogleAuthOk ? 'Авторизация активна' : 'Нет подтверждённой online-сессии'} />
        {pendingCount > 0 && (
          <span data-testid="sync-pending-count" className="text-[11px] text-amber-300">
            Локально: {pendingCount}
          </span>
        )}
      </div>
      <button
        type="button"
        data-testid="offline-readiness"
        onClick={canRetry ? onSync : undefined}
        disabled={!canRetry || syncStatus === 'syncing'}
        className={`rounded-md border px-2.5 py-1 text-xs font-medium transition ${statusStyle} disabled:cursor-default disabled:opacity-90`}
        title={syncError ?? (canRetry ? 'Повторить синхронизацию и подготовку offline-данных' : statusText)}
      >
        {statusText}
      </button>
      {syncError && (
        <p className="max-w-64 px-1 text-[10px] text-red-300" data-testid="sync-error-detail">
          {syncError}
        </p>
      )}
    </div>
  );
};

export default React.memo(StatusIndicators);
