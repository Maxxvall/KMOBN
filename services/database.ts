import Dexie, { Table } from 'dexie';
import { Estimate, ProjectTemplate, Material, Work, WorkBundle, SalaryCalculation } from '../types';
import { isSupabaseConfigured, upsertEstimates, upsertTemplates, upsertMaterials, upsertWorks, upsertBundles } from './supabase';

export class EstimateDatabase extends Dexie {
  estimates!: Table<Estimate>;
  templates!: Table<ProjectTemplate>;
  materials!: Table<Material>;
  works!: Table<Work>;
  bundles!: Table<WorkBundle>;
  salaryCalculations!: Table<SalaryCalculation>;

  constructor() {
    super('EstimateDatabase');
    this.version(7).stores({
      estimates: 'id, estimateNumber, client, date, status, version, parentId, isArchived',
      templates: 'id, name',
      materials: 'id, name, category, isManualPrice',
      works: 'id, name, category',
      bundles: 'id, name, mainWorkId, category',
      salaryCalculations: 'id, estimateId, createdDate'
    });
  }
}

export const db = new EstimateDatabase();

// Функции для работы с базой данных
export const saveEstimates = async (estimates: Estimate[]): Promise<void> => {
  try {
    if (isSupabaseConfigured()) {
      await upsertEstimates(estimates);
    }
  } catch (err) {
    console.warn('Failed to save estimates to Supabase:', err);
  }

  await db.estimates.clear();
  await db.estimates.bulkAdd(estimates);
};

export const loadEstimates = async (): Promise<Estimate[]> => {
  try {
    const estimates = await db.estimates.toArray();
    return estimates.length > 0 ? estimates : []; 
  } catch (error) {
    console.error('Failed to load estimates from database:', error);
    return [];
  }
};

// Функции для шаблонов
export const saveTemplates = async (templates: ProjectTemplate[]): Promise<void> => {
  try {
    if (isSupabaseConfigured()) {
      await upsertTemplates(templates);
    }
  } catch (err) {
    console.warn('Failed to save templates to Supabase:', err);
  }

  await db.templates.clear();
  await db.templates.bulkAdd(templates);
};

export const loadTemplates = async (): Promise<ProjectTemplate[]> => {
  try {
    const templates = await db.templates.toArray();
    return templates.length > 0 ? templates : []; 
  } catch (error) {
    console.error('Failed to load templates from database:', error);
    return [];
  }
};

export const addTemplate = async (template: ProjectTemplate): Promise<void> => {
  await db.templates.add(template);
};

// Функции для материалов
export const saveMaterials = async (materials: Material[]): Promise<void> => {
  try {
    if (isSupabaseConfigured()) {
      await upsertMaterials(materials);
    }
  } catch (err) {
    console.warn('Failed to save materials to Supabase:', err);
  }

  await db.materials.clear();
  await db.materials.bulkAdd(materials);
};

export const loadMaterials = async (): Promise<Material[]> => {
  try {
    const materials = await db.materials.toArray();
    return materials.length > 0 ? materials : []; 
  } catch (error) {
    console.error('Failed to load materials from database:', error);
    return [];
  }
};

export const addMaterial = async (material: Material): Promise<void> => {
  await db.materials.add(material);
};

export const updateMaterial = async (material: Material): Promise<void> => {
  await db.materials.put(material);
};

// Функции для работ
export const saveWorks = async (works: Work[]): Promise<void> => {
  try {
    if (isSupabaseConfigured()) {
      await upsertWorks(works);
    }
  } catch (err) {
    console.warn('Failed to save works to Supabase:', err);
  }

  await db.works.clear();
  await db.works.bulkAdd(works);
};

export const loadWorks = async (): Promise<Work[]> => {
  try {
    const works = await db.works.toArray();
    return works.length > 0 ? works : []; 
  } catch (error) {
    console.error('Failed to load works from database:', error);
    return [];
  }
};

export const addWork = async (work: Work): Promise<void> => {
  await db.works.add(work);
};

export const updateWork = async (work: Work): Promise<void> => {
  await db.works.put(work);
};

