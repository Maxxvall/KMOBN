import React, { useEffect, useMemo, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { getActiveUsageMs } from '../services/appUsage';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  estimates: unknown[];
  materials: unknown[];
  works: unknown[];
  bundles: unknown[];
  updateAvailableVersion: string | null;
  updateDownloadedVersion: string | null;
  updateProgress: { percent: number; bytesPerSecond: number; transferred: number; total: number } | null;
}

type Tab = 'profile' | 'stats' | 'app';

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / 1_048_576).toFixed(1)} МБ`;
};

const formatDuration = (milliseconds: number): string => {
  const minutes = Math.floor(milliseconds / 60_000);
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours} ч ${minutes % 60} мин` : `${minutes} мин`;
};

const ProfileModal: React.FC<ProfileModalProps> = ({
  isOpen,
  onClose,
  user,
  estimates,
  materials,
  works,
  bundles,
  updateAvailableVersion,
  updateDownloadedVersion,
  updateProgress,
}) => {
  const [activeTab, setActiveTab] = useState<Tab>('profile');
  const [updateStatus, setUpdateStatus] = useState('');
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [appVersion, setAppVersion] = useState('');
  const [usageNow, setUsageNow] = useState(() => Date.now());

  const profile = useMemo(() => ({
    name: user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Пользователь',
    email: user?.email || 'Электронная почта не указана',
    avatar: user?.user_metadata?.avatar_url as string | undefined,
    registrationDate: user?.created_at,
  }), [user]);

  const stats = useMemo(() => {
    const totalEstimates = Array.isArray(estimates) ? estimates.length : 0;
    const totalWorkVolume = Array.isArray(estimates)
      ? estimates.reduce((sum: number, estimate: any) => sum + (estimate.items || []).reduce(
        (itemSum: number, item: any) => itemSum + (item.total || 0),
        0,
      ), 0)
      : 0;

    return { totalEstimates, totalWorkVolume };
  }, [estimates]);

  useEffect(() => {
    if (!isOpen || !window.electronAPI?.getAppVersion) return;
    window.electronAPI.getAppVersion().then(setAppVersion);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || activeTab !== 'stats') return;
    setUsageNow(Date.now());
    const interval = window.setInterval(() => setUsageNow(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, [activeTab, isOpen]);

  const handleExportData = () => {
    const data = {
      estimates,
      materials,
      works,
      bundles,
      exportDate: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `karkas-master-export-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleClearCache = () => {
    if (!confirm('Удалить локальный кеш и данные на этом устройстве? Облачные данные останутся без изменений.')) return;
    localStorage.clear();
    indexedDB.deleteDatabase('kmobn_indexeddb_cache');
    window.location.reload();
  };

  const handleCheckUpdates = async () => {
    setIsCheckingUpdate(true);
    setUpdateStatus('');
    try {
      await window.electronAPI?.checkForUpdates?.();
      setUpdateStatus('Проверка завершена');
    } catch {
      setUpdateStatus('Не удалось проверить обновления');
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  if (!isOpen) return null;

  const activeUsage = getActiveUsageMs(localStorage, usageNow);
  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'profile', label: 'Профиль', icon: '◉' },
    { id: 'stats', label: 'Статистика', icon: '↗' },
    { id: 'app', label: 'Приложение', icon: '⚙' },
  ];
  const primaryButton = 'inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-red-950/20 transition duration-200 hover:bg-primary-hover hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-surface active:translate-y-0 disabled:pointer-events-none disabled:opacity-50';
  const secondaryButton = 'inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-semibold text-text-primary transition duration-200 hover:border-gray-500 hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-surface active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/75 p-0 backdrop-blur-sm sm:items-center sm:p-5" role="presentation">
      <section className="flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl border border-border bg-surface shadow-2xl shadow-black/50 sm:rounded-3xl" role="dialog" aria-modal="true" aria-labelledby="profile-modal-title">
        <header className="flex items-center justify-between border-b border-border px-5 py-4 sm:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-primary/40 bg-primary/15 text-base font-bold text-red-200">
              {profile.avatar ? <img src={profile.avatar} alt="Аватар" className="h-full w-full object-cover" /> : profile.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <h2 id="profile-modal-title" className="truncate text-lg font-bold tracking-tight text-text-primary">Профиль</h2>
              <p className="truncate text-sm text-text-secondary">Управление аккаунтом и данными</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-text-secondary transition hover:bg-gray-800 hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-primary" aria-label="Закрыть профиль">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m6 6 12 12M18 6 6 18" /></svg>
          </button>
        </header>

        <nav className="grid grid-cols-3 gap-1 border-b border-border bg-background/40 p-2" aria-label="Разделы профиля">
          {tabs.map((tab) => (
            <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={`min-h-11 rounded-xl px-2 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-primary ${activeTab === tab.id ? 'bg-surface text-text-primary shadow-sm ring-1 ring-border' : 'text-text-secondary hover:bg-surface hover:text-text-primary'}`}>
              <span className="mr-1.5 text-base" aria-hidden="true">{tab.icon}</span>{tab.label}
            </button>
          ))}
        </nav>

        <div className="overflow-y-auto px-5 py-6 sm:px-7 sm:py-7">
          {activeTab === 'profile' && (
            <div className="space-y-6">
              <div className="flex flex-col gap-5 rounded-2xl border border-border bg-background/50 p-5 sm:flex-row sm:items-center sm:p-6">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-primary/40 bg-primary/15 text-3xl font-bold text-red-100 shadow-inner shadow-primary/20">
                  {profile.avatar ? <img src={profile.avatar} alt="Аватар" className="h-full w-full object-cover" /> : profile.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Аккаунт</p>
                  <h3 className="mt-1 truncate text-2xl font-bold tracking-tight text-text-primary">{profile.name}</h3>
                  <p className="mt-1 truncate text-sm text-text-secondary">{profile.email}</p>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-border p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Дата регистрации</p>
                  <p className="mt-2 text-base font-semibold text-text-primary">{profile.registrationDate ? new Date(profile.registrationDate).toLocaleDateString('ru-RU') : '—'}</p>
                </div>
                <div className="rounded-2xl border border-border p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Статус</p>
                  <p className="mt-2 inline-flex rounded-full bg-emerald-500/10 px-2.5 py-1 text-sm font-semibold text-emerald-400">Аккаунт активен</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'stats' && (
            <div className="space-y-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Статистика</p>
                <h3 className="mt-1 text-xl font-bold text-text-primary">Ваш прогресс в проекте</h3>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-border bg-background/50 p-5"><p className="text-sm text-text-secondary">Создано смет</p><p className="mt-3 text-3xl font-bold tracking-tight text-text-primary">{stats.totalEstimates}</p></div>
                <div className="rounded-2xl border border-border bg-background/50 p-5"><p className="text-sm text-text-secondary">Объём работ</p><p className="mt-3 text-2xl font-bold tracking-tight text-text-primary">{stats.totalWorkVolume.toLocaleString('ru-RU')} ₽</p></div>
                <div className="rounded-2xl border border-primary/30 bg-primary/10 p-5"><p className="text-sm text-red-100/80">Активное время</p><p className="mt-3 text-2xl font-bold tracking-tight text-white">{formatDuration(activeUsage)}</p></div>
              </div>
              <div className="rounded-2xl border border-border bg-background/40 p-4 text-sm leading-6 text-text-secondary">
                Время учитывается только когда окно приложения активно: при сворачивании, переключении на другую программу или скрытии вкладки счётчик останавливается.
              </div>
            </div>
          )}

          {activeTab === 'app' && (
            <div className="space-y-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Приложение</p>
                <h3 className="mt-1 text-xl font-bold text-text-primary">Данные и обновления</h3>
              </div>
              <div className="rounded-2xl border border-border bg-background/50 p-5">
                <p className="font-semibold text-text-primary">Экспорт данных</p>
                <p className="mt-1 text-sm leading-6 text-text-secondary">Сохраните сметы, материалы, работы и наборы в JSON-файл.</p>
                <button type="button" onClick={handleExportData} className={`${secondaryButton} mt-4 w-full sm:w-auto`}>Экспортировать JSON</button>
              </div>

              {window.electronAPI?.isElectron && (
                <div className="rounded-2xl border border-border bg-background/50 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold text-text-primary">Обновления</p><p className="mt-1 text-sm text-text-secondary">Версия {appVersion ? `v${appVersion}` : 'загружается'}</p></div></div>
                  {updateProgress && <div className="mt-4 space-y-2"><div className="flex justify-between text-sm"><span className="text-text-secondary">Загрузка обновления</span><span className="font-semibold text-text-primary">{Math.round(updateProgress.percent)}%</span></div><div className="h-2 overflow-hidden rounded-full bg-gray-700"><div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${updateProgress.percent}%` }} /></div><div className="flex justify-between text-xs text-text-secondary"><span>{formatBytes(updateProgress.transferred)} / {formatBytes(updateProgress.total)}</span><span>{formatBytes(updateProgress.bytesPerSecond)}/с</span></div><button type="button" onClick={() => window.electronAPI?.cancelUpdate?.()} className={`${secondaryButton} mt-2 w-full sm:w-auto`}>Отменить загрузку</button></div>}
                  {!updateProgress && updateDownloadedVersion && <div className="mt-4"><p className="text-sm font-semibold text-emerald-400">Версия v{updateDownloadedVersion} готова к установке</p><button type="button" onClick={() => window.electronAPI?.installUpdate?.()} className={`${primaryButton} mt-3 w-full sm:w-auto`}>Перезапустить и установить</button></div>}
                  {!updateProgress && !updateDownloadedVersion && updateAvailableVersion && <div className="mt-4"><p className="text-sm font-semibold text-blue-300">Доступна версия v{updateAvailableVersion}</p><button type="button" onClick={() => window.electronAPI?.downloadUpdate?.()} className={`${primaryButton} mt-3 w-full sm:w-auto`}>Скачать обновление</button></div>}
                  {!updateProgress && !updateDownloadedVersion && !updateAvailableVersion && <div className="mt-4"><button type="button" onClick={handleCheckUpdates} disabled={isCheckingUpdate} className={`${secondaryButton} w-full sm:w-auto`}>{isCheckingUpdate ? 'Проверяю…' : 'Проверить обновления'}</button>{updateStatus && <p className="mt-2 text-sm text-emerald-400">{updateStatus}</p>}</div>}
                </div>
              )}

              <div className="rounded-2xl border border-red-500/30 bg-red-950/15 p-5">
                <p className="font-semibold text-red-200">Локальные данные</p>
                <p className="mt-1 text-sm leading-6 text-red-100/70">Удаляет кеш и данные на этом устройстве. Данные, сохранённые в облаке, останутся без изменений.</p>
                <button type="button" onClick={handleClearCache} className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-red-500/50 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-200 transition hover:bg-red-500/20 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-2 focus:ring-offset-surface active:scale-[0.98] sm:w-auto">Очистить данные устройства</button>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default ProfileModal;
