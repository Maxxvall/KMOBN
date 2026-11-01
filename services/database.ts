import { Estimate, EstimateStatus, ProjectTemplate, Material, Work, WorkBundle, normalizeKey, EstimateSectionsDocument } from '../types';
import { generateEstimateNumber } from './estimateNumber';
import {
  CacheTableKey,
  deleteCachedRecords,
  getCachedRecords,
  getCacheUserId,
  isTableSnapshotComplete,
  OFFLINE_TABLES,
  syncCachedRecords,
  upsertCachedRecords,
} from './indexedDbCache';
import { offlineQueue, type PendingChange } from './offlineQueue';
import { hashData } from './hashing';
import { getOfflineUserId, rememberOfflineUser } from './offlineIdentity';
import { withTableMutationLock } from './tableMutationLock';
import { normalizeEstimateSectionsDocument, prepareEstimateSectionsDocumentForSave } from './estimateSections';
import { toClientEstimate } from './clientEstimate';
import supabase, {
  isSupabaseConfigured,
  fetchEstimates,
  fetchTemplates,
  fetchMaterials,
  fetchWorks,
  fetchBundles,
  fetchEstimateSections,
  fetchOfflineRecord,
} from './supabase';

const ensureSupabase = () => {
  if (!supabase) {
    throw new Error('Supabase is not configured');
  }
  return supabase;
};

const parseTimestamp = (value?: string | null): number | null => {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const inferStableSortOrder = (record: Record<string, unknown>, fallbackIndex: number): number => {
  if (typeof record.sortOrder === 'number' && Number.isFinite(record.sortOrder)) {
    return record.sortOrder;
  }

  const createdAtTs = parseTimestamp(typeof record.created_at === 'string' ? record.created_at : null);
  if (createdAtTs != null) return createdAtTs;

  const updatedAtTs = parseTimestamp(typeof record.updated_at === 'string' ? record.updated_at : null);
  if (updatedAtTs != null) return updatedAtTs;

  const lastUpdatedTs = parseTimestamp(typeof record.lastUpdated === 'string' ? record.lastUpdated : null);
  if (lastUpdatedTs != null) return lastUpdatedTs;

  const dateTs = parseTimestamp(typeof record.date === 'string' ? record.date : null);
  if (dateTs != null) return dateTs;

  const idText = typeof record.id === 'string' ? record.id : '';
  const numericIdPart = Number((idText.match(/(\d{8,})/) || [])[1]);
  if (Number.isFinite(numericIdPart)) return numericIdPart;

  return fallbackIndex;
};

const compareByStableOrder = <T extends { id: string }>(left: T, right: T): number => {
  const leftSortOrder = inferStableSortOrder(left as unknown as Record<string, unknown>, 0);
  const rightSortOrder = inferStableSortOrder(right as unknown as Record<string, unknown>, 0);
  if (leftSortOrder !== rightSortOrder) return leftSortOrder - rightSortOrder;

  const leftCreatedAt = parseTimestamp((left as unknown as { created_at?: string | null }).created_at ?? null) ?? 0;
  const rightCreatedAt = parseTimestamp((right as unknown as { created_at?: string | null }).created_at ?? null) ?? 0;
  if (leftCreatedAt !== rightCreatedAt) return leftCreatedAt - rightCreatedAt;

  return String(left.id).localeCompare(String(right.id));
};

export const normalizeStableOrder = <T extends { id: string }>(records: T[]): T[] => {
  if (records.length <= 1) return records;
  return [...records].sort(compareByStableOrder);
};

const findCachedUserId = (): string | null => {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          const session = parsed?.current_session || parsed?.session || parsed;
          if (session?.user?.id) return session.user.id;
        }
      }
    }
  } catch {}
  return null;
};

const getAuthenticatedUserId = async (): Promise<string | null> => {
  if (!isSupabaseConfigured()) {
    return getOfflineUserId() ?? findCachedUserId();
  }
  const client = ensureSupabase();
  const { data, error } = await client.auth.getSession();
  if (error) {
    console.error('Supabase getSession error:', error);
    return getOfflineUserId() ?? findCachedUserId();
  }
  if (data.session?.user) {
    rememberOfflineUser(data.session.user);
    return data.session.user.id;
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return getOfflineUserId() ?? findCachedUserId();
  }
  return null;
};

