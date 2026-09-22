import type { CacheTableKey } from './indexedDbCache';
import { offlineQueue, type PendingChange } from './offlineQueue';
import { deleteOfflineRecord, saveOfflineRecord } from './supabase';
import { fetchEstimateSections, saveEstimateSectionsRemote } from './supabase';
import { upsertCachedRecords } from './indexedDbCache';
import type { EstimateSectionsDocument } from '../types';
import { tryMergeEstimateSectionsDocuments } from './estimateSections';

const SUPPORTED_TABLES: ReadonlySet<CacheTableKey> = new Set<CacheTableKey>([
  'estimates',
  'templates',
  'materials',
  'works',
  'bundles',
  'salary_calculations',
  'estimate_sections',
]);

type ExecutePendingChangeResult = {
  confirmedSections?: EstimateSectionsDocument;
  confirmedRecord?: { table: CacheTableKey; data: { id: string; serverRevision?: number } };
};

export type ExecutePendingChange = (
  change: PendingChange,
  userId: string,
) => Promise<void | ExecutePendingChangeResult>;

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
  const value = error as { status?: unknown; statusCode?: unknown; code?: unknown; message?: unknown };
  const numericStatus = Number(value.status ?? value.statusCode);
  if (Number.isFinite(numericStatus)) {
    return numericStatus === 408 || numericStatus === 429 || numericStatus >= 500;
  }
  const code = typeof value.code === 'string' ? value.code : '';
  if (code === '40001' && /OFFLINE_RECORD_CONFLICT/.test(String(value.message ?? ''))) return false;
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
  if (!change.operationId) {
    throw new Error('Offline change is missing an operation id');
  }

  if (change.operation === 'upsert') {
    if (!change.data || typeof change.data !== 'object') {
      throw new Error(`Invalid upsert payload for ${change.table}:${change.recordId}`);
    }
    if (change.table === 'estimate_sections') {
      const local = change.data as EstimateSectionsDocument;
      const { data, error } = await saveEstimateSectionsRemote(local, userId);
      if (error && (String((error as { code?: unknown }).code) === '40001' || /ESTIMATE_SECTIONS_CONFLICT/.test(String((error as { message?: unknown }).message)))) {
        const remoteResult = await fetchEstimateSections(userId);
        if (remoteResult.error || !remoteResult.data?.[0]) throw remoteResult.error ?? error;
        const remote = remoteResult.data[0] as EstimateSectionsDocument;
        const merged = tryMergeEstimateSectionsDocuments(local, remote);
        if (merged) {
          await offlineQueue.enqueueUpserts(userId, 'estimate_sections', [merged]);
          await upsertCachedRecords('estimate_sections', userId, [merged]);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('kmobn:cache-update', { detail: { key: 'estimate_sections', data: [merged] } }));
          }
          return;
        }
        const conflict: EstimateSectionsDocument = {
          ...local,
          syncConflict: {
            local: { definitions: local.definitions, order: local.order, serverRevision: local.serverRevision },
            remote: { definitions: remote.definitions, order: remote.order, serverRevision: remote.serverRevision },
            detectedAt: new Date().toISOString(),
          },
        };
        await upsertCachedRecords('estimate_sections', userId, [conflict]);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('kmobn:cache-update', { detail: { key: 'estimate_sections', data: [conflict] } }));
        }
        return;
      }
      if (error) throw error;
      if (!Array.isArray(data) || data.length !== 1) throw new Error('Supabase did not acknowledge estimate_sections');
      const confirmed = data[0] as EstimateSectionsDocument;
      return {
        confirmedSections: {
          ...confirmed,
          baseDocument: {
            definitions: confirmed.definitions,
            order: confirmed.order,
            serverRevision: confirmed.serverRevision,
          },
          operationId: undefined,
          syncConflict: undefined,
        },
      };
    }
    const { data, error } = await saveOfflineRecord(
      change.table,
      change.data as Record<string, unknown>,
      userId,
      change.operationId,
    );
    if (error) throw error;
    if (!data || typeof data !== 'object' || typeof (data as { id?: unknown }).id !== 'string') {
      throw new Error(`Supabase did not acknowledge ${change.table}:${change.recordId}`);
    }
    return {
      confirmedRecord: {
        table: change.table,
        data: data as { id: string; serverRevision?: number },
      },
    };
  }

  const { error } = await deleteOfflineRecord(
    change.table,
    change.recordId,
    userId,
    change.baseRevision ?? 0,
    change.operationId,
  );
  if (error) throw error;
};