export const deleteWork = async (workId: string): Promise<void> => {
  await db.works.delete(workId);
};

// Функции для комплектов работ
export const saveBundles = async (bundles: WorkBundle[]): Promise<void> => {
  try {
    if (isSupabaseConfigured()) {
      await upsertBundles(bundles);
    }
  } catch (err) {
    console.warn('Failed to save bundles to Supabase:', err);
  }

  await db.bundles.clear();
  await db.bundles.bulkAdd(bundles);
};

export const loadBundles = async (): Promise<WorkBundle[]> => {
  try {
    const bundles = await db.bundles.toArray();
    return bundles.length > 0 ? bundles : []; 
  } catch (error) {
    console.error('Failed to load bundles from database:', error);
    return [];
  }
};

export const addBundle = async (bundle: WorkBundle): Promise<void> => {
  await db.bundles.add(bundle);
};

export const updateBundle = async (bundle: WorkBundle): Promise<void> => {
  await db.bundles.put(bundle);
};

export const deleteBundle = async (bundleId: string): Promise<void> => {
  await db.bundles.delete(bundleId);
};

// Функции для расчетов зарплаты
export const saveSalaryCalculation = async (calculation: SalaryCalculation): Promise<void> => {
  await db.salaryCalculations.put(calculation);
};

export const loadSalaryCalculationByEstimateId = async (estimateId: string): Promise<SalaryCalculation | undefined> => {
  try {
    return await db.salaryCalculations.where('estimateId').equals(estimateId).first();
  } catch (error) {
    console.error('Failed to load salary calculation:', error);
    return undefined;
  }
};

export const loadAllSalaryCalculations = async (): Promise<SalaryCalculation[]> => {
  try {
    const calculations = await db.salaryCalculations.toArray();
    return calculations.length > 0 ? calculations : [];
  } catch (error) {
    console.error('Failed to load salary calculations:', error);
    return [];
  }
};

export const deleteSalaryCalculation = async (calculationId: string): Promise<void> => {
  await db.salaryCalculations.delete(calculationId);
};

// Функции для экспорта и импорта данных
export const exportData = async (): Promise<string> => {
  const estimates = await loadEstimates();
  const templates = await loadTemplates();
  const materials = await loadMaterials();
  const works = await loadWorks();
  const bundles = await loadBundles();

  const data = {
    estimates,
    templates,
    materials,
    works,
    bundles,
    exportedAt: new Date().toISOString(),
  };

  return JSON.stringify(data, null, 2);
};

export const importData = async (jsonData: string): Promise<void> => {
  try {
    const data = JSON.parse(jsonData);

    await Promise.all([
      addNewEstimates(data.estimates),
      addUniqueById(db.templates, data.templates),
      addUniqueById(db.materials, data.materials),
      addUniqueById(db.works, data.works),
      addUniqueById(db.bundles, data.bundles),
    ]);

    console.log('Data imported successfully');
  } catch (error) {
    console.error('Failed to import data:', error);
    throw new Error('Ошибка при импорте данных. Проверьте формат файла.');
  }
};

const normalizeClient = (client?: string): string => client?.trim().toLowerCase() ?? '';

const addNewEstimates = async (estimates?: Estimate[]): Promise<void> => {
  if (!estimates?.length) {
    return;
  }

  const existingClients = new Set((await db.estimates.toArray()).map((estimate) => normalizeClient(estimate.client)));
  const newItems = estimates.filter((estimate) => {
    const normalized = normalizeClient(estimate.client);
    return normalized ? !existingClients.has(normalized) : true;
  });

  if (!newItems.length) {
    return;
  }

  await db.estimates.bulkAdd(newItems);
};

const addUniqueById = async <T extends { id: string }>(table: Table<T>, records?: T[]): Promise<void> => {
  if (!records?.length) {
    return;
  }

  const existingIds = new Set((await table.toArray()).map((item) => item.id));
  const newItems = records.filter((record) => !existingIds.has(record.id));

  if (!newItems.length) {
    return;
  }

  await table.bulkAdd(newItems);
};