import { Estimate, ProjectTemplate, Material, Work, WorkBundle, SalaryCalculation } from '../types';
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

export type DbUser = {
  id: string;
  username: string;
  created_at: string;
};

const ensureSupabase = () => {
  if (!supabase) {
    throw new Error('Supabase is not configured');
  }
  return supabase;
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

const readTable = async <T>(fetcher: (userId: string) => Promise<{ data: T[] | null; error: any }>): Promise<T[]> => {
  if (!isSupabaseConfigured()) {
    return [];
  }
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return [];
  }
  const { data, error } = await fetcher(userId);
  if (error) {
    console.error('Supabase fetch error:', error);
    return [];
  }
  return data ?? [];
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

export const saveEstimates = async (estimates: Estimate[]): Promise<void> => {
  await upsertRecords(upsertEstimates, estimates);
};

export const loadEstimates = async (): Promise<Estimate[]> => readTable(fetchEstimates);

export const deleteEstimatesByNumber = async (estimateNumber: string | number): Promise<void> => {
  if (!isSupabaseConfigured()) return;
  const client = ensureSupabase();
  try {
    const userId = await requireUserId();
    const key = String(estimateNumber);
    const { error } = await client.from('estimates').delete().eq('user_id', userId).eq("payload->>estimateNumber", key);
    if (error) {
      console.error('Failed to delete estimates by estimateNumber:', error);
      throw error;
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
  await upsertRecords(upsertTemplates, templates);
};

export const loadTemplates = async (): Promise<ProjectTemplate[]> => readTable(fetchTemplates);

export const addTemplate = async (template: ProjectTemplate): Promise<void> => {
  await upsertRecords(upsertTemplates, [template]);
};

export const deleteTemplate = async (templateId: string): Promise<void> => {
  await deleteRecord('templates', templateId);
};

export const saveMaterials = async (materials: Material[]): Promise<void> => {
  await upsertRecords(upsertMaterials, materials);
};

export const loadMaterials = async (): Promise<Material[]> => readTable(fetchMaterials);

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
  await upsertRecords(upsertWorks, works);
};

export const loadWorks = async (): Promise<Work[]> => readTable(fetchWorks);

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
  await upsertRecords(upsertBundles, bundles);
};

export const loadBundles = async (): Promise<WorkBundle[]> => readTable(fetchBundles);

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
  await upsertRecords(upsertSalaryCalculations, [calculation]);
};

export const loadSalaryCalculationByEstimateId = async (estimateId: string): Promise<SalaryCalculation | undefined> => {
  const calculations = await readTable(fetchSalaryCalculations);
  return calculations.find(calc => calc.estimateId === estimateId);
};

export const loadAllSalaryCalculations = async (): Promise<SalaryCalculation[]> => {
  return readTable(fetchSalaryCalculations);
};

export const deleteSalaryCalculation = async (calculationId: string): Promise<void> => {
  await deleteRecord('salary_calculations', calculationId);
};

export const checkUserCredentials = async (username: string, password: string): Promise<boolean> => {
  if (!isSupabaseConfigured()) {
    return false;
  }
  const client = ensureSupabase();
  const { data, error } = await client.rpc('check_user_credentials', {
    p_username: username,
    p_password: password,
  });
  if (error) {
    console.error('checkUserCredentials error:', error);
    return false;
  }
  return Boolean(data);
};

export const fetchUsers = async (): Promise<DbUser[]> => {
  if (!isSupabaseConfigured()) {
    return [];
  }
  const client = ensureSupabase();
  const { data, error } = await client.rpc('fetch_users');
  if (error) {
    console.error('fetchUsers error:', error);
    return [];
  }
  return (data ?? []) as DbUser[];
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
    const estimates = rawEstimates.map(e => ({
      ...e,
      id: estimateIdMap.get(e.id) as string,
      parentId: e.parentId ? estimateIdMap.get(e.parentId) : undefined,
      items: Array.isArray(e.items) ? e.items : [],
    }));

    const templates = rawTemplates.map(t => ({
      ...t,
      id: generateId('template'),
      items: Array.isArray(t.items) ? t.items : [],
    }));

    const materials = rawMaterials.map(m => ({
      ...m,
      id: generateId('material'),
    }));

    const works = rawWorks.map(w => ({
      ...w,
      id: generateId('work'),
    }));

    const bundles = rawBundles.map(b => ({
      ...b,
      id: generateId('bundle'),
      items: Array.isArray(b.items) ? b.items : [],
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