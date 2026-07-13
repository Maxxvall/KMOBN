import { describe, expect, it, vi } from 'vitest';
import type { CacheTableKey } from './indexedDbCache';
import { prepareOfflineWorkspace } from './offlineWorkspace';

const readyCoverage = {
  ready: true,
  missingTables: [],
  lastPreparedAt: '2026-07-13T18:00:00.000Z',
  tables: {},
};

describe('offline workspace preparation', () => {
  it('does not access the network during offline startup', async () => {
    const processQueue = vi.fn();
    const refreshWorkspace = vi.fn();
    const readCoverage = vi.fn().mockResolvedValue(readyCoverage);

    const result = await prepareOfflineWorkspace('user-1', false, {
      processQueue,
      refreshWorkspace,
      readCoverage,
      countPending: vi.fn(),
    });

    expect(result.coverage.ready).toBe(true);
    expect(processQueue).not.toHaveBeenCalled();
    expect(refreshWorkspace).not.toHaveBeenCalled();
  });

  it('always pushes pending changes before pulling all snapshots', async () => {
    const order: string[] = [];
    const processQueue = vi.fn(async () => {
      order.push('push');
      return { syncedCount: 1, syncedTables: ['materials' as CacheTableKey], pendingCount: 0 };
    });
    const refreshWorkspace = vi.fn(async () => {
      order.push('pull');
      return { refreshedTables: [], skippedTables: [], failedTables: [] };
    });

    await prepareOfflineWorkspace('user-1', true, {
      processQueue,
      refreshWorkspace,
      readCoverage: vi.fn().mockResolvedValue(readyCoverage),
      countPending: vi.fn().mockResolvedValue(0),
    });

    expect(order).toEqual(['push', 'pull']);
  });

  it('does not pull while a pending change remains', async () => {
    const refreshWorkspace = vi.fn();

    await expect(prepareOfflineWorkspace('user-1', true, {
      processQueue: vi.fn().mockResolvedValue({ syncedCount: 0, syncedTables: [], pendingCount: 1 }),
      refreshWorkspace,
      readCoverage: vi.fn(),
      countPending: vi.fn().mockResolvedValue(1),
    })).rejects.toThrow('Локальные изменения ещё не отправлены');

    expect(refreshWorkspace).not.toHaveBeenCalled();
  });
});