export const getWorkspaceUserId = (): string | null => getOfflineUserId() ?? findCachedUserId();

const requireWorkspaceUserId = (): string => {
  const userId = getWorkspaceUserId();
  if (!userId || userId === 'anon') {
    throw new Error('Не удалось определить владельца локальных данных. Войдите в аккаунт повторно.');
  }
  return userId;
};

const dispatchCacheUpdate = <T>(key: CacheTableKey, data: T[]): void => {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent('kmobn:cache-update', { detail: { key, data } }));
  } catch {
    // ignore
  }
};

// Throttle: minimum 60 seconds between background refreshes per table
const REFRESH_COOLDOWN_MS = 60_000;
const lastRefreshTimestamps = new Map<string, number>();
const refreshesInFlight = new Set<string>();
const localMutationGenerations = new Map<string, number>();

const getRefreshKey = (key: CacheTableKey, userId: string): string => `${key}:${userId}`;
const getMutationGeneration = (key: string): number => localMutationGenerations.get(key) ?? 0;
const bumpMutationGeneration = (key: string): void => {
  localMutationGenerations.set(key, getMutationGeneration(key) + 1);
};

const isRefreshThrottled = (key: CacheTableKey, userId: string): boolean => {
  const compositeKey = getRefreshKey(key, userId);
  const lastTs = lastRefreshTimestamps.get(compositeKey) ?? 0;
  return Date.now() - lastTs < REFRESH_COOLDOWN_MS;
};

const markRefreshed = (key: CacheTableKey, userId: string): void => {
  const compositeKey = getRefreshKey(key, userId);
  lastRefreshTimestamps.set(compositeKey, Date.now());
};

type TableFetcher = (
  userId: string,
) => Promise<{ data: unknown[] | null; error: unknown }>;

const OFFLINE_TABLE_FETCHERS: Partial<Record<CacheTableKey, TableFetcher>> = {
  estimates: fetchEstimates,
  templates: fetchTemplates,
  materials: fetchMaterials,
  works: fetchWorks,
  bundles: fetchBundles,
  estimate_sections: fetchEstimateSections,
};

export type OfflineWorkspaceRefreshResult = {
  refreshedTables: CacheTableKey[];
  skippedTables: CacheTableKey[];
  failedTables: CacheTableKey[];
};

/**
 * Persists a remotely confirmed record into the cache under the table
 * mutation lock, bumping the generation so an in-flight refresh of a stale
 * snapshot defers to the confirmation instead of overwriting it.
 */
export const applyConfirmedRecordToCache = async (
  table: CacheTableKey,
  userId: string,
  record: { id: string },
): Promise<void> => {
  const refreshKey = getRefreshKey(table, userId);
  bumpMutationGeneration(refreshKey);
  await withTableMutationLock(refreshKey, async () => {
    await upsertCachedRecords(table, getCacheUserId(userId), [record]);
  });
};

/**
 * Applies a server snapshot while keeping records with pending local changes
 * authoritative in the cache (outbox-first): the snapshot applies around them
 * and the unconfirmed outbox forms are written back afterwards.
 */
const applySnapshotPreservingPending = async <T extends { id: string }>(
  key: CacheTableKey,
  cacheUserId: string,
  records: T[],
  pending: PendingChange[],
): Promise<{ changed: boolean; merged: T[] }> => {
  const pendingIds = new Set(pending.map(change => change.recordId));
  const applyRecords = pendingIds.size ? records.filter(record => !pendingIds.has(record.id)) : records;
  // The outbox is the single source of truth for unconfirmed forms: its
  // upsert payloads are newer than anything on the server and may even be
  // missing from the cache when a cache write failed after enqueueing.
  const pendingUpserts = pending
    .filter(change => change.operation === 'upsert' && change.data && typeof change.data === 'object')
    .map(change => change.data as T);
  const { changed } = await syncCachedRecords(key, cacheUserId, applyRecords);
  if (pendingUpserts.length) {
    await upsertCachedRecords(key, cacheUserId, pendingUpserts);
  }
  const merged = normalizeStableOrder(pendingIds.size ? [...applyRecords, ...pendingUpserts] : records);
  return { changed: changed || pendingUpserts.length > 0, merged };
};

