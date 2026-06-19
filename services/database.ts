import { Estimate, ProjectTemplate, Material, Work, WorkBundle, SalaryCalculation } from '../types';
import { CacheTableKey, getCachedRecords, getCacheUserId, syncCachedRecords } from './indexedDbCache';
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

const getAuthenticatedUserId = async (): Promise<string | null> => {
  if (!isSupabaseConfigured()) {
    return null;
  }
  const client = ensureSupabase();
  const { data, error } = await client.auth.getSession();
  if (error) {
    console.error('Supabase getSession error:', error);
    return null;
  }
  return data.session?.user.id ?? null;
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
    console.error('Supabase fetch error:', error);
    return limitedCached;
  }
  const records = normalizeStableOrder((data ?? []) as T[]);
  await syncCachedRecords(key, cacheUserId, records);
  return typeof options?.limit === 'number' ? records.slice(0, options.limit) : records;
};

const deleteRecord = async (table: string, id: string) => {
  if (!isSupabaseConfigured()) {
    return;
  }
  const client = ensureSupabase();
  const userId = await requireUserId();
  const { error } = await client.from(table).delete().eq('id', id).eq('user_id', userId);
  if (error) {
    console.error(`Failed to delete from ${table}:`, error);
    throw error;
  }
};

const upsertRecords = async (upserter: (records: any[], userId: string) => Promise<{ data?: any; error: any }>, records: any[]) => {
  if (!records.length || !isSupabaseConfigured()) {
    return;
  }
  const userId = await requireUserId();
  const { error } = await upserter(records, userId);
  if (error) {
    console.error('Supabase upsert error:', error);
    throw error;
  }
};

export const pickChangedRecordsByIds = <T extends { id: string }>(records: T[], changedIds: string[]): T[] => {
  if (!records.length || !changedIds.length) return [];
  const changedSet = new Set(changedIds);
  return records.filter(record => changedSet.has(record.id));
};

export const saveEstimates = async (estimates: Estimate[]): Promise<void> => {
  const cacheUserId = getCacheUserId(await getAuthenticatedUserId());
  const syncResult = await syncCachedRecords('estimates', cacheUserId, estimates);
  const changedEstimates = syncResult.cacheAvailable
    ? pickChangedRecordsByIds(estimates, syncResult.changedIds)
    : estimates;
  await upsertRecords(upsertEstimates, changedEstimates);
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
  const cacheUserId = getCacheUserId(await getAuthenticatedUserId());
  await Promise.all([
    upsertRecords(upsertMaterials, materials),
    syncCachedRecords('materials', cacheUserId, materials),
  ]);
};

export const loadMaterials = async (options?: LoadTableOptions): Promise<Material[]> => readTableCached<Material>('materials', fetchMaterials, options);

export const addMaterial = async (material: Material): Promise<void> => {
  await upsertRecords(upsertMaterials, [material]);
};

export const updateMaterial = async (material: Material): Promise<void> => {
  await upsertRecords(upsertMaterials, [material]);
};

export const deleteMaterial = async (materialId: string): Promise<void> => {
  await deleteRecord('materials', materialId);
};

export const saveWorks = async (works: Work[]): Promise<void> => {
  const cacheUserId = getCacheUserId(await getAuthenticatedUserId());
  await Promise.all([
    upsertRecords(upsertWorks, works),
    syncCachedRecords('works', cacheUserId, works),
  ]);
};

export const loadWorks = async (options?: LoadTableOptions): Promise<Work[]> => readTableCached<Work>('works', fetchWorks, options);

export const addWork = async (work: Work): Promise<void> => {
  await upsertRecords(upsertWorks, [work]);
};

export const updateWork = async (work: Work): Promise<void> => {
  await upsertRecords(upsertWorks, [work]);
};

export const deleteWork = async (workId: string): Promise<void> => {
  await deleteRecord('works', workId);
};

export const saveBundles = async (bundles: WorkBundle[]): Promise<void> => {
  const cacheUserId = getCacheUserId(await getAuthenticatedUserId());
  await Promise.all([
    upsertRecords(upsertBundles, bundles),
    syncCachedRecords('bundles', cacheUserId, bundles),
  ]);
};

export const loadBundles = async (options?: LoadTableOptions): Promise<WorkBundle[]> => {
  const raw = await readTableCached<WorkBundle>('bundles', fetchBundles, options);
  return raw.map(b => ({
    ...b,
    items: Array.isArray(b.items) ? b.items : [],
  }));
};

export const addBundle = async (bundle: WorkBundle): Promise<void> => {
  await upsertRecords(upsertBundles, [bundle]);
};

export const updateBundle = async (bundle: WorkBundle): Promise<void> => {
  await upsertRecords(upsertBundles, [bundle]);
};

export const deleteBundle = async (bundleId: string): Promise<void> => {
  await deleteRecord('bundles', bundleId);
};

export const saveSalaryCalculation = async (calculation: SalaryCalculation): Promise<void> => {
  const cacheUserId = getCacheUserId(await getAuthenticatedUserId());
  await Promise.all([
    upsertRecords(upsertSalaryCalculations, [calculation]),
    syncCachedRecords('salary_calculations', cacheUserId, [calculation]),
  ]);
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

export const importData = async (jsonData: string): Promise<void> => {
  if (!isSupabaseConfigured()) {
    console.warn('Supabase not configured, skipping import');
    return;
  }
  try {
    const data = JSON.parse(jsonData);
    const randomSuffix = () => Math.random().toString(36).slice(2, 8);
    const generateId = (prefix: string): string => `${prefix}-${Date.now()}-${randomSuffix()}`;
    const baseSortOrder = Date.now();
    const makeSortOrder = (index: number): number => baseSortOrder + index;
    const asArray = <T>(value: unknown): T[] => Array.isArray(value) ? (value as T[]) : [];

    const rawEstimates = asArray<Estimate>(data.estimates);
    const rawTemplates = asArray<ProjectTemplate>(data.templates);
    const rawMaterials = asArray<Material>(data.materials);
    const rawWorks = asArray<Work>(data.works);
    const rawBundles = asArray<WorkBundle>(data.bundles);
    const rawSalaryCalculations = asArray<SalaryCalculation>(data.salaryCalculations);

    const estimateIdMap = new Map<string, string>();
    rawEstimates.forEach(e => {
      estimateIdMap.set(e.id, generateId('sm-id'));
    });
    const estimates = rawEstimates.map((e, index) => ({
      ...e,
      id: estimateIdMap.get(e.id) as string,
      parentId: e.parentId ? estimateIdMap.get(e.parentId) : undefined,
      items: Array.isArray(e.items) ? e.items : [],
      sortOrder: typeof e.sortOrder === 'number' ? e.sortOrder : makeSortOrder(index),
    }));

    const templates = rawTemplates.map((t, index) => ({
      ...t,
      id: generateId('template'),
      items: Array.isArray(t.items) ? t.items : [],
      sortOrder: typeof t.sortOrder === 'number' ? t.sortOrder : makeSortOrder(index),
    }));

    const materials = rawMaterials.map((m, index) => ({
      ...m,
      id: generateId('material'),
      sortOrder: typeof m.sortOrder === 'number' ? m.sortOrder : makeSortOrder(index),
    }));

    const works = rawWorks.map((w, index) => ({
      ...w,
      id: generateId('work'),
      sortOrder: typeof w.sortOrder === 'number' ? w.sortOrder : makeSortOrder(index),
    }));

    const bundles = rawBundles.map((b, index) => ({
      ...b,
      id: generateId('bundle'),
      items: Array.isArray(b.items) ? b.items : [],
      sortOrder: typeof b.sortOrder === 'number' ? b.sortOrder : makeSortOrder(index),
    }));

    const salaryCalculations = rawSalaryCalculations.map(s => {
      const newEstimateId = estimateIdMap.get(s.estimateId);
      const estimateId = newEstimateId ?? s.estimateId;
      return {
        ...s,
        estimateId,
        id: newEstimateId ? `salary-${estimateId}` : generateId('salary'),
      };
    });
    await Promise.all([
      estimates.length ? upsertRecords(upsertEstimates, estimates) : Promise.resolve(),
      templates.length ? upsertRecords(upsertTemplates, templates) : Promise.resolve(),
      materials.length ? upsertRecords(upsertMaterials, materials) : Promise.resolve(),
      works.length ? upsertRecords(upsertWorks, works) : Promise.resolve(),
      bundles.length ? upsertRecords(upsertBundles, bundles) : Promise.resolve(),
      salaryCalculations.length ? upsertRecords(upsertSalaryCalculations, salaryCalculations) : Promise.resolve(),
    ]);
    console.log('Data imported successfully');
  } catch (error) {
    console.error('Failed to import data:', error);
    throw new Error('Ошибка при импорте данных. Проверьте формат файла.');
  }
};