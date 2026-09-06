import { Estimate, EstimateItem, EstimateSubgroup, normalizeKey, safeNumber, SectionId } from '../types';

export type ActualFilter = 'all' | 'different' | 'missing' | 'actualOnly';

export interface ActualItemComparison {
  id: string;
  name: string;
  category: SectionId;
  subgroup: EstimateSubgroup;
  planUnit: string;
  actualUnit: string;
  planQuantity: number;
  actualQuantity: number | null;
  planPrice: number;
  actualPrice: number | null;
  planTotal: number;
  actualTotal: number | null;
  forecastTotal: number;
  diff: number;
  diffPct: number;
  hasActual: boolean;
  isActualComplete: boolean;
  isActualOnly: boolean;
}

export interface ActualSummary {
  planTotal: number;
  actualFilledTotal: number;
  forecastTotal: number;
  diff: number;
  diffPct: number;
  filledItems: number;
  totalItems: number;
  actualOnlyItems: number;
}

const roundMoney = (value: number): number => Math.round(value * 100) / 100;

export const calculatePlanItemTotal = (item: EstimateItem): number => {
  if (item.isActualOnly) return 0;
  return roundMoney(safeNumber(item.quantity, 0) * safeNumber(item.price, 0));
};

export const hasActualInput = (item: EstimateItem): boolean => {
  const actual = item.actual;
  if (!actual) return false;
  return actual.quantity !== undefined && actual.quantity !== null
    || actual.price !== undefined && actual.price !== null
    || Boolean(actual.unit && actual.unit !== item.unit)
    || Boolean(actual.note?.trim());
};

export const isActualComplete = (item: EstimateItem): boolean => {
  const actual = item.actual;
  if (!actual) return false;
  const quantity = safeNumber(actual.quantity, NaN);
  const price = safeNumber(actual.price, NaN);
  return Number.isFinite(quantity) && quantity > 0 && Number.isFinite(price) && price >= 0;
};

export const calculateActualItemTotal = (item: EstimateItem): number | null => {
  if (!isActualComplete(item)) return null;
  return roundMoney(safeNumber(item.actual?.quantity, 0) * safeNumber(item.actual?.price, 0));
};

export const buildActualItemComparison = (item: EstimateItem): ActualItemComparison => {
  const planTotal = calculatePlanItemTotal(item);
  const actualTotal = calculateActualItemTotal(item);
  const hasActual = hasActualInput(item);
  const complete = isActualComplete(item);
  const forecastTotal = complete ? actualTotal ?? 0 : planTotal;
  const diff = roundMoney(forecastTotal - planTotal);
  const diffPct = planTotal === 0 ? (forecastTotal === 0 ? 0 : 100) : Math.round((diff / planTotal) * 100);

  return {
    id: item.id,
    name: item.name,
    category: item.category,
    subgroup: item.subgroup || EstimateSubgroup.WORKS,
    planUnit: item.unit,
    actualUnit: item.actual?.unit || item.unit,
    planQuantity: safeNumber(item.quantity, 0),
    actualQuantity: complete ? safeNumber(item.actual?.quantity, 0) : item.actual?.quantity == null ? null : safeNumber(item.actual.quantity, 0),
    planPrice: safeNumber(item.price, 0),
    actualPrice: complete ? safeNumber(item.actual?.price, 0) : item.actual?.price == null ? null : safeNumber(item.actual.price, 0),
    planTotal,
    actualTotal,
    forecastTotal,
    diff,
    diffPct,
    hasActual,
    isActualComplete: complete,
    isActualOnly: Boolean(item.isActualOnly),
  };
};

export const buildActualComparisons = (estimate: Estimate): ActualItemComparison[] =>
  estimate.items.map(buildActualItemComparison);

export const calculateActualSummary = (estimate: Estimate): ActualSummary => {
  const rows = buildActualComparisons(estimate);
  const planTotal = roundMoney(rows.reduce((sum, row) => sum + row.planTotal, 0));
  const actualFilledTotal = roundMoney(rows.reduce((sum, row) => sum + (row.actualTotal ?? 0), 0));
  const forecastTotal = roundMoney(rows.reduce((sum, row) => sum + row.forecastTotal, 0));
  const diff = roundMoney(forecastTotal - planTotal);
  const diffPct = planTotal === 0 ? (forecastTotal === 0 ? 0 : 100) : Math.round((diff / planTotal) * 100);

  return {
    planTotal,
    actualFilledTotal,
    forecastTotal,
    diff,
    diffPct,
    filledItems: rows.filter(row => row.isActualComplete).length,
    totalItems: rows.length,
    actualOnlyItems: rows.filter(row => row.isActualOnly).length,
  };
};

export const copyPlanToActual = (item: EstimateItem): EstimateItem => ({
  ...item,
  actual: {
    ...item.actual,
    unit: item.unit,
    quantity: safeNumber(item.quantity, 0),
    price: safeNumber(item.price, 0),
    total: calculatePlanItemTotal(item),
    updatedAt: new Date().toISOString(),
  },
});

export const shouldShowActualRow = (item: EstimateItem, filter: ActualFilter): boolean => {
  if (filter === 'all') return true;
  const row = buildActualItemComparison(item);
  if (filter === 'actualOnly') return row.isActualOnly;
  if (filter === 'missing') return !row.isActualComplete;
  return row.isActualOnly || Math.abs(row.diff) > 0.009 || row.planUnit !== row.actualUnit;
};

export const actualComparisonKey = (item: Pick<EstimateItem, 'name' | 'unit' | 'category'>): string =>
  `${normalizeKey(item.name)}::${normalizeKey(item.unit)}::${item.category}`;