const hasUnresolvedEstimateSectionsConflict = async (userId: string): Promise<boolean> => (
  (await getCachedRecords<EstimateSectionsDocument>('estimate_sections', getCacheUserId(userId)))
    .some(document => Boolean(document.syncConflict))
);

/** Downloads complete server snapshots without overwriting newer local changes. */
export const refreshOfflineWorkspace = async (userId: string): Promise<OfflineWorkspaceRefreshResult> => {
  if (!userId || userId === 'anon') throw new Error('Authenticated user is required');
  const result: OfflineWorkspaceRefreshResult = {
    refreshedTables: [],
    skippedTables: [],
    failedTables: [],
  };

  for (const table of OFFLINE_TABLES) {
    const refreshKey = getRefreshKey(table, userId);
    // estimate_sections keeps its conservative single-document flow: its
    // pending changes and conflicts are resolved through the merge review.
    if (table === 'estimate_sections'
      && ((await offlineQueue.getForTable(userId, table)).length > 0
        || await hasUnresolvedEstimateSectionsConflict(userId))) {
      result.skippedTables.push(table);
      continue;
    }
    const refreshGeneration = getMutationGeneration(refreshKey);
    try {
      const fetcher = OFFLINE_TABLE_FETCHERS[table];
      if (!fetcher) continue;
      const { data, error } = await fetcher(userId);
      if (error) throw error;
      const records = normalizeStableOrder((data ?? []) as Array<{ id: string }>);
      const applied = await withTableMutationLock(refreshKey, async (): Promise<boolean> => {
        if (getMutationGeneration(refreshKey) !== refreshGeneration) return false;
        const pending = await offlineQueue.getForTable(userId, table);
        if (table === 'estimate_sections'
          && (pending.length > 0 || await hasUnresolvedEstimateSectionsConflict(userId))) return false;
        if (getMutationGeneration(refreshKey) !== refreshGeneration) return false;
        await applySnapshotPreservingPending(table, getCacheUserId(userId), records, pending);
        if (getMutationGeneration(refreshKey) !== refreshGeneration) return false;
        markRefreshed(table, userId);
        return true;
      });
      if (applied) {
        result.refreshedTables.push(table);
      } else {
        result.skippedTables.push(table);
      }
    } catch (error) {
      console.error(`[DB:${table}] Offline preload failed:`, error);
      result.failedTables.push(table);
    }
  }

  return result;
};

export const fetchPendingChangeServerRecord = async (change: PendingChange): Promise<Record<string, unknown> | null> => {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('Для сравнения с сервером нужно подключение к интернету.');
  }
  const { data, error } = await fetchOfflineRecord(change.table, change.recordId, change.userId);
  if (error) throw error;
  return data as Record<string, unknown> | null;
};

export const acceptServerVersionForPendingChange = async (
  change: PendingChange,
  serverRecord: Record<string, unknown> | null,
): Promise<void> => {
  const refreshKey = getRefreshKey(change.table, change.userId);
  await withTableMutationLock(refreshKey, async () => {
    bumpMutationGeneration(refreshKey);
    const acknowledged = await offlineQueue.acknowledge(change.id, change.sequence, change.operationId);
    if (!acknowledged) throw new Error('Локальная запись уже изменилась. Обновите список и сравните её заново.');

    const cacheUserId = getCacheUserId(change.userId);
    if (serverRecord) {
      await upsertCachedRecords(change.table, cacheUserId, [serverRecord as { id: string }]);
    } else {
      await deleteCachedRecords(change.table, cacheUserId, [change.recordId]);
    }

    const cached = await getCachedRecords<{ id: string }>(change.table, cacheUserId);
    const next = normalizeStableOrder(
      cached.filter(record => record.id !== change.recordId).concat(serverRecord ? [serverRecord as { id: string }] : []),
    );
    dispatchCacheUpdate(change.table, next);
  });
};

