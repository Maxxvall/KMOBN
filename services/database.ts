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

const ensureSupabase = () => {
  if (!supabase) {
    throw new Error('Supabase is not configured');
  }
  return supabase;
};

const readTable = async <T>(fetcher: () => Promise<{ data: T[] | null; error: any }>): Promise<T[]> => {
  if (!isSupabaseConfigured()) {
    return [];
  }
  const { data, error } = await fetcher();
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
  const { error } = await client.from(table).delete().eq('id', id);
  if (error) {
    console.error(`Failed to delete from ${table}:`, error);
    throw error;
  }
};

const upsertRecords = async (upserter: (records: any[]) => Promise<{ data: any; error: any }>, records: any[]) => {
  if (!records.length || !isSupabaseConfigured()) {
    return;
  }
  const { error } = await upserter(records);
  if (error) {
    console.error('Supabase upsert error:', error);
    throw error;
  }
};

export const saveEstimates = async (estimates: Estimate[]): Promise<void> => {
  await upsertRecords(upsertEstimates, estimates);
};

export const loadEstimates = async (): Promise<Estimate[]> => readTable(fetchEstimates);

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
    await Promise.all([
      data.estimates ? upsertRecords(upsertEstimates, data.estimates) : Promise.resolve(),
      data.templates ? upsertRecords(upsertTemplates, data.templates) : Promise.resolve(),
      data.materials ? upsertRecords(upsertMaterials, data.materials) : Promise.resolve(),
      data.works ? upsertRecords(upsertWorks, data.works) : Promise.resolve(),
      data.bundles ? upsertRecords(upsertBundles, data.bundles) : Promise.resolve(),
      data.salaryCalculations ? upsertRecords(upsertSalaryCalculations, data.salaryCalculations) : Promise.resolve(),
    ]);
    console.log('Data imported successfully');
  } catch (error) {
    console.error('Failed to import data:', error);
    throw new Error('Ошибка при импорте данных. Проверьте формат файла.');
  }
};