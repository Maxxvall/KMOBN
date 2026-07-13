import { describe, expect, it } from 'vitest';
import {
  getActiveUsageMs,
  initializeAppUsage,
  pauseAppUsage,
  resumeAppUsage,
  type UsageStorage,
} from './appUsage';

const createStorage = (initial: Record<string, string> = {}): UsageStorage & { values: Map<string, string> } => {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
};

describe('app usage tracking', () => {
  it('resets the unreliable legacy counter once', () => {
    const storage = createStorage({
      'kmobn:appStartTime': '1700000000000',
      'kmobn:totalTimeSpent': '19320',
    });

    initializeAppUsage(storage);

    expect(storage.getItem('kmobn:totalActiveTimeMs')).toBe('0');
    expect(storage.getItem('kmobn:appStartTime')).toBeNull();
    expect(storage.getItem('kmobn:totalTimeSpent')).toBeNull();
  });

  it('counts only the time between resume and pause', () => {
    const storage = createStorage();
    initializeAppUsage(storage);

    resumeAppUsage(storage, 1_000);
    pauseAppUsage(storage, 61_000);

    expect(getActiveUsageMs(storage, 600_000)).toBe(60_000);
  });

  it('does not restore an unfinished session after a restart', () => {
    const storage = createStorage({
      'kmobn:activeUsageVersion': '2',
      'kmobn:totalActiveTimeMs': '60000',
      'kmobn:activeUsageStartedAt': '1000',
    });

    initializeAppUsage(storage);

    expect(getActiveUsageMs(storage, 600_000)).toBe(60_000);
  });
});