export const prepareLocalVersionForPendingChange = async (
  change: PendingChange,
  serverRecord: Record<string, unknown> | null,
): Promise<void> => {
  const refreshKey = getRefreshKey(change.table, change.userId);
  await withTableMutationLock(refreshKey, async () => {
    bumpMutationGeneration(refreshKey);
    const rebased = await offlineQueue.rebaseAfterReview(
      change.id,
      change.sequence,
      change.operationId,
      serverRecord,
    );
    if (!rebased) throw new Error('Локальная запись уже изменилась. Обновите список и сравните её заново.');
    if (rebased.operation !== 'upsert' || !rebased.data || typeof rebased.data !== 'object') return;

    await upsertCachedRecords(change.table, getCacheUserId(change.userId), [rebased.data as { id: string }]);
    const cached = await getCachedRecords<{ id: string }>(change.table, getCacheUserId(change.userId));
    dispatchCacheUpdate(change.table, normalizeStableOrder(cached));
  });
};

const refreshCacheInBackground = async <T extends { id: string }>(
  key: CacheTableKey,
  userId: string,
  fetcher: (uid: string) => Promise<{ data: unknown[] | null; error: unknown }>,
): Promise<void> => {
  // estimate_sections keeps its conservative single-document flow: pending
  // changes and conflicts are resolved through the merge review.
  if (key === 'estimate_sections'
    && ((await offlineQueue.getForTable(userId, key)).length > 0
      || await hasUnresolvedEstimateSectionsConflict(userId))) return;
  if (isRefreshThrottled(key, userId)) return;
  const refreshKey = getRefreshKey(key, userId);
  if (refreshesInFlight.has(refreshKey)) return;
  refreshesInFlight.add(refreshKey);
  const refreshGeneration = getMutationGeneration(refreshKey);
  try {
    // Cache a complete server snapshot. Subscription limits are applied only
    // to the returned UI slice; otherwise remote deletions outside a partial
    // window can never invalidate stale local rows. Records with pending
    // local changes are excluded from the snapshot and their cached local
    // forms are kept authoritative until the queue confirms them.
    const { data, error } = await fetcher(userId);
    if (error) {
      console.error('Supabase fetch error:', error);
      return;
    }
    const records = normalizeStableOrder((data ?? []) as T[]);
    const cacheUserId = getCacheUserId(userId);
    await withTableMutationLock(refreshKey, async () => {
      if (getMutationGeneration(refreshKey) !== refreshGeneration) return;
      const pending = await offlineQueue.getForTable(userId, key);
      if (key === 'estimate_sections'
        && (pending.length > 0 || await hasUnresolvedEstimateSectionsConflict(userId))) return;
      if (getMutationGeneration(refreshKey) !== refreshGeneration) return;
      const { changed, merged } = await applySnapshotPreservingPending<T>(key, cacheUserId, records, pending);
      if (getMutationGeneration(refreshKey) !== refreshGeneration) return;
      markRefreshed(key, userId);
      if (changed) {
        dispatchCacheUpdate(key, merged);
      }
    });
  } catch (error) {
    console.error('Cache refresh error:', error);
  } finally {
    refreshesInFlight.delete(refreshKey);
  }
};

