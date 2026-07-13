export interface UsageStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const USAGE_VERSION_KEY = 'kmobn:activeUsageVersion';
const TOTAL_ACTIVE_TIME_KEY = 'kmobn:totalActiveTimeMs';
const ACTIVE_SESSION_KEY = 'kmobn:activeUsageStartedAt';
const USAGE_VERSION = '2';
const LEGACY_KEYS = ['kmobn:appStartTime', 'kmobn:totalTimeSpent'];

const readNumber = (storage: UsageStorage, key: string): number => {
  const value = Number(storage.getItem(key));
  return Number.isFinite(value) && value > 0 ? value : 0;
};

export const migrateUsageStorage = (storage: UsageStorage): void => {
  if (storage.getItem(USAGE_VERSION_KEY) === USAGE_VERSION) return;

  storage.setItem(USAGE_VERSION_KEY, USAGE_VERSION);
  storage.setItem(TOTAL_ACTIVE_TIME_KEY, '0');
  storage.removeItem(ACTIVE_SESSION_KEY);
  LEGACY_KEYS.forEach((key) => storage.removeItem(key));
};

export const initializeAppUsage = (storage: UsageStorage): void => {
  migrateUsageStorage(storage);
  // A previous page could have closed unexpectedly. Never charge its offline time.
  storage.removeItem(ACTIVE_SESSION_KEY);
};

export const resumeAppUsage = (storage: UsageStorage, now = Date.now()): void => {
  if (!storage.getItem(ACTIVE_SESSION_KEY)) {
    storage.setItem(ACTIVE_SESSION_KEY, String(now));
  }
};

export const pauseAppUsage = (storage: UsageStorage, now = Date.now()): void => {
  const startedAt = readNumber(storage, ACTIVE_SESSION_KEY);
  if (!startedAt) return;

  const elapsed = Math.max(0, now - startedAt);
  const total = readNumber(storage, TOTAL_ACTIVE_TIME_KEY);
  storage.setItem(TOTAL_ACTIVE_TIME_KEY, String(total + elapsed));
  storage.removeItem(ACTIVE_SESSION_KEY);
};

export const getActiveUsageMs = (storage: UsageStorage, now = Date.now()): number => {
  const total = readNumber(storage, TOTAL_ACTIVE_TIME_KEY);
  const startedAt = readNumber(storage, ACTIVE_SESSION_KEY);
  return total + (startedAt ? Math.max(0, now - startedAt) : 0);
};

export const setupAppUsageTracking = (): (() => void) => {
  const storage = window.localStorage;
  initializeAppUsage(storage);

  let isTracking = false;
  const syncTracking = () => {
    const shouldTrack = document.visibilityState === 'visible' && document.hasFocus();

    if (shouldTrack && !isTracking) resumeAppUsage(storage);
    if (!shouldTrack && isTracking) pauseAppUsage(storage);

    isTracking = shouldTrack;
  };

  const checkpoint = () => {
    if (!isTracking) return;
    pauseAppUsage(storage);
    resumeAppUsage(storage);
  };

  const stopTracking = () => {
    pauseAppUsage(storage);
    isTracking = false;
  };

  syncTracking();
  const interval = window.setInterval(checkpoint, 30_000);
  document.addEventListener('visibilitychange', syncTracking);
  window.addEventListener('focus', syncTracking);
  window.addEventListener('blur', syncTracking);
  window.addEventListener('pagehide', stopTracking);
  window.addEventListener('beforeunload', stopTracking);

  return () => {
    window.clearInterval(interval);
    document.removeEventListener('visibilitychange', syncTracking);
    window.removeEventListener('focus', syncTracking);
    window.removeEventListener('blur', syncTracking);
    window.removeEventListener('pagehide', stopTracking);
    window.removeEventListener('beforeunload', stopTracking);
    stopTracking();
  };
};
