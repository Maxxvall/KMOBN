import {
    Estimate,
    EstimateStatus,
    Material,
    ProjectTemplate,
    Work,
    WorkBundle,
    EstimateSectionsDocument,
    normalizeKey,
} from '../types';
import { generateEstimateNumber } from './estimateNumber';
import { normalizeEstimateSectionsDocument } from './estimateSections';
import { toClientEstimate } from './clientEstimate';
import type { CacheTableKey } from './indexedDbCache';
import {
    getWorkspaceUserId,
    loadEstimates,
    loadTemplates,
    loadMaterials,
    loadWorks,
    loadBundles,
    loadEstimateSections,
    saveLocalRecords,
    saveEstimateSections,
} from './database';

// ─── Обмен сметами и данными: импорт/экспорт ────────────────────────────────
// Выделено из database.ts (этап 8): чистый домен переноса данных поверх
// локальных операций записи; поведение сохранено 1:1.

export const SCHEMA_VERSION = 3;

const ESTIMATE_TRANSFER_FORMAT = 'kmobn-estimate';
const ESTIMATE_TRANSFER_SCHEMA_VERSION = 2;
const MAX_ESTIMATE_TRANSFER_SIZE = 10 * 1024 * 1024;

type EstimateTransferPayload = {
  format: typeof ESTIMATE_TRANSFER_FORMAT;
  schemaVersion: typeof ESTIMATE_TRANSFER_SCHEMA_VERSION;
  exportedAt: string;
  estimate: Estimate;
};

export type ImportedSharedEstimate = {
  estimate: Estimate;
  numberChanged: boolean;
};

const isObject = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

export const createEstimateTransfer = (estimate: Estimate): string => {
  const [exportableEstimate] = prepareEstimatesForExport([toClientEstimate(estimate)]);
  const payload: EstimateTransferPayload = {
    format: ESTIMATE_TRANSFER_FORMAT,
    schemaVersion: ESTIMATE_TRANSFER_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    estimate: exportableEstimate,
  };
  return JSON.stringify(payload);
};

export const parseEstimateTransfer = (payloadText: string): Estimate => {
  if (payloadText.length > MAX_ESTIMATE_TRANSFER_SIZE) {
    throw new Error('Смета слишком большая для импорта (максимум 10 МБ).');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(payloadText);
  } catch {
    throw new Error('Не удалось прочитать данные сметы. Вставьте код, скопированный из приложения, или выберите файл.');
  }

  if (!isObject(parsed) || parsed.format !== ESTIMATE_TRANSFER_FORMAT) {
    throw new Error('Это не файл обмена одной сметой КМОВН.');
  }
  if (parsed.schemaVersion !== 1 && parsed.schemaVersion !== ESTIMATE_TRANSFER_SCHEMA_VERSION) {
    throw new Error('Формат этой сметы не поддерживается. Обновите приложение у отправителя и получателя.');
  }
  if (!isObject(parsed.estimate)) {
    throw new Error('В файле нет данных сметы.');
  }

  const estimate = parsed.estimate as unknown as Estimate;
  const requiredTextFields: Array<keyof Pick<Estimate, 'estimateNumber' | 'client' | 'date' | 'buildingType'>> = [
    'estimateNumber', 'client', 'date', 'buildingType',
  ];
  if (requiredTextFields.some(field => typeof estimate[field] !== 'string')) {
    throw new Error('В смете отсутствуют обязательные данные.');
  }
  if (!estimate.estimateNumber.trim()) {
    throw new Error('У сметы не указан номер.');
  }
  if (!Object.values(EstimateStatus).includes(estimate.status)) {
    throw new Error('У сметы указан неизвестный статус.');
  }
  if (!Array.isArray(estimate.items) || !Number.isFinite(estimate.area) || !Number.isFinite(estimate.total)) {
    throw new Error('В смете некорректные позиции или итоговая сумма.');
  }

  return estimate;
};

export const prepareSharedEstimateImport = (
  source: Estimate,
  existingEstimateNumbers: string[],
  now = new Date(),
  newId = `sm-id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
): ImportedSharedEstimate => {
  const sourceNumber = source.estimateNumber.trim();
  const numberChanged = existingEstimateNumbers.some(number => String(number) === sourceNumber);
  const estimateNumber = numberChanged
    ? generateEstimateNumber(existingEstimateNumbers, now)
    : sourceNumber;
  const timestamp = now.toISOString();

  return {
    numberChanged,
    estimate: {
      ...source,
      id: newId,
      parentId: undefined,
      estimateNumber,
      version: 1,
      date: timestamp,
      isArchived: false,
      sortOrder: now.getTime(),
      created_at: timestamp,
      updated_at: timestamp,
      items: source.items.map((item, index) => ({
        ...item,
        id: `${newId}-item-${index + 1}`,
      })),
    },
  };
};

export const importSharedEstimate = async (payloadText: string): Promise<ImportedSharedEstimate> => {
  const source = parseEstimateTransfer(payloadText);
  const existingEstimates = await loadEstimates();
  const imported = prepareSharedEstimateImport(source, existingEstimates.map(estimate => estimate.estimateNumber));

  await saveLocalRecords('estimates', [imported.estimate]);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('kmobn:data-imported'));
  }
  return imported;
};

export const prepareEstimatesForExport = (estimates: Estimate[]): Estimate[] => estimates.map(estimate => {
  const { explanation: _internalExplanation, ...exportableEstimate } = estimate;
  void _internalExplanation;
  return exportableEstimate;
});

export const mergeImportedEstimate = (incoming: Estimate, existing?: Estimate): Estimate => {
  if (!existing || Object.prototype.hasOwnProperty.call(incoming, 'explanation')) return incoming;
  return existing.explanation === undefined
    ? incoming
    : { ...incoming, explanation: existing.explanation };
};

export const exportData = async (): Promise<string> => {
  const [estimates, templates, materials, works, bundles, estimateSections] = await Promise.all([
    loadEstimates(),
    loadTemplates(),
    loadMaterials(),
    loadWorks(),
    loadBundles(),
    loadEstimateSections(),
  ]);

  const data = {
    schemaVersion: SCHEMA_VERSION,
    estimates: prepareEstimatesForExport(estimates),
    templates,
    materials,
    works,
    bundles,
    estimateSections: estimateSections[0] ?? null,
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
  if (obj.estimateSections !== undefined && obj.estimateSections !== null && !isObject(obj.estimateSections)) {
    return { ok: false, error: 'Поле «estimateSections» должно быть объектом.' };
  }

  return { ok: true, data: obj };
};

export interface ImportResult {
  estimates: { added: number; updated: number; unchanged: number; inFileDuplicates: number };
  templates: { added: number; updated: number; unchanged: number };
  materials: { added: number; updated: number; unchanged: number; inFileDuplicates: number };
  works: { added: number; updated: number; unchanged: number; inFileDuplicates: number };
  bundles: { added: number; updated: number; unchanged: number; inFileDuplicates: number };
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
        existing.category !== incoming.category ||
        JSON.stringify(existing.boardSpec ?? null) !== JSON.stringify(incoming.boardSpec ?? null);
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
      if (JSON.stringify(existing.selectedSections ?? []) !== JSON.stringify(incoming.selectedSections ?? [])) return true;
      if (JSON.stringify(existing.sectionSnapshot ?? []) !== JSON.stringify(incoming.sectionSnapshot ?? [])) return true;
      if (
        Object.prototype.hasOwnProperty.call(incoming, 'explanation')
        && (existing.explanation ?? '') !== (incoming.explanation ?? '')
      ) return true;
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
    const rawEstimateSections = isObject(data.estimateSections)
      ? data.estimateSections as unknown as EstimateSectionsDocument
      : null;

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
      const key = `${e.estimateNumber}::v${e.version ?? 0}`;
      const merged = mergeImportedEstimate(e, existingEstimateByNumberVersion.get(key));
      return {
        ...merged,
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
          boardSpec: m.boardSpec ?? existing.boardSpec,
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

    const importTable = async <T extends { id: string }>(
      tableName: CacheTableKey,
      records: T[],
    ) => {
      if (!records.length) return;
      await saveLocalRecords(tableName, records);
    };

    if (rawEstimateSections) {
      const userId = getWorkspaceUserId();
      if (userId) {
        await saveEstimateSections({
          ...normalizeEstimateSectionsDocument(rawEstimateSections, userId),
          id: userId,
          serverRevision: 0,
          baseDocument: undefined,
          operationId: undefined,
          syncConflict: undefined,
        });
      }
    }

    await Promise.all([
      importTable('estimates', estimates),
      importTable('templates', templates),
      importTable('materials', dedupMaterials),
      importTable('works', dedupWorks),
      importTable('bundles', dedupBundles),
    ]);

    const importResult: ImportResult = {
      estimates: { added: estimatesAdded, updated: estimatesUpdated, unchanged: estimatesUnchanged, inFileDuplicates: rawEstimates.length - estimatesAdded - estimatesUpdated - estimatesUnchanged },
      templates: { added: templatesAdded, updated: templatesUpdated, unchanged: templatesUnchanged },
      materials: { added: materialsAdded, updated: materialsUpdated, unchanged: materialsUnchanged, inFileDuplicates: dedupMaterialsResult.removedCount },
      works: { added: worksAdded, updated: worksUpdated, unchanged: worksUnchanged, inFileDuplicates: dedupWorksResult.removedCount },
      bundles: { added: bundlesAdded, updated: bundlesUpdated, unchanged: bundlesUnchanged, inFileDuplicates: dedupBundlesResult.removedCount },
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
