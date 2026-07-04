import { Estimate, ProjectTemplate, Material, Work, WorkBundle, SalaryCalculation, normalizeKey } from '../types';
import { CacheTableKey, getCachedRecords, getCacheUserId, syncCachedRecords } from './indexedDbCache';
import { offlineQueue } from './offlineQueue';
import supabase, {
  isSupabaseConfigured,
  upsertEstimates,
  upsertTemplates,
  upsertMaterials,
  upsertWorks,
  upsertBundles,
  upsertSalaryCalculations,
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
          const session = parsed?.current_session || parsed?.session;
          if (session?.user?.id) return session.user.id;
        }
      }
    }
  } catch {}
  return null;
};

const getAuthenticatedUserId = async (): Promise<string | null> => {
  if (!isSupabaseConfigured()) {
    return findCachedUserId();
  }
  const client = ensureSupabase();
  const { data, error } = await client.auth.getSession();
  if (error) {
    console.error('Supabase getSession error:', error);
    return findCachedUserId();
  }
  return data.session?.user.id ?? findCachedUserId();
};

const requireUserId = async (): Promise<string> => {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    throw new Error('User is not authenticated');
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

const isRefreshThrottled = (key: CacheTableKey, userId: string): boolean => {
  const compositeKey = `${key}:${userId}`;
  const lastTs = lastRefreshTimestamps.get(compositeKey) ?? 0;
  return Date.now() - lastTs < REFRESH_COOLDOWN_MS;
};

const markRefreshed = (key: CacheTableKey, userId: string): void => {
  const compositeKey = `${key}:${userId}`;
  lastRefreshTimestamps.set(compositeKey, Date.now());
};

const refreshCacheInBackground = async <T extends { id: string }>(
  key: CacheTableKey,
  userId: string,
  fetcher: (uid: string, options?: LoadTableOptions) => Promise<{ data: unknown[] | null; error: unknown }>,
  options?: LoadTableOptions,
): Promise<void> => {
  if (isRefreshThrottled(key, userId)) return;
  markRefreshed(key, userId);
  try {
    const { data, error } = await fetcher(userId, options);
    if (error) {
      console.error('Supabase fetch error:', error);
      return;
    }
    const records = normalizeStableOrder((data ?? []) as T[]);
    const cacheUserId = getCacheUserId(userId);
    const result = await syncCachedRecords(key, cacheUserId, records);
    if (result.changed) {
      dispatchCacheUpdate(key, records);
    }
  } catch (error) {
    console.error('Cache refresh error:', error);
  }
};

const readTableCached = async <T extends { id: string }>(
  key: CacheTableKey,
  fetcher: (userId: string, options?: LoadTableOptions) => Promise<{ data: unknown[] | null; error: unknown }>,
  options?: LoadTableOptions,
): Promise<T[]> => {
  const userId = await getAuthenticatedUserId();
  const cacheUserId = getCacheUserId(userId);
  const cached = normalizeStableOrder(await getCachedRecords<T>(key, cacheUserId));
  const canFetch = isSupabaseConfigured() && !!userId;
  const limitedCached = typeof options?.limit === 'number' ? cached.slice(0, options.limit) : cached;

  if (cached.length > 0) {
    if (canFetch) {
      void refreshCacheInBackground<T>(key, userId as string, fetcher, options);
    }
    return limitedCached;
  }

  if (!canFetch) {
    return limitedCached;
  }

  const { data, error } = await fetcher(userId as string, options);
  if (error) {
    console.error(`[DB:${key}] Supabase fetch error:`, error);
    return limitedCached;
  }
  const records = normalizeStableOrder((data ?? []) as T[]);
  await syncCachedRecords(key, cacheUserId, records);
  return typeof options?.limit === 'number' ? records.slice(0, options.limit) : records;
};

const deleteRecord = async (table: string, id: string) => {
  // Remove from IndexedDB cache
  const userId = await getAuthenticatedUserId();
  const cacheUserId = getCacheUserId(userId);
  const cacheTable = table as CacheTableKey;
  try {
    const cached = await getCachedRecords<any>(cacheTable, cacheUserId);
    const remaining = cached.filter(r => r.id !== id);
    await syncCachedRecords(cacheTable, cacheUserId, remaining);
  } catch { /* ignore cache errors */ }

  if (navigator.onLine && isSupabaseConfigured()) {
    try {
      const client = ensureSupabase();
      const uid = await requireUserId();
      const { error } = await client.from(table).delete().eq('id', id).eq('user_id', uid);
      if (error) {
        console.error(`Failed to delete from ${table}:`, error);
        throw error;
      }
    } catch {
      await offlineQueue.add({ table, operation: 'delete', data: [id] });
    }
  } else {
    await offlineQueue.add({ table, operation: 'delete', data: [id] });
  }
};

const deleteRecords = async (table: string, ids: string[]) => {
  if (!ids.length) return;

  // Always remove from IndexedDB cache
  const userId = await getAuthenticatedUserId();
  const cacheUserId = getCacheUserId(userId);
  const cacheTable = table as CacheTableKey;
  try {
    const cached = await getCachedRecords<any>(cacheTable, cacheUserId);
    const remaining = cached.filter(r => !ids.includes(r.id));
    await syncCachedRecords(cacheTable, cacheUserId, remaining);
  } catch { /* ignore cache errors */ }

  if (navigator.onLine && isSupabaseConfigured()) {
    try {
      const client = ensureSupabase();
      const uid = await requireUserId();
      const { error } = await client.from(table).delete().in('id', ids).eq('user_id', uid);
      if (error) {
        console.error(`Failed to batch delete from ${table}:`, error);
        throw error;
      }
    } catch {
      await offlineQueue.add({ table, operation: 'delete', data: ids });
    }
  } else {
    await offlineQueue.add({ table, operation: 'delete', data: ids });
  }
};

const upsertRecords = async (upserter: (records: any[], userId: string) => Promise<{ data?: any; error: any }>, records: any[]) => {
  if (!records.length || !isSupabaseConfigured()) {
    return;
  }
  const userId = await requireUserId();
  const { error } = await upserter(records, userId);
  if (error) {
    const msg = error?.message || error?.details || error?.hint || JSON.stringify(error);
    console.error('Supabase upsert error:', msg, error);
    throw new Error(msg);
  }
};

export const pickChangedRecordsByIds = <T extends { id: string }>(records: T[], changedIds: string[]): T[] => {
  if (!records.length || !changedIds.length) return [];
  const changedSet = new Set(changedIds);
  return records.filter(record => changedSet.has(record.id));
};

export const saveEstimates = async (estimates: Estimate[]): Promise<void> => {
  const userId = await getAuthenticatedUserId();
  const cacheUserId = getCacheUserId(userId);

  if (navigator.onLine && isSupabaseConfigured() && userId) {
    try {
      const syncResult = await syncCachedRecords('estimates', cacheUserId, estimates);
      const changedEstimates = syncResult.cacheAvailable
        ? pickChangedRecordsByIds(estimates, syncResult.changedIds)
        : estimates;
      await upsertRecords(upsertEstimates, changedEstimates);
    } catch {
      await syncCachedRecords('estimates', cacheUserId, estimates);
      await offlineQueue.add({ table: 'estimates', operation: 'upsert', data: estimates });
    }
  } else {
    await syncCachedRecords('estimates', cacheUserId, estimates);
    await offlineQueue.add({ table: 'estimates', operation: 'upsert', data: estimates });
  }
};

export const loadEstimates = async (options?: LoadTableOptions): Promise<Estimate[]> => readTableCached<Estimate>('estimates', fetchEstimates, options);

export const deleteEstimatesByNumber = async (estimateNumber: string | number): Promise<void> => {
  if (!isSupabaseConfigured()) return;
  const client = ensureSupabase();
  try {
    const userId = await requireUserId();
    const key = String(estimateNumber);
    const { error: primaryError } = await client.from('estimates').delete().eq('user_id', userId).eq('estimateNumber', key);
    if (!primaryError) return;

    const { error: legacyError } = await client.from('estimates').delete().eq('user_id', userId).eq("payload->>estimateNumber", key);
    if (legacyError) {
      console.error('Failed to delete estimates by estimateNumber:', legacyError);
      throw legacyError;
    }
  } catch (err) {
    console.error('deleteEstimatesByNumber error:', err);
    throw err;
  }
};

export const deleteEstimateById = async (estimateId: string): Promise<void> => {
  await deleteRecord('estimates', estimateId);
};

export const deleteEstimates = async (estimateIds: string[]): Promise<void> => {
  await deleteRecords('estimates', estimateIds);
};

export const saveTemplates = async (templates: ProjectTemplate[]): Promise<void> => {
  const cacheUserId = getCacheUserId(await getAuthenticatedUserId());
  await Promise.all([
    upsertRecords(upsertTemplates, templates),
    syncCachedRecords('templates', cacheUserId, templates),
  ]);
};

export const loadTemplates = async (options?: LoadTableOptions): Promise<ProjectTemplate[]> => readTableCached<ProjectTemplate>('templates', fetchTemplates, options);

export const addTemplate = async (template: ProjectTemplate): Promise<void> => {
  await upsertRecords(upsertTemplates, [template]);
};

export const deleteTemplate = async (templateId: string): Promise<void> => {
  await deleteRecord('templates', templateId);
};

export const saveMaterials = async (materials: Material[]): Promise<void> => {
  const userId = await getAuthenticatedUserId();
  const cacheUserId = getCacheUserId(userId);
  await syncCachedRecords('materials', cacheUserId, materials);

  if (navigator.onLine && isSupabaseConfigured() && userId) {
    try {
      await upsertRecords(upsertMaterials, materials);
    } catch {
      await offlineQueue.add({ table: 'materials', operation: 'upsert', data: materials });
    }
  } else if (!navigator.onLine) {
    await offlineQueue.add({ table: 'materials', operation: 'upsert', data: materials });
  }
};

export const loadMaterials = async (options?: LoadTableOptions): Promise<Material[]> => readTableCached<Material>('materials', fetchMaterials, options);

async function addOrUpdateRecord<T extends { id: string }>(
  table: CacheTableKey,
  upserter: (records: any[], userId: string) => Promise<{ data?: any; error: any }>,
  record: T,
  mode: 'add' | 'update',
): Promise<void> {
  const userId = await getAuthenticatedUserId();
  const cacheUserId = getCacheUserId(userId);
  const cached = await getCachedRecords<T>(table, cacheUserId);
  const updated = mode === 'add'
    ? [...cached, record]
    : cached.map(c => c.id === record.id ? record : c);
  await syncCachedRecords(table, cacheUserId, updated);

  if (navigator.onLine && isSupabaseConfigured() && userId) {
    try {
      await upsertRecords(upserter, [record]);
    } catch {
      await offlineQueue.add({ table, operation: 'upsert', data: [record] });
    }
  } else {
    await offlineQueue.add({ table, operation: 'upsert', data: [record] });
  }
}

export const addMaterial = (material: Material) => addOrUpdateRecord('materials', upsertMaterials, material, 'add');
export const updateMaterial = (material: Material) => addOrUpdateRecord('materials', upsertMaterials, material, 'update');

export const deleteMaterial = async (materialId: string): Promise<void> => {
  await deleteRecord('materials', materialId);
};

export const deleteMaterials = async (materialIds: string[]): Promise<void> => {
  await deleteRecords('materials', materialIds);
};

export const saveWorks = async (works: Work[]): Promise<void> => {
  const userId = await getAuthenticatedUserId();
  const cacheUserId = getCacheUserId(userId);
  await syncCachedRecords('works', cacheUserId, works);

  if (navigator.onLine && isSupabaseConfigured() && userId) {
    try {
      await upsertRecords(upsertWorks, works);
    } catch {
      await offlineQueue.add({ table: 'works', operation: 'upsert', data: works });
    }
  } else if (!navigator.onLine) {
    await offlineQueue.add({ table: 'works', operation: 'upsert', data: works });
  }
};

export const loadWorks = async (options?: LoadTableOptions): Promise<Work[]> => readTableCached<Work>('works', fetchWorks, options);

export const addWork = (work: Work) => addOrUpdateRecord('works', upsertWorks, work, 'add');
export const updateWork = (work: Work) => addOrUpdateRecord('works', upsertWorks, work, 'update');

export const deleteWork = async (workId: string): Promise<void> => {
  await deleteRecord('works', workId);
};

export const deleteWorks = async (workIds: string[]): Promise<void> => {
  await deleteRecords('works', workIds);
};

export const saveBundles = async (bundles: WorkBundle[]): Promise<void> => {
  const userId = await getAuthenticatedUserId();
  const cacheUserId = getCacheUserId(userId);
  await syncCachedRecords('bundles', cacheUserId, bundles);

  if (navigator.onLine && isSupabaseConfigured() && userId) {
    try {
      await upsertRecords(upsertBundles, bundles);
    } catch {
      await offlineQueue.add({ table: 'bundles', operation: 'upsert', data: bundles });
    }
  } else if (!navigator.onLine) {
    await offlineQueue.add({ table: 'bundles', operation: 'upsert', data: bundles });
  }
};

export const loadBundles = async (options?: LoadTableOptions): Promise<WorkBundle[]> => {
  const raw = await readTableCached<WorkBundle>('bundles', fetchBundles, options);
  return raw.map(b => ({
    ...b,
    items: Array.isArray(b.items) ? b.items : [],
  }));
};

export const addBundle = (bundle: WorkBundle) => addOrUpdateRecord('bundles', upsertBundles, bundle, 'add');
export const updateBundle = (bundle: WorkBundle) => addOrUpdateRecord('bundles', upsertBundles, bundle, 'update');

export const deleteBundle = async (bundleId: string): Promise<void> => {
  await deleteRecord('bundles', bundleId);
};

export const deleteBundles = async (bundleIds: string[]): Promise<void> => {
  await deleteRecords('bundles', bundleIds);
};

export const saveSalaryCalculation = async (calculation: SalaryCalculation): Promise<void> => {
  const userId = await getAuthenticatedUserId();
  const cacheUserId = getCacheUserId(userId);
  await syncCachedRecords('salary_calculations', cacheUserId, [calculation]);

  if (navigator.onLine && isSupabaseConfigured() && userId) {
    try {
      await upsertRecords(upsertSalaryCalculations, [calculation]);
    } catch {
      await offlineQueue.add({ table: 'salary_calculations', operation: 'upsert', data: [calculation] });
    }
  } else {
    await offlineQueue.add({ table: 'salary_calculations', operation: 'upsert', data: [calculation] });
  }
};

export const loadSalaryCalculationByEstimateId = async (estimateId: string): Promise<SalaryCalculation | undefined> => {
  // Try to find in local cache first for fast path
  const userId = await getAuthenticatedUserId();
  const cacheUserId = getCacheUserId(userId);
  const cached = await getCachedRecords<SalaryCalculation>('salary_calculations', cacheUserId);
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
  if (!validation.ok) {
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

    const cacheUserId = getCacheUserId(await getAuthenticatedUserId());

    const importTable = async <T extends { id: string }>(
      tableName: CacheTableKey,
      records: T[],
      upserter: (items: T[], uid: string) => Promise<{ data?: any; error: any }>,
    ) => {
      if (!records.length) return;
      await syncCachedRecords(tableName, cacheUserId, records);
      if (navigator.onLine && isSupabaseConfigured()) {
        try {
          await upsertRecords(upserter, records);
        } catch {
          await offlineQueue.add({ table: tableName, operation: 'upsert', data: records });
        }
      } else {
        await offlineQueue.add({ table: tableName, operation: 'upsert', data: records });
      }
    };

    await Promise.all([
      importTable('estimates', estimates, upsertEstimates),
      importTable('templates', templates, upsertTemplates),
      importTable('materials', dedupMaterials, upsertMaterials),
      importTable('works', dedupWorks, upsertWorks),
      importTable('bundles', dedupBundles, upsertBundles),
      importTable('salary_calculations', salaryCalculations, upsertSalaryCalculations),
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