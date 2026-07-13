import type { CacheTableKey } from './indexedDbCache';
import { offlineQueue, type PendingChange } from './offlineQueue';
import { deleteTableRecords, upsertTable } from './supabase';

const SUPPORTED_TABLES: ReadonlySet<CacheTableKey> = new Set<CacheTableKey>([
  'estimates',
  'templates',
  'materials',
  'works',
  'bundles',
  'salary_calculations',
]);

export type ExecutePendingChange = (change: PendingChange, userId: string) => Promise<void>;

export type OfflineSyncResult = {
  syncedCount: number;
  syncedTables: CacheTableKey[];
  pendingCount: number;
};

export class OfflineSyncError extends Error {
  readonly change: PendingChange;
  readonly retryable: boolean;

  constructor(change: PendingChange, cause: unknown, retryable: boolean) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = 'OfflineSyncError';
    this.change = change;
    this.retryable = retryable;
  }
}

export const isRetryableSyncError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return true;
  const value = error as { status?: unknown; statusCode?: unknown; code?: unknown };
  const numericStatus = Number(value.status ?? value.statusCode);
  if (Number.isFinite(numericStatus)) {
    return numericStatus === 408 || numericStatus === 429 || numericStatus >= 500;
  }
  const code = typeof value.code === 'string' ? value.code : '';
  if (/^(22|23|42|PGRST)/.test(code)) return false;
  return true;
};

export const executeRemoteChange: ExecutePendingChange = async (change, userId) => {
  if (change.userId !== userId) {
    throw new Error('Refusing to sync a change owned by another user');
  }
  if (!SUPPORTED_TABLES.has(change.table)) {
    throw new Error(`Unsupported offline table: ${change.table}`);
  }

  if (change.operation === 'upsert') {
    if (!change.data || typeof change.data !== 'object') {
      throw new Error(`Invalid upsert payload for ${change.table}:${change.recordId}`);
    }
    const { data, error } = await upsertTable(change.table, [change.data], userId);
    if (error) throw error;
    if (!Array.isArray(data) || data.length !== 1) {
      throw new Error(`Supabase did not acknowledge ${change.table}:${change.recordId}`);
    }
    return;
  }

  const { error } = await deleteTableRecords(change.table, [change.recordId], userId);
  if (error) throw error;
};

const inFlightByUser = new Map<string, Promise<OfflineSyncResult>>();

const runQueue = async (userId: string, executeChange: ExecutePendingChange): Promise<OfflineSyncResult> => {
  let syncedCount = 0;
  const syncedTables = new Set<CacheTableKey>();
  const changes = await offlineQueue.getAll(userId);

  for (const change of changes) {
    try {
      await executeChange(change, userId);
      const acknowledged = await offlineQueue.acknowledge(change.id, change.sequence);
      if (acknowledged) {
        syncedCount += 1;
        syncedTables.add(change.table);
      }
    } catch (error) {
      const retryable = isRetryableSyncError(error);
      const stillCurrent = await offlineQueue.markFailed(change.id, change.sequence, error, retryable);
      // The failed snapshot may already have been replaced by a newer local
      // version. Do not block that newer version behind a stale failure.
      if (!stillCurrent) continue;
      throw new OfflineSyncError(change, error, retryable);
    }
  }

  return {
    syncedCount,
    syncedTables: [...syncedTables],
    pendingCount: await offlineQueue.count(userId),
  };
};

export const processOfflineQueue = async (
  userId: string,
  executeChange: ExecutePendingChange = executeRemoteChange,
): Promise<OfflineSyncResult> => {
  if (!userId || userId === 'anon') {
    throw new Error('An authenticated user is required to sync offline data');
  }

  const existing = inFlightByUser.get(userId);
  if (existing) return existing;

  const promise = runQueue(userId, executeChange).finally(() => {
    if (inFlightByUser.get(userId) === promise) inFlightByUser.delete(userId);
  });
  inFlightByUser.set(userId, promise);
  return promise;
};