const inFlightByUser = new Map<string, Promise<OfflineSyncResult>>();

const runQueue = async (userId: string, executeChange: ExecutePendingChange): Promise<OfflineSyncResult> => {
  let syncedCount = 0;
  const syncedTables = new Set<CacheTableKey>();
  const changes = await offlineQueue.getAll(userId);

  for (const change of changes) {
    if (change.failureKind === 'permanent') continue;
    try {
      const result = await executeChange(change, userId);
      const acknowledged = await offlineQueue.acknowledge(change.id, change.sequence, change.operationId);
      if (acknowledged) {
        if (result && result.confirmedSections) {
          await upsertCachedRecords('estimate_sections', userId, [result.confirmedSections]);
          if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
            window.dispatchEvent(new CustomEvent('kmobn:cache-update', {
              detail: { key: 'estimate_sections', data: [result.confirmedSections] },
            }));
          }
        }
        if (result && result.confirmedRecord) {
          await upsertCachedRecords(
            result.confirmedRecord.table,
            userId,
            [result.confirmedRecord.data],
          );
          if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
            window.dispatchEvent(new CustomEvent('kmobn:cache-update', {
              detail: {
                key: result.confirmedRecord.table,
                data: [result.confirmedRecord.data],
              },
            }));
          }
        }
        syncedCount += 1;
        syncedTables.add(change.table);
      } else if (result) {
        const confirmed = result.confirmedSections ?? result.confirmedRecord?.data;
        if (confirmed) {
          const rebased = await offlineQueue.rebaseAfterConfirmation(
            change.id,
            change.sequence,
            change.operationId,
            confirmed,
          );
          if (rebased?.operation === 'upsert' && rebased.data && typeof rebased.data === 'object') {
            await upsertCachedRecords(
              rebased.table,
              userId,
              [rebased.data as { id: string }],
            );
            if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
              window.dispatchEvent(new CustomEvent('kmobn:cache-update', {
                detail: { key: rebased.table, data: [rebased.data] },
              }));
            }
          }
        }
      }
    } catch (error) {
      const retryable = isRetryableSyncError(error);
      const stillCurrent = await offlineQueue.markFailed(
        change.id,
        change.sequence,
        error,
        retryable,
        change.operationId,
      );
      // The failed snapshot may already have been replaced by a newer local
      // version. Do not block that newer version behind a stale failure.
      if (!stillCurrent) continue;
      if (retryable) throw new OfflineSyncError(change, error, true);
      // Keep a permanently invalid record for repair without blocking
      // independent changes later in the queue.
    }
  }

  return {
    syncedCount,
    syncedTables: [...syncedTables],
    pendingCount: await offlineQueue.count(userId),
  };
};

const runWithCrossContextLock = async (
  userId: string,
  executeChange: ExecutePendingChange,
): Promise<OfflineSyncResult> => {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request(`kmobn-offline-sync:${userId}`, () => runQueue(userId, executeChange));
  }
  return runQueue(userId, executeChange);
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

  const promise = runWithCrossContextLock(userId, executeChange).finally(() => {
    if (inFlightByUser.get(userId) === promise) inFlightByUser.delete(userId);
  });
  inFlightByUser.set(userId, promise);
  return promise;
};
