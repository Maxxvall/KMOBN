import { Estimate, ProjectTemplate, Material, Work, WorkBundle, SalaryCalculation, normalizeKey } from '../types';
import {
  CacheTableKey,
  deleteCachedRecords,
  getCachedRecords,
  getCacheUserId,
  syncCachedRecords,
  upsertCachedRecords,
} from './indexedDbCache';
import { offlineQueue } from './offlineQueue';
import { hashData } from './hashing';
import { getOfflineUserId, rememberOfflineUser } from './offlineIdentity';
import { withTableMutationLock } from './tableMutationLock';
import supabase, {
  isSupabaseConfigured,
  fetchEstimates,
  fetchTemplates,
  fetchMaterials,
  fetchWorks,
  fetchBundles,
  fetchSalaryCalculations,
} from './supabase';

const ensureSupabase = () => {
  if (!supabase) {
    throw new Error('Supabase is not configured');
  }
  return supabase;
};

type LoadTableOptions = {
  limit?: number;
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

const normalizeStableOrder = <T extends { id: string }>(records: T[]): T[] => {
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

const refreshCacheInBackground = async <T extends { id: string }>(
  key: CacheTableKey,
  userId: string,
  fetcher: (uid: string, options?: LoadTableOptions) => Promise<{ data: unknown[] | null; error: unknown }>,
  options?: LoadTableOptions,
): Promise<void> => {
  if ((await offlineQueue.getForTable(userId, key)).length > 0) return;
  if (isRefreshThrottled(key, userId)) return;
  const refreshKey = getRefreshKey(key, userId);
  if (refreshesInFlight.has(refreshKey)) return;
  refreshesInFlight.add(refreshKey);
  const refreshGeneration = getMutationGeneration(refreshKey);
  try {
    // Cache a complete server snapshot. Subscription limits are applied only
    // to the returned UI slice; otherwise remote deletions outside a partial
    // window can never invalidate stale local rows.
    const { data, error } = await fetcher(userId);
    if (error) {
      console.error('Supabase fetch error:', error);
      return;
    }
    const records = normalizeStableOrder((data ?? []) as T[]);
    const cacheUserId = getCacheUserId(userId);
    await withTableMutationLock(refreshKey, async () => {
      if (getMutationGeneration(refreshKey) !== refreshGeneration) return;
      if ((await offlineQueue.getForTable(userId, key)).length > 0) return;
      const changed = (await syncCachedRecords(key, cacheUserId, records)).changed;
      if (getMutationGeneration(refreshKey) !== refreshGeneration) return;
      markRefreshed(key, userId);
      if (changed) {
        const visibleRecords = typeof options?.limit === 'number' ? records.slice(0, options.limit) : records;
        dispatchCacheUpdate(key, visibleRecords);
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
  fetcher: (userId: string, options?: LoadTableOptions) => Promise<{ data: unknown[] | null; error: unknown }>,
  options?: LoadTableOptions,
): Promise<T[]> => {
  const userId = await getAuthenticatedUserId();
  const cacheUserId = getCacheUserId(userId);
  const pending = await offlineQueue.getForTable(cacheUserId, key);
  const cached = normalizeStableOrder(applyPendingChanges(await getCachedRecords<T>(key, cacheUserId), pending));
  const canFetch = isSupabaseConfigured() && !!userId;
  const limitedCached = typeof options?.limit === 'number' ? cached.slice(0, options.limit) : cached;

  if (cached.length > 0) {
    if (canFetch && pending.length === 0) {
      void refreshCacheInBackground<T>(key, userId as string, fetcher, options);
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
      return typeof options?.limit === 'number' ? local.slice(0, options.limit) : local;
    }
    await syncCachedRecords(key, cacheUserId, records);
    if (getMutationGeneration(refreshKey) !== refreshGeneration) return null;
    return typeof options?.limit === 'number' ? records.slice(0, options.limit) : records;
  });
  if (remoteResult) return remoteResult;
  return withTableMutationLock(refreshKey, async () => {
    const local = normalizeStableOrder(applyPendingChanges(
      await getCachedRecords<T>(key, cacheUserId),
      await offlineQueue.getForTable(cacheUserId, key),
    ));
    return typeof options?.limit === 'number' ? local.slice(0, options.limit) : local;
  });
};

const deleteRecord = async (table: CacheTableKey, id: string): Promise<void> => {
  await deleteLocalRecords(table, [id]);
};

const deleteRecords = async (table: CacheTableKey, ids: string[]): Promise<void> => {
  await deleteLocalRecords(table, ids);
};

export const pickChangedRecordsByIds = <T extends { id: string }>(records: T[], changedIds: string[]): T[] => {
  if (!records.length || !changedIds.length) return [];
  const changedSet = new Set(changedIds);
  return records.filter(record => changedSet.has(record.id));
};

export const saveEstimates = async (estimates: Estimate[]): Promise<void> => {
  await saveLocalRecords('estimates', estimates);
};

export const loadEstimates = async (options?: LoadTableOptions): Promise<Estimate[]> => readTableCached<Estimate>('estimates', fetchEstimates, options);

/** Fetches the signed-in user's estimates directly from Supabase for an explicit re-check. */
export const refreshEstimatesFromRemote = async (): Promise<Estimate[]> => {
  const userId = await getAuthenticatedUserId();
  if (!isSupabaseConfigured() || !userId) {
    throw new Error('Нет подключения к базе данных пользователя.');
  }
  if ((await offlineQueue.getForTable(userId, 'estimates')).length > 0) {
    throw new Error('РЎРЅР°С‡Р°Р»Р° СЃРёРЅС…СЂРѕРЅРёР·РёСЂСѓР№С‚Рµ Р»РѕРєР°Р»СЊРЅС‹Рµ РёР·РјРµРЅРµРЅРёСЏ СЃРјРµС‚.');
  }

  const refreshKey = getRefreshKey('estimates', userId);
  const refreshGeneration = getMutationGeneration(refreshKey);
  const { data, error } = await fetchEstimates(userId);
  if (error) {
    throw new Error(`Не удалось обновить сметы из базы: ${error instanceof Error ? error.message : String(error)}`);
  }

  const records = normalizeStableOrder((data ?? []) as Estimate[]);
  return withTableMutationLock(refreshKey, async () => {
    if (getMutationGeneration(refreshKey) !== refreshGeneration) {
      throw new Error('Во время обновления появились локальные изменения смет. Данные из базы не применены.');
    }
    if ((await offlineQueue.getForTable(userId, 'estimates')).length > 0) {
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

const saveLocalRecords = async <T extends { id: string }>(table: CacheTableKey, records: T[]): Promise<void> => {
  if (!records.length) return;
  const knownOwnerId = getOfflineUserId();
  const knownMutationKey = knownOwnerId ? getRefreshKey(table, knownOwnerId) : null;
  if (knownMutationKey) bumpMutationGeneration(knownMutationKey);
  const ownerId = getCacheUserId(await getAuthenticatedUserId());
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
  const ownerId = getCacheUserId(await getAuthenticatedUserId());
  const mutationKey = getRefreshKey(table, ownerId);
  if (mutationKey !== knownMutationKey) bumpMutationGeneration(mutationKey);
  await withTableMutationLock(mutationKey, async () => {
    await offlineQueue.enqueueDeletes(ownerId, table, recordIds);
    await deleteCachedRecords(table, ownerId, recordIds);
  });
};

export const deleteEstimatesByNumber = async (estimateNumber: string | number): Promise<void> => {
  const ownerId = getCacheUserId(await getAuthenticatedUserId());
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

export const loadTemplates = async (options?: LoadTableOptions): Promise<ProjectTemplate[]> => readTableCached<ProjectTemplate>('templates', fetchTemplates, options);

export const addTemplate = async (template: ProjectTemplate): Promise<void> => {
  await saveLocalRecords('templates', [template]);
};

export const deleteTemplate = async (templateId: string): Promise<void> => {
  await deleteRecord('templates', templateId);
};

export const saveMaterials = async (materials: Material[]): Promise<void> => {
  await saveLocalRecords('materials', materials);
};

export const loadMaterials = async (options?: LoadTableOptions): Promise<Material[]> => readTableCached<Material>('materials', fetchMaterials, options);

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

export const loadWorks = async (options?: LoadTableOptions): Promise<Work[]> => readTableCached<Work>('works', fetchWorks, options);

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

export const loadBundles = async (options?: LoadTableOptions): Promise<WorkBundle[]> => {
  const raw = await readTableCached<WorkBundle>('bundles', fetchBundles, options);
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

export const saveSalaryCalculation = async (calculation: SalaryCalculation): Promise<void> => {
  await saveLocalRecords('salary_calculations', [calculation]);
};

export const loadSalaryCalculationByEstimateId = async (estimateId: string): Promise<SalaryCalculation | undefined> => {
  // Try to find in local cache first for fast path
  const userId = await getAuthenticatedUserId();
  const cacheUserId = getCacheUserId(userId);
  const cached = applyPendingChanges(
    await getCachedRecords<SalaryCalculation>('salary_calculations', cacheUserId),
    await offlineQueue.getForTable(cacheUserId, 'salary_calculations'),
  );
  const fromCache = cached.find(calc => calc.estimateId === estimateId);
  if (fromCache) return fromCache;

  // Fallback: load all and filter (server-side filter would require payload JSON query)
  const calculations = await readTableCached<SalaryCalculation>('salary_calculations', fetchSalaryCalculations);
  return calculations.find(calc => calc.estimateId === estimateId);
};

export const loadAllSalaryCalculations = async (): Promise<SalaryCalculation[]> => {
  return readTableCached<SalaryCalculation>('salary_calculations', fetchSalaryCalculations);
};

export const deleteSalaryCalculation = async (calculationId: string): Promise<void> => {
  await deleteRecord('salary_calculations', calculationId);
};

export const SCHEMA_VERSION = 2;

export const exportData = async (): Promise<string> => {
  const [estimates, templates, materials, works, bundles, salaryCalculations] = await Promise.all([
    loadEstimates(),
    loadTemplates(),
    loadMaterials(),
    loadWorks(),
    loadBundles(),
    loadAllSalaryCalculations(),
  ]);

  const data = {
    schemaVersion: SCHEMA_VERSION,
    estimates,
    templates,
    materials,
    works,
    bundles,
    salaryCalculations,
    exportedAt: new Date().toISOString(),
  };

  return JSON.stringify(data, null, 2);
};

type ImportValidationResult = { ok: true; data: Record<string, unknown> } | { ok: false; error: string };

export const validateImportData = (jsonData: string): ImportValidationResult => {
  if (jsonData.length > 50 * 1024 * 1024) {
    return { ok: false, error: 'Файл слишком большой (максимум 50 МБ).' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonData);
  } catch {
    return { ok: false, error: 'Файл не является валидным JSON.' };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'Неверный формат файла: ожидается объект.' };
  }

  const obj = parsed as Record<string, unknown>;

  const version = obj.schemaVersion;
  if (typeof version === 'number' && version > SCHEMA_VERSION) {
    return { ok: false, error: `Файл создан в более новой версии (${version}). Обновите приложение.` };
  }

  const requiredArrays = ['estimates', 'templates', 'materials', 'works', 'bundles'];
  for (const key of requiredArrays) {
    if (obj[key] !== undefined && !Array.isArray(obj[key])) {
      return { ok: false, error: `Поле «${key}» должно быть массивом.` };
    }
  }

  return { ok: true, data: obj };
};

export interface ImportResult {
  estimates: { added: number; updated: number; unchanged: number; inFileDuplicates: number };
  templates: { added: number; updated: number; unchanged: number };
  materials: { added: number; updated: number; unchanged: number; inFileDuplicates: number };
  works: { added: number; updated: number; unchanged: number; inFileDuplicates: number };
  bundles: { added: number; updated: number; unchanged: number; inFileDuplicates: number };
  salaryCalculations: { added: number };
}

export const importData = async (jsonData: string): Promise<ImportResult> => {
  const validation = validateImportData(jsonData);
  if (validation.ok === false) {
    throw new Error(validation.error);
  }

  try {
    const data = validation.data;
    const randomSuffix = () => Math.random().toString(36).slice(2, 8);
    const generateId = (prefix: string): string => `${prefix}-${Date.now()}-${randomSuffix()}`;
    const baseSortOrder = Date.now();
    const makeSortOrder = (index: number): number => baseSortOrder + index;
    const asArray = <T>(value: unknown): T[] => Array.isArray(value) ? (value as T[]) : [];

    const dedupById = <T extends { id: string }>(items: T[]): { result: T[]; removedCount: number } => {
      const seen = new Map<string, T>();
      let removedCount = 0;
      for (const item of items) {
        if (!seen.has(item.id)) {
          seen.set(item.id, item);
        } else {
          removedCount++;
        }
      }
      return { result: Array.from(seen.values()), removedCount };
    };

    const hasMaterialChanged = (existing: Material, incoming: Material): boolean => {
      return existing.price !== incoming.price ||
        (existing.link ?? '') !== (incoming.link ?? '') ||
        existing.category !== incoming.category;
    };

    const hasWorkChanged = (existing: Work, incoming: Work): boolean => {
      return existing.price !== incoming.price ||
        existing.category !== incoming.category;
    };

    const hasTemplateChanged = (existing: ProjectTemplate, incoming: ProjectTemplate): boolean => {
      if (existing.baseArea !== incoming.baseArea) return true;
      if ((existing.items?.length ?? 0) !== (incoming.items?.length ?? 0)) return true;
      if (JSON.stringify(existing.items) !== JSON.stringify(incoming.items)) return true;
      return false;
    };

    const hasBundleChanged = (existing: WorkBundle, incoming: WorkBundle): boolean => {
      if (existing.category !== incoming.category) return true;
      if ((existing.items?.length ?? 0) !== (incoming.items?.length ?? 0)) return true;
      if (JSON.stringify(existing.items) !== JSON.stringify(incoming.items)) return true;
      return false;
    };

    const hasEstimateChanged = (existing: Estimate, incoming: Estimate): boolean => {
      if (existing.client !== incoming.client) return true;
      if (existing.date !== incoming.date) return true;
      if (existing.status !== incoming.status) return true;
      if (existing.area !== incoming.area) return true;
      if (existing.buildingType !== incoming.buildingType) return true;
      if ((existing.items?.length ?? 0) !== (incoming.items?.length ?? 0)) return true;
      if (JSON.stringify(existing.items) !== JSON.stringify(incoming.items)) return true;
      return false;
    };

    const rawEstimates = asArray<Estimate>(data.estimates);
    const rawTemplates = asArray<ProjectTemplate>(data.templates);
    const rawMaterials = asArray<Material>(data.materials);
    const rawWorks = asArray<Work>(data.works);

    const existingMaterials = await loadMaterials();
    const existingWorks = await loadWorks();
    const existingEstimates = await loadEstimates();
    const existingTemplates = await loadTemplates();
    const existingBundles = await loadBundles();

    const existingMaterialByName = new Map<string, Material>();
    for (const m of existingMaterials) {
      existingMaterialByName.set(normalizeKey(m.name), m);
    }
    const existingWorkByName = new Map<string, Work>();
    for (const w of existingWorks) {
      existingWorkByName.set(normalizeKey(w.name), w);
    }

    const existingEstimateByNumberVersion = new Map<string, Estimate>();
    for (const e of existingEstimates) {
      const key = `${e.estimateNumber}::v${e.version ?? 0}`;
      existingEstimateByNumberVersion.set(key, e);
    }

    const existingTemplateByName = new Map<string, ProjectTemplate>();
    for (const t of existingTemplates) {
      existingTemplateByName.set(normalizeKey(t.name), t);
    }

    const existingBundleByName = new Map<string, WorkBundle>();
    for (const b of existingBundles) {
      existingBundleByName.set(normalizeKey(b.name), b);
    }
    const rawBundles = asArray<WorkBundle>(data.bundles);
    const rawSalaryCalculations = asArray<SalaryCalculation>(data.salaryCalculations);

    let estimatesAdded = 0, estimatesUpdated = 0, estimatesUnchanged = 0;
    const estimateIdMap = new Map<string, string>();
    rawEstimates.forEach(e => {
      const key = `${e.estimateNumber}::v${e.version ?? 0}`;
      const existing = existingEstimateByNumberVersion.get(key);
      if (existing) {
        estimateIdMap.set(e.id, existing.id);
        if (hasEstimateChanged(existing, e)) {
          estimatesUpdated++;
        } else {
          estimatesUnchanged++;
        }
      } else {
        estimateIdMap.set(e.id, generateId('sm-id'));
        estimatesAdded++;
      }
    });

    let templatesAdded = 0, templatesUpdated = 0, templatesUnchanged = 0;
    const templates = rawTemplates.map((t, index) => {
      const existing = existingTemplateByName.get(normalizeKey(t.name));
      if (existing) {
        if (hasTemplateChanged(existing, t)) {
          templatesUpdated++;
        } else {
          templatesUnchanged++;
        }
        return {
          ...existing,
          items: Array.isArray(t.items) ? t.items : existing.items,
          baseArea: t.baseArea ?? existing.baseArea,
        };
      }
      templatesAdded++;
      return {
        ...t,
        id: generateId('template'),
        items: Array.isArray(t.items) ? t.items : [],
        sortOrder: typeof t.sortOrder === 'number' ? t.sortOrder : makeSortOrder(index),
      };
    });

    const estimates = rawEstimates.map((e, index) => {
      const mappedId = estimateIdMap.get(e.id) as string;
      return {
        ...e,
        id: mappedId,
        parentId: e.parentId ? estimateIdMap.get(e.parentId) : undefined,
        items: Array.isArray(e.items) ? e.items : [],
        sortOrder: typeof e.sortOrder === 'number' ? e.sortOrder : makeSortOrder(index),
      };
    });

    let materialsAdded = 0, materialsUpdated = 0, materialsUnchanged = 0;
    const materials = rawMaterials.map((m, index) => {
      const existing = existingMaterialByName.get(normalizeKey(m.name));
      if (existing) {
        if (hasMaterialChanged(existing, m)) {
          materialsUpdated++;
        } else {
          materialsUnchanged++;
        }
        return {
          ...existing,
          price: m.price ?? existing.price,
          link: m.link ?? existing.link,
          category: m.category ?? existing.category,
          lastUpdated: m.lastUpdated ?? existing.lastUpdated,
        };
      }
      materialsAdded++;
      return {
        ...m,
        id: generateId('material'),
        sortOrder: typeof m.sortOrder === 'number' ? m.sortOrder : makeSortOrder(index),
      };
    });

    const dedupMaterialsResult = dedupById(materials);
    const dedupMaterials = dedupMaterialsResult.result;

    let worksAdded = 0, worksUpdated = 0, worksUnchanged = 0;
    const works = rawWorks.map((w, index) => {
      const existing = existingWorkByName.get(normalizeKey(w.name));
      if (existing) {
        if (hasWorkChanged(existing, w)) {
          worksUpdated++;
        } else {
          worksUnchanged++;
        }
        return {
          ...existing,
          price: w.price ?? existing.price,
          category: w.category ?? existing.category,
        };
      }
      worksAdded++;
      return {
        ...w,
        id: generateId('work'),
        sortOrder: typeof w.sortOrder === 'number' ? w.sortOrder : makeSortOrder(index),
      };
    });

    const dedupWorksResult = dedupById(works);
    const dedupWorks = dedupWorksResult.result;

    let bundlesAdded = 0, bundlesUpdated = 0, bundlesUnchanged = 0;
    const bundles = rawBundles.map((b, index) => {
      const existing = existingBundleByName.get(normalizeKey(b.name));
      if (existing) {
        if (hasBundleChanged(existing, b)) {
          bundlesUpdated++;
        } else {
          bundlesUnchanged++;
        }
        return {
          ...existing,
          items: Array.isArray(b.items) ? b.items : existing.items,
          category: b.category ?? existing.category,
        };
      }
      bundlesAdded++;
      return {
        ...b,
        id: generateId('bundle'),
        items: Array.isArray(b.items) ? b.items : [],
        sortOrder: typeof b.sortOrder === 'number' ? b.sortOrder : makeSortOrder(index),
      };
    });

    const dedupBundlesResult = dedupById(bundles);
    const dedupBundles = dedupBundlesResult.result;

    let salaryAdded = 0;
    const salaryCalculations = rawSalaryCalculations.map(s => {
      const newEstimateId = estimateIdMap.get(s.estimateId);
      const estimateId = newEstimateId ?? s.estimateId;
      salaryAdded++;
      return {
        ...s,
        estimateId,
        id: newEstimateId ? `salary-${estimateId}` : generateId('salary'),
      };
    });

    const importTable = async <T extends { id: string }>(
      tableName: CacheTableKey,
      records: T[],
    ) => {
      if (!records.length) return;
      await saveLocalRecords(tableName, records);
    };

    await Promise.all([
      importTable('estimates', estimates),
      importTable('templates', templates),
      importTable('materials', dedupMaterials),
      importTable('works', dedupWorks),
      importTable('bundles', dedupBundles),
      importTable('salary_calculations', salaryCalculations),
    ]);

    const importResult: ImportResult = {
      estimates: { added: estimatesAdded, updated: estimatesUpdated, unchanged: estimatesUnchanged, inFileDuplicates: rawEstimates.length - estimatesAdded - estimatesUpdated - estimatesUnchanged },
      templates: { added: templatesAdded, updated: templatesUpdated, unchanged: templatesUnchanged },
      materials: { added: materialsAdded, updated: materialsUpdated, unchanged: materialsUnchanged, inFileDuplicates: dedupMaterialsResult.removedCount },
      works: { added: worksAdded, updated: worksUpdated, unchanged: worksUnchanged, inFileDuplicates: dedupWorksResult.removedCount },
      bundles: { added: bundlesAdded, updated: bundlesUpdated, unchanged: bundlesUnchanged, inFileDuplicates: dedupBundlesResult.removedCount },
      salaryCalculations: { added: salaryAdded },
    };

    window.dispatchEvent(new CustomEvent('kmobn:data-imported'));

    console.log('Data imported successfully', importResult);
    return importResult;
  } catch (error) {
    console.error('Failed to import data:', error);
    if (error instanceof Error) {
      throw new Error(`Ошибка при импорте: ${error.message}`);
    }
    throw new Error('Ошибка при импорте данных. Проверьте формат файла.');
  }
};

export const exportUserData = async (): Promise<Blob> => {
  const data = await exportData();
  return new Blob([data], { type: 'application/json' });
};