const readTableCached = async <T extends { id: string }>(
  key: CacheTableKey,
  fetcher: (userId: string) => Promise<{ data: unknown[] | null; error: unknown }>,
): Promise<T[]> => {
  const userId = getWorkspaceUserId();
  const cacheUserId = getCacheUserId(userId);
  const pending = await offlineQueue.getForTable(cacheUserId, key);
  const cached = normalizeStableOrder(applyPendingChanges(await getCachedRecords<T>(key, cacheUserId), pending));
  const hasCompleteSnapshot = await isTableSnapshotComplete(key, cacheUserId);
  const canFetch = isSupabaseConfigured()
    && !!userId
    && (typeof navigator === 'undefined' || navigator.onLine);
  const limitedCached = cached;
  const hasLocalConflict = key === 'estimate_sections'
    && cached.some(record => Boolean((record as unknown as EstimateSectionsDocument).syncConflict));

  if (cached.length > 0 || hasCompleteSnapshot) {
    // refreshCacheInBackground applies the snapshot around pending records;
    // only the estimate_sections merge review must hold it off.
    if (canFetch && !hasLocalConflict) {
      void refreshCacheInBackground<T>(key, userId as string, fetcher);
    }
    return limitedCached;
  }

  if (!canFetch || pending.length > 0) {
    return limitedCached;
  }

  const refreshKey = getRefreshKey(key, cacheUserId);
  const refreshGeneration = getMutationGeneration(refreshKey);
  const { data, error } = await fetcher(userId as string);
  if (error) {
    console.error(`[DB:${key}] Supabase fetch error:`, error);
    return limitedCached;
  }
  const records = normalizeStableOrder((data ?? []) as T[]);
  const remoteResult = await withTableMutationLock(refreshKey, async (): Promise<T[] | null> => {
    if (getMutationGeneration(refreshKey) !== refreshGeneration) return null;
    const pendingAfterFetch = await offlineQueue.getForTable(cacheUserId, key);
    if (pendingAfterFetch.length > 0) {
      const local = normalizeStableOrder(applyPendingChanges(
        await getCachedRecords<T>(key, cacheUserId),
        pendingAfterFetch,
      ));
      return local;
    }
    if (key === 'estimate_sections' && await hasUnresolvedEstimateSectionsConflict(cacheUserId)) {
      const local = normalizeStableOrder(await getCachedRecords<T>(key, cacheUserId));
      return local;
    }
    if (getMutationGeneration(refreshKey) !== refreshGeneration) return null;
    await syncCachedRecords(key, cacheUserId, records);
    if (getMutationGeneration(refreshKey) !== refreshGeneration) return null;
    return records;
  });
  if (remoteResult) return remoteResult;
  return withTableMutationLock(refreshKey, async () => {
    return normalizeStableOrder(applyPendingChanges(
      await getCachedRecords<T>(key, cacheUserId),
      await offlineQueue.getForTable(cacheUserId, key),
    ));
  });
};

const deleteRecord = async (table: CacheTableKey, id: string): Promise<void> => {
  await deleteLocalRecords(table, [id]);
};

const deleteRecords = async (table: CacheTableKey, ids: string[]): Promise<void> => {
  await deleteLocalRecords(table, ids);
};

export const saveEstimates = async (estimates: Estimate[]): Promise<void> => {
  await saveLocalRecords('estimates', estimates);
};

export const loadEstimates = async (): Promise<Estimate[]> => readTableCached<Estimate>('estimates', fetchEstimates);

/** Fetches the signed-in user's estimates directly from Supabase for an explicit re-check. */
export const refreshEstimatesFromRemote = async (): Promise<Estimate[]> => {
  const userId = await getAuthenticatedUserId();
  if (!isSupabaseConfigured() || !userId) {
    throw new Error('Нет подключения к базе данных пользователя.');
  }
  if ((await offlineQueue.getForTable(userId, 'estimates')).length > 0) {
    throw new Error('Сначала синхронизируйте локальные изменения смет.');
  }

  const refreshKey = getRefreshKey('estimates', userId);
  const refreshGeneration = getMutationGeneration(refreshKey);
  const { data, error } = await fetchEstimates(userId);
  if (error) {
    throw new Error(`Не удалось обновить сметы из базы: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Rows come back from the JSONB payload RPC as generic records; the
  // shape contract is enforced by the revision RPC on the server.
  const records = normalizeStableOrder((data ?? []) as unknown as Estimate[]);
  return withTableMutationLock(refreshKey, async () => {
    if (getMutationGeneration(refreshKey) !== refreshGeneration) {
      throw new Error('Во время обновления появились локальные изменения смет. Данные из базы не применены.');
    }
    if ((await offlineQueue.getForTable(userId, 'estimates')).length > 0) {
      throw new Error('Во время обновления появились локальные изменения смет. Данные из базы не применены.');
    }
    if (getMutationGeneration(refreshKey) !== refreshGeneration) {
      throw new Error('Во время обновления появились локальные изменения смет. Данные из базы не применены.');
    }
    await syncCachedRecords('estimates', getCacheUserId(userId), records);
    if (getMutationGeneration(refreshKey) !== refreshGeneration) {
      throw new Error('Во время обновления появились локальные изменения смет. Данные из базы не применены.');
    }
    return records;
  });
};

const applyPendingChanges = <T extends { id: string }>(
  records: T[],
  changes: Awaited<ReturnType<typeof offlineQueue.getAll>>,
): T[] => {
  const merged = new Map(records.map(record => [record.id, record]));
  changes.forEach(change => {
    if (change.operation === 'delete') {
      merged.delete(change.recordId);
    } else if (change.data && typeof change.data === 'object') {
      merged.set(change.recordId, change.data as T);
    }
  });
  return [...merged.values()];
};

const getChangedRecords = <T extends { id: string }>(cached: T[], records: T[]): T[] => {
  const cachedHashes = new Map(cached.map(record => [record.id, hashData(record)]));
  return records.filter(record => cachedHashes.get(record.id) !== hashData(record));
};

export const saveLocalRecords = async <T extends { id: string }>(table: CacheTableKey, records: T[]): Promise<void> => {
  if (!records.length) return;
  const knownOwnerId = getOfflineUserId();
  const knownMutationKey = knownOwnerId ? getRefreshKey(table, knownOwnerId) : null;
  if (knownMutationKey) bumpMutationGeneration(knownMutationKey);
  const ownerId = requireWorkspaceUserId();
  const mutationKey = getRefreshKey(table, ownerId);
  if (mutationKey !== knownMutationKey) bumpMutationGeneration(mutationKey);
  await withTableMutationLock(mutationKey, async () => {
    const cached = await getCachedRecords<T>(table, ownerId);
    const changed = getChangedRecords(cached, records);
    if (!changed.length) return;

    // Persist the outbox first. Pending payloads can reconstruct a cache write
    // interrupted by a renderer or process crash.
    await offlineQueue.enqueueUpserts(ownerId, table, changed);
    await upsertCachedRecords(table, ownerId, changed);
  });
};

const deleteLocalRecords = async (table: CacheTableKey, recordIds: string[]): Promise<void> => {
  if (!recordIds.length) return;
  const knownOwnerId = getOfflineUserId();
  const knownMutationKey = knownOwnerId ? getRefreshKey(table, knownOwnerId) : null;
  if (knownMutationKey) bumpMutationGeneration(knownMutationKey);
  const ownerId = requireWorkspaceUserId();
  const mutationKey = getRefreshKey(table, ownerId);
  if (mutationKey !== knownMutationKey) bumpMutationGeneration(mutationKey);
  await withTableMutationLock(mutationKey, async () => {
    const [cached, pending] = await Promise.all([
      getCachedRecords<{ id: string; serverRevision?: number }>(table, ownerId),
      offlineQueue.getForTable(ownerId, table),
    ]);
    const cachedById = new Map(cached.map(record => [record.id, record]));
    const pendingById = new Map(pending.map(change => [change.recordId, change]));
    const baseRevisions = Object.fromEntries(recordIds.map(recordId => {
      const pendingData = pendingById.get(recordId)?.data as { serverRevision?: unknown } | null;
      const revision = Number(pendingData?.serverRevision ?? cachedById.get(recordId)?.serverRevision ?? 0);
      return [recordId, Number.isInteger(revision) && revision >= 0 ? revision : 0];
    }));
    await offlineQueue.enqueueDeletes(ownerId, table, recordIds, baseRevisions);
    await deleteCachedRecords(table, ownerId, recordIds);
  });
};

export const deleteEstimatesByNumber = async (estimateNumber: string | number): Promise<void> => {
  const ownerId = requireWorkspaceUserId();
  const estimates = applyPendingChanges(
    await getCachedRecords<Estimate>('estimates', ownerId),
    await offlineQueue.getForTable(ownerId, 'estimates'),
  );
  const key = String(estimateNumber);
  const ids = estimates
    .filter(estimate => String(estimate.estimateNumber) === key)
    .map(estimate => estimate.id);
  await deleteLocalRecords('estimates', ids);
};

export const deleteEstimateById = async (estimateId: string): Promise<void> => {
  await deleteRecord('estimates', estimateId);
};

export const deleteEstimates = async (estimateIds: string[]): Promise<void> => {
  await deleteRecords('estimates', estimateIds);
};

export const saveTemplates = async (templates: ProjectTemplate[]): Promise<void> => {
  await saveLocalRecords('templates', templates);
};

export const loadTemplates = async (): Promise<ProjectTemplate[]> => readTableCached<ProjectTemplate>('templates', fetchTemplates);

export const addTemplate = async (template: ProjectTemplate): Promise<void> => {
  await saveLocalRecords('templates', [template]);
};

export const deleteTemplate = async (templateId: string): Promise<void> => {
  await deleteRecord('templates', templateId);
};

export const saveMaterials = async (materials: Material[]): Promise<void> => {
  await saveLocalRecords('materials', materials);
};

export const loadMaterials = async (): Promise<Material[]> => readTableCached<Material>('materials', fetchMaterials);

async function addOrUpdateRecord<T extends { id: string }>(
  table: CacheTableKey,
  record: T,
): Promise<void> {
  await saveLocalRecords(table, [record]);
}

export const addMaterial = (material: Material) => addOrUpdateRecord('materials', material);
export const updateMaterial = (material: Material) => addOrUpdateRecord('materials', material);

export const deleteMaterial = async (materialId: string): Promise<void> => {
  await deleteRecord('materials', materialId);
};

export const deleteMaterials = async (materialIds: string[]): Promise<void> => {
  await deleteRecords('materials', materialIds);
};

export const saveWorks = async (works: Work[]): Promise<void> => {
  await saveLocalRecords('works', works);
};

export const loadWorks = async (): Promise<Work[]> => readTableCached<Work>('works', fetchWorks);

export const addWork = (work: Work) => addOrUpdateRecord('works', work);
export const updateWork = (work: Work) => addOrUpdateRecord('works', work);

export const deleteWork = async (workId: string): Promise<void> => {
  await deleteRecord('works', workId);
};

export const deleteWorks = async (workIds: string[]): Promise<void> => {
  await deleteRecords('works', workIds);
};

export const saveBundles = async (bundles: WorkBundle[]): Promise<void> => {
  await saveLocalRecords('bundles', bundles);
};

export const loadBundles = async (): Promise<WorkBundle[]> => {
  const raw = await readTableCached<WorkBundle>('bundles', fetchBundles);
  return raw.map(b => ({
    ...b,
    items: Array.isArray(b.items) ? b.items : [],
  }));
};

export const addBundle = (bundle: WorkBundle) => addOrUpdateRecord('bundles', bundle);
export const updateBundle = (bundle: WorkBundle) => addOrUpdateRecord('bundles', bundle);

export const deleteBundle = async (bundleId: string): Promise<void> => {
  await deleteRecord('bundles', bundleId);
};

export const deleteBundles = async (bundleIds: string[]): Promise<void> => {
  await deleteRecords('bundles', bundleIds);
};

export const loadEstimateSections = async (): Promise<EstimateSectionsDocument[]> => (
  readTableCached<EstimateSectionsDocument>('estimate_sections', fetchEstimateSections)
);

export const saveEstimateSections = async (document: EstimateSectionsDocument): Promise<void> => {
  await saveLocalRecords('estimate_sections', [prepareEstimateSectionsDocumentForSave(document)]);
};

