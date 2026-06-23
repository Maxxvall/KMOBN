import React from 'react';
import type { SyncStatus } from '../hooks/useOfflineSync';

type Props = {
  isOnline: boolean;
  isSupabaseConnected: boolean;
  isGoogleAuthOk: boolean;
  pendingCount: number;
  syncStatus: SyncStatus;
  onSync?: () => void;
};

const dot = (ok: boolean) =>
  ok ? 'bg-emerald-500' : 'bg-red-500';

const StatusIndicators: React.FC<Props> = ({
  isOnline,
  isSupabaseConnected,
  isGoogleAuthOk,
  pendingCount,
  syncStatus,
  onSync,
}) => {
  return (
    <div className="flex items-center gap-2">
      <div
        className={`w-2.5 h-2.5 rounded-full ${dot(isOnline)}`}
        title={isOnline ? 'Интернет: подключён' : 'Интернет: отключён'}
      />
      <div
        className={`w-2.5 h-2.5 rounded-full ${dot(isSupabaseConnected)}`}
        title={isSupabaseConnected ? 'БД: подключена' : 'БД: недоступна'}
      />
      <div
        className={`w-2.5 h-2.5 rounded-full ${dot(isGoogleAuthOk)}`}
        title={isGoogleAuthOk ? 'Авторизация: активна' : 'Авторизация: нет сессии'}
      />
      {pendingCount > 0 && onSync && (
        <button
          onClick={onSync}
          disabled={syncStatus === 'syncing'}
          className="ml-1 rounded-md bg-amber-500/20 border border-amber-500/40 px-2.5 py-1 text-xs font-medium text-amber-300 hover:bg-amber-500/30 disabled:opacity-50 transition"
        >
          {syncStatus === 'syncing' ? 'Синхронизация…' : `Синхронизировать (${pendingCount})`}
        </button>
      )}
    </div>
  );
};

export default React.memo(StatusIndicators);
