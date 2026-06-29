import React, { useState, useEffect } from 'react';
import { User } from '@supabase/supabase-js';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  estimates: unknown[];
  materials: unknown[];
  works: unknown[];
  bundles: unknown[];
}

interface UserProfile {
  name: string;
  email: string;
  avatar: string | null;
  registrationDate: string;
}

interface UserStats {
  totalEstimates: number;
  lastActivity: string;
  totalWorkVolume: number;
  totalTimeInApp: number;
}

interface UserSettings {
  theme: 'light' | 'dark';
  language: 'ru' | 'en';
  notifications: boolean;
}

const APP_START_KEY = 'kmobn:appStartTime';
const TOTAL_TIME_KEY = 'kmobn:totalTimeSpent';

const getTimeSpent = (): number => {
  const total = parseInt(localStorage.getItem(TOTAL_TIME_KEY) || '0', 10);
  const start = parseInt(localStorage.getItem(APP_START_KEY) || '0', 10);
  if (start > 0) {
    return total + Math.floor((Date.now() - start) / 60000);
  }
  return total;
};

const ProfileModal: React.FC<ProfileModalProps> = ({
  isOpen,
  onClose,
  user,
  estimates,
  materials,
  works,
  bundles,
}) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'stats' | 'settings'>('profile');
  const [profile, setProfile] = useState<UserProfile>({
    name: user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Пользователь',
    email: user?.email || '',
    avatar: user?.user_metadata?.avatar_url || null,
    registrationDate: user?.created_at || new Date().toISOString(),
  });
  const [stats, setStats] = useState<UserStats>({
    totalEstimates: 0,
    lastActivity: new Date().toISOString(),
    totalWorkVolume: 0,
    totalTimeInApp: 0,
  });
  const [settings, setSettings] = useState<UserSettings>({
    theme: 'dark',
    language: 'ru',
    notifications: true,
  });
  const [updateStatus, setUpdateStatus] = useState<string>('');
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    const totalEstimates = Array.isArray(estimates) ? estimates.length : 0;
    const lastActivity = new Date().toISOString();
    
    const totalWorkVolume = Array.isArray(estimates)
      ? estimates.reduce((sum: number, est: any) => {
          const items = est.items || [];
          return sum + items.reduce((itemSum: number, item: any) => {
            return itemSum + (item.total || 0);
          }, 0);
        }, 0)
      : 0;

    const savedSettings = localStorage.getItem('profileSettings');
    if (savedSettings) {
      try {
        setSettings(JSON.parse(savedSettings));
      } catch (e) {
        console.error('Failed to parse saved settings:', e);
      }
    }

    setStats({
      totalEstimates,
      lastActivity,
      totalWorkVolume,
      totalTimeInApp: getTimeSpent(),
    });
  }, [isOpen, estimates, materials, works, bundles]);

  const handleSaveSettings = () => {
    localStorage.setItem('profileSettings', JSON.stringify(settings));
    // Apply theme
    document.documentElement.classList.toggle('dark', settings.theme === 'dark');
    document.documentElement.classList.toggle('light', settings.theme === 'light');
  };

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
    const a = document.createElement('a');
    a.href = url;
    a.download = `karkas-master-export-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleClearCache = () => {
    if (confirm('Вы уверены, что хотите очистить локальный кэш? Это не повлияет на данные в облаке.')) {
      localStorage.clear();
      indexedDB.deleteDatabase('kmobn_indexeddb_cache');
      window.location.reload();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-xl font-bold text-text-primary">Профиль</h2>
          <button
            onClick={onClose}
            className="text-text-secondary hover:text-text-primary transition-colors p-2"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border">
          {[
            { id: 'profile' as const, label: 'Личные данные' },
            { id: 'stats' as const, label: 'Статистика' },
            { id: 'settings' as const, label: 'Настройки' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-3 px-4 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          {activeTab === 'profile' && (
            <div className="space-y-6">
              {/* Avatar */}
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-full bg-gray-700 flex items-center justify-center overflow-hidden">
                  {profile.avatar ? (
                    <img src={profile.avatar} alt="Аватар" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-3xl text-text-secondary">
                      {profile.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-text-primary">{profile.name}</h3>
                  <p className="text-sm text-text-secondary">{profile.email}</p>
                </div>
              </div>

              {/* Registration Date */}
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  Дата регистрации
                </label>
                <p className="text-text-primary">
                  {new Date(profile.registrationDate).toLocaleDateString('ru-RU')}
                </p>
              </div>

              {/* Edit Name */}
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  Имя пользователя
                </label>
                <input
                  type="text"
                  value={profile.name}
                  onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-800 border border-border rounded-lg text-text-primary focus:outline-none focus:border-primary"
                />
              </div>
            </div>
          )}

          {activeTab === 'stats' && (
            <div className="space-y-6">
              {/* Main Stats */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-800 rounded-lg p-4">
                  <p className="text-sm text-text-secondary">Количество смет</p>
                  <p className="text-2xl font-bold text-text-primary">{stats.totalEstimates}</p>
                </div>
                <div className="bg-gray-800 rounded-lg p-4">
                  <p className="text-sm text-text-secondary">Общий объем работ</p>
                  <p className="text-2xl font-bold text-text-primary">
                    {stats.totalWorkVolume.toLocaleString('ru-RU')} ₽
                  </p>
                </div>
              </div>

              {/* Last Activity */}
              <div>
                <p className="text-sm text-text-secondary mb-2">Последняя активность</p>
                <p className="text-text-primary">
                  {new Date(stats.lastActivity).toLocaleString('ru-RU')}
                </p>
              </div>

              {/* Time in App */}
              <div>
                <p className="text-sm text-text-secondary mb-2">Время в приложении</p>
                <p className="text-text-primary">
                  {Math.floor(stats.totalTimeInApp / 60)} ч {stats.totalTimeInApp % 60} мин
                </p>
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="space-y-6">
              {/* Theme */}
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  Тема
                </label>
                <select
                  value={settings.theme}
                  onChange={(e) => setSettings({ ...settings, theme: e.target.value as 'light' | 'dark' })}
                  className="w-full px-4 py-2 bg-gray-800 border border-border rounded-lg text-text-primary focus:outline-none focus:border-primary"
                >
                  <option value="dark">Тёмная</option>
                  <option value="light">Светлая</option>
                </select>
              </div>

              {/* Language */}
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  Язык
                </label>
                <select
                  value={settings.language}
                  onChange={(e) => setSettings({ ...settings, language: e.target.value as 'ru' | 'en' })}
                  className="w-full px-4 py-2 bg-gray-800 border border-border rounded-lg text-text-primary focus:outline-none focus:border-primary"
                >
                  <option value="ru">Русский</option>
                  <option value="en">English</option>
                </select>
              </div>

              {/* Notifications */}
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-text-secondary">
                  Уведомления
                </label>
                <button
                  onClick={() => setSettings({ ...settings, notifications: !settings.notifications })}
                  className={`w-12 h-6 rounded-full transition-colors ${
                    settings.notifications ? 'bg-primary' : 'bg-gray-600'
                  }`}
                >
                  <div
                    className={`w-5 h-5 bg-white rounded-full transform transition-transform ${
                      settings.notifications ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Export Data */}
              <div>
                <button
                  onClick={handleExportData}
                  className="w-full px-4 py-2 bg-gray-800 border border-border rounded-lg text-text-primary hover:bg-gray-700 transition-colors"
                >
                  Экспорт данных (JSON)
                </button>
              </div>

              {/* Clear Cache */}
              <div>
                <button
                  onClick={handleClearCache}
                  className="w-full px-4 py-2 bg-red-600/20 border border-red-600/50 rounded-lg text-red-400 hover:bg-red-600/30 transition-colors"
                >
                  Очистить локальный кэш
                </button>
              </div>

              {/* Check for Updates */}
              {window.electronAPI?.isElectron && (
                <div>
                  <button
                    onClick={async () => {
                      setIsCheckingUpdate(true);
                      setUpdateStatus('');
                      try {
                        await window.electronAPI?.checkForUpdates?.();
                        setUpdateStatus('Проверка завершена');
                      } catch {
                        setUpdateStatus('Ошибка проверки');
                      }
                      setIsCheckingUpdate(false);
                      setTimeout(() => setUpdateStatus(''), 3000);
                    }}
                    disabled={isCheckingUpdate}
                    className="w-full px-4 py-2 bg-gray-800 border border-border rounded-lg text-text-primary hover:bg-gray-700 transition-colors disabled:opacity-60"
                  >
                    {isCheckingUpdate ? 'Проверяю...' : 'Проверить обновления'}
                  </button>
                  {updateStatus && (
                    <p className="mt-2 text-center text-sm text-text-secondary">{updateStatus}</p>
                  )}
                </div>
              )}

              {/* Save Settings */}
              <div>
                <button
                  onClick={handleSaveSettings}
                  className="w-full px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/80 transition-colors"
                >
                  Сохранить настройки
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProfileModal;