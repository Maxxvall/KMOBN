import { EstimateCategory, Material, Work, normalizeKey, safeNumber } from '../types';
import { hashData } from './hashing';

export type CatalogDuplicateItem = Material | Work;

const getUpdatedAtMs = (item: CatalogDuplicateItem): number => {
  const value = 'lastUpdated' in item
    ? item.lastUpdated
    : item.updated_at ?? item.created_at;
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : 0;
};

const comparePreferredCatalogItems = (left: CatalogDuplicateItem, right: CatalogDuplicateItem): number => {
  const leftManual = 'isManualPrice' in left && left.isManualPrice ? 1 : 0;
  const rightManual = 'isManualPrice' in right && right.isManualPrice ? 1 : 0;
  if (leftManual !== rightManual) return rightManual - leftManual;

  const updatedDiff = getUpdatedAtMs(right) - getUpdatedAtMs(left);
  if (updatedDiff !== 0) return updatedDiff;

  const leftGeneral = left.category === EstimateCategory.GENERAL ? 1 : 0;
  const rightGeneral = right.category === EstimateCategory.GENERAL ? 1 : 0;
  if (leftGeneral !== rightGeneral) return rightGeneral - leftGeneral;

  const leftLinked = 'link' in left && Boolean(left.link?.trim()) ? 1 : 0;
  const rightLinked = 'link' in right && Boolean(right.link?.trim()) ? 1 : 0;
  if (leftLinked !== rightLinked) return rightLinked - leftLinked;

  const leftPriced = Number.isFinite(left.price) && left.price > 0 ? 1 : 0;
  const rightPriced = Number.isFinite(right.price) && right.price > 0 ? 1 : 0;
  if (leftPriced !== rightPriced) return rightPriced - leftPriced;

  return left.id.localeCompare(right.id);
};

export const selectPreferredCatalogDuplicate = <T extends CatalogDuplicateItem>(items: T[]): T | undefined => {
  return [...items].sort(comparePreferredCatalogItems)[0] as T | undefined;
};

export const getCatalogDuplicateFingerprint = (item: CatalogDuplicateItem): string => {
  return hashData({
    name: normalizeKey(item.name),
    price: safeNumber(item.price, 0),
    category: item.category,
    isManualPrice: 'isManualPrice' in item ? Boolean(item.isManualPrice) : false,
    link: 'link' in item ? String(item.link || '').trim() : '',
    boardSpec: 'boardSpec' in item ? item.boardSpec ?? null : null,
  });
};

export type CatalogDuplicateDecision = {
  normalizedKey: string;
  survivorId: string;
  expectedItems: Array<{ id: string; fingerprint: string }>;
};

export type CatalogDuplicateDeletePlan = {
  survivorIds: string[];
  deleteIds: string[];
};

const sameIdSet = (left: string[], right: string[]): boolean => {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return rightSet.size === right.length && left.every(id => rightSet.has(id));
};

export const buildCatalogDuplicateDeletePlan = <T extends CatalogDuplicateItem>(
  currentItems: T[],
  decisions: CatalogDuplicateDecision[],
): CatalogDuplicateDeletePlan => {
  const survivorIds: string[] = [];
  const deleteIds: string[] = [];
  const processedKeys = new Set<string>();
  const processedIds = new Set<string>();

  for (const decision of decisions) {
    const normalizedKey = normalizeKey(decision.normalizedKey);
    if (!normalizedKey || processedKeys.has(normalizedKey)) {
      throw new Error('Список групп дублей некорректен. Запустите поиск повторно.');
    }
    processedKeys.add(normalizedKey);

    const currentGroup = currentItems.filter(item => normalizeKey(item.name) === normalizedKey);
    const currentIds = currentGroup.map(item => item.id);
    const expectedIds = decision.expectedItems.map(item => item.id);
    if (currentGroup.length < 2 || !sameIdSet(currentIds, expectedIds)) {
      throw new Error('Состав группы дублей изменился. Удаление отменено — запустите поиск повторно.');
    }
    if (!currentIds.includes(decision.survivorId)) {
      throw new Error('Выбранная сохраняемая запись больше не существует.');
    }
    const expectedFingerprintById = new Map(decision.expectedItems.map(item => [item.id, item.fingerprint]));
    if (currentGroup.some(item => expectedFingerprintById.get(item.id) !== getCatalogDuplicateFingerprint(item))) {
      throw new Error('Одна из записей была изменена после поиска дублей. Удаление отменено.');
    }

    survivorIds.push(decision.survivorId);
    for (const id of currentIds) {
      if (processedIds.has(id)) {
        throw new Error('Одна запись попала в несколько групп дублей. Удаление отменено.');
      }
      processedIds.add(id);
      if (id !== decision.survivorId) deleteIds.push(id);
    }
  }

  return { survivorIds, deleteIds };
};
