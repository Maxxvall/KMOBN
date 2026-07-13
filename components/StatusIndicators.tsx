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
  const syncFailed = syncStatus === 'error';
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
        <div className="flex flex-col items-center ml-1">
          <button
            onClick={onSync}
            disabled={!isOnline || syncStatus === 'syncing'}
            className={`relative rounded-md border px-2.5 py-1 text-xs font-medium disabled:opacity-50 transition ${
              syncFailed
                ? 'bg-red-500/20 border-red-500/40 text-red-300 hover:bg-red-500/30'
                : 'bg-amber-500/20 border-amber-500/40 text-amber-300 hover:bg-amber-500/30'
            }`}
          >
            <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
            </span>
            {syncStatus === 'syncing'
              ? 'Синхронизация…'
              : syncFailed
                ? `Ошибка — повторить (${pendingCount})`
                : `Синхронизировать (${pendingCount})`}
          </button>
          <span className={`text-[10px] mt-0.5 ${syncFailed ? 'text-red-400/80' : 'text-amber-400/70'}`}>
            {syncFailed ? 'Изменения сохранены локально' : 'Ожидают синхронизации'}
          </span>
        </div>
      )}
    </div>
  );
};

export default React.memo(StatusIndicators);
