import type { Estimate, EstimateSqmAreaBase, HousePackageId } from '../types';
import { normalizeRussianLower } from '../types';
import { filterToLatestEstimateVersions } from './estimateIntelligence';
import { isTypicalProject } from './estimateLabels';
import { HOUSE_PACKAGE_MATCHERS } from './houseCalculator';
import { calculateActualItemTotal } from './estimateActuals';

// Домен «цена м² по комплектациям» для блока аналитики. Чистые функции:
// buildSqmAnalytics никогда не изменяет входные сметы и не пишет в них ничего —
// сохранение подтверждений идёт через колбэк App (onUpdateSqmFields), outbox-first.
// Период здесь не фильтруется: блок получает уже периодные сметы со страницы.

export type SqmObjectType = 'houses' | 'baths' | 'utility' | 'other';

export type SqmCompletionStateName = 'confirmed' | 'explicit' | 'hint' | 'ambiguous' | 'none';

export interface SqmCompletionState {
  /** confirmed — сохранено пользователем; explicit — из расчёта дома (снапшот); hint — предложено по фразе; ambiguous/none — требуется проверка. */
  state: SqmCompletionStateName;
  package?: HousePackageId;
  candidates?: HousePackageId[];
  reason?: string;
}

export interface SqmFilters {
  objectType: SqmObjectType;
  /** undefined — все регионы; null — только сметы без региона; строка — конкретный регион. */
  region?: string | null;
  areaMin?: number;
  areaMax?: number;
}

export interface SqmMetricStats {
  median: number;
  min: number;
  max: number;
  average: number;
  count: number;
}

export interface SqmProjectEntry {
  id: string;
  estimateNumber: string;
  client: string;
  date: string;
  area: number;
  areaBase: EstimateSqmAreaBase;
  areaBaseConfirmed: boolean;
  total: number;
  clientPricePerSqm: number;
  costPerSqm: number | null;
  completion: SqmCompletionState;
  region?: string;
}

export interface SqmBaseGroupStats {
  areaBase: EstimateSqmAreaBase;
  entries: SqmProjectEntry[];
  /** Метрика «по цене для клиента» (итог сметы ÷ площадь). */
  client: SqmMetricStats | null;
  /** Метрика «по себестоимости» (верифицированный actual). Нет данных — null. */
  cost: SqmMetricStats | null;
}

export interface SqmGroupStats {
  package: HousePackageId;
  count: number;
  house: SqmBaseGroupStats | null;
  houseWithAdditions: SqmBaseGroupStats | null;
}

export type SqmNeedsCheckReason = 'no-area' | 'no-total' | 'needs-area-base' | 'ambiguous' | 'hint' | 'none';

export interface SqmNeedsCheckEntry {
  id: string;
  estimateNumber: string;
  client: string;
  date: string;
  reason: SqmNeedsCheckReason;
  completion: SqmCompletionState;
  hasSnapshotAdditions: boolean;
}

export interface SqmAnalyticsResult {
  groups: Record<HousePackageId, SqmGroupStats>;
  needsCheck: SqmNeedsCheckEntry[];
  regions: string[];
}

/** Патч подтверждения — только новые sqm-поля сметы, ничего больше. */
export interface SqmFieldPatch {
  sqmPackage?: HousePackageId;
  sqmAreaBase?: EstimateSqmAreaBase;
  sqmConfirmedAt: string;
}

export const SQM_PACKAGE_ORDER: readonly HousePackageId[] = ['box', 'warm-shell', 'rough-finish', 'turnkey', 'turnkey-engineering'];

// Названия карточек — фактические комплектации кода (R12): rough-finish —
// «Подготовка под чистовую», «чистовая отделка» пользователя — это turnkey.
export const SQM_PACKAGE_LABELS: Record<HousePackageId, string> = {
  box: 'Коробка',
  'warm-shell': 'Тёплый контур',
  'rough-finish': 'Подготовка под чистовую',
  turnkey: 'Под ключ',
  'turnkey-engineering': 'Под ключ с инженерией',
};

export const SQM_AREA_BASE_LABELS: Record<EstimateSqmAreaBase, string> = {
  house: 'без дополнений',
  'house-with-additions': 'с дополнениями',
};

/** Подписи причин панели «Требуют проверки» — единый источник для UI (R01, R03). */
export const NEEDS_CHECK_REASON_LABELS: Record<SqmNeedsCheckReason, string> = {
  'no-area': 'нет площади',
  'no-total': 'нет итога',
  'needs-area-base': 'площадь без дополнений или с дополнениями?',
  ambiguous: 'неоднозначная комплектация',
  hint: 'предложено по фразе — подтвердите',
  none: 'комплектация не определена',
};

const normalizeSqmText = (value: string): string => normalizeRussianLower(value)
  .replace(/[_\-]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

/**
 * «Под ключ без отделки/без инженерии» — конфликтное отрицание (R10):
 * пакет заявлен, а его часть исключена. Согласованное «тёплый контур без
 * отделки» под шаблон не попадает — там нет пакета с отделкой.
 */
const NEGATION_CONFLICT_PATTERN = /без[^.,;!?]{0,24}(отделк|инженер|коммуникац)/;

const latestSnapshot = (estimate: Estimate) => {
  const snapshots = estimate.houseCalculationSnapshots ?? [];
  if (!snapshots.length) return undefined;
  return snapshots.reduce((acc, current) => (
    Date.parse(current.createdAt || '') > Date.parse(acc.createdAt || '') ? current : acc
  ));
};

const snapshotHasAdditions = (estimate: Estimate): boolean => {
  const snapshots = estimate.houseCalculationSnapshots ?? [];
  return snapshots.some(current => Array.isArray(current.input?.additions) && current.input.additions.length > 0);
};

export function detectSqmObjectType(buildingType: string): SqmObjectType {
  const text = normalizeSqmText(buildingType || '');
  if (text.includes('бан')) return 'baths';
  if (text.includes('хозблок')) return 'utility';
  if (text.includes('дом') || text.includes('коттедж')) return 'houses';
  return 'other';
}

/**
 * Ступени комплектации (spec): сохранённое подтверждение → пакет из снапшота
 * расчёта дома → одна однозначная фраза («предложено») → отрицание/несколько
 * вариантов/ничего — «требует проверки». Догадок нет.
 */
export function classifySqmCompletion(estimate: Estimate): SqmCompletionState {
  if (estimate.sqmPackage) return { state: 'confirmed', package: estimate.sqmPackage };

  const snapshotPackage = latestSnapshot(estimate)?.input?.package;
  if (snapshotPackage) return { state: 'explicit', package: snapshotPackage };

  const text = normalizeSqmText(`${estimate.buildingType || ''} ${estimate.explanation || ''}`);
  if (!text) return { state: 'none' };

  const matches = HOUSE_PACKAGE_MATCHERS.filter(matcher => matcher.test(text));
  if (!matches.length) return { state: 'none' };

  const resolved = matches[0].package;
  const distinct = [...new Set(matches.map(matcher => matcher.package))];

  if (NEGATION_CONFLICT_PATTERN.test(text) && distinct.some(pkg => pkg === 'turnkey' || pkg === 'turnkey-engineering')) {
    return { state: 'ambiguous', candidates: distinct, reason: 'конфликтное отрицание: часть пакета исключена фразой «без …»' };
  }

  if (distinct.length > 1) {
    // «под ключ с инженеркой» зажигает и turnkey, и turnkey-engineering — это
    // уточнение одного пакета (приоритет парсера), а не два разных пакета.
    const onlyTurnkeyPair = distinct.length === 2 && distinct.includes('turnkey') && distinct.includes('turnkey-engineering');
    if (!onlyTurnkeyPair) {
      return { state: 'ambiguous', candidates: distinct, reason: 'в тексте несколько комплектаций — выберите вручную' };
    }
  }

  return { state: 'hint', package: resolved };
}

/** База площади: сохранённая → «дом» как указано; снапшот с дополнениями требует подтверждения (R05/R06). */
export function resolveSqmAreaBase(estimate: Estimate): EstimateSqmAreaBase | undefined {
  if (estimate.sqmAreaBase) return estimate.sqmAreaBase;
  if (snapshotHasAdditions(estimate)) return undefined;
  return 'house';
}

const isConfirmedPackage = (state: SqmCompletionStateName): boolean => state === 'confirmed' || state === 'explicit';

/** Себестоимость — только объявленная база «cost» и верифицированный факт на позициях (R14, notes.md §Данные). */
const costTotalOf = (estimate: Estimate): number | null => {
  if (estimate.houseActualBasis !== 'cost' || estimate.houseExecutionStatus !== 'actual-verified') return null;
  let sum = 0;
  let any = false;
  for (const item of estimate.items ?? []) {
    if (item.actual?.source !== 'verified') continue;
    const total = calculateActualItemTotal(item);
    if (total == null) continue;
    sum += total;
    any = true;
  }
  return any && sum > 0 ? sum : null;
};

const medianOf = (values: number[]): number => {
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const statsOf = (values: number[]): SqmMetricStats | null => {
  if (!values.length) return null;
  const sum = values.reduce((acc, value) => acc + value, 0);
  return {
    median: medianOf(values),
    // min/max — по всем значениям, не по концам неотсортированного массива:
    // диапазон карточки не должен зависеть от порядка входных смет (R17)
    min: Math.min(...values),
    max: Math.max(...values),
    average: sum / values.length,
    count: values.length,
  };
};

const NEEDS_CHECK_REASON_PRIORITY: Record<SqmNeedsCheckReason, number> = {
  'no-area': 0,
  'no-total': 1,
  'needs-area-base': 2,
  ambiguous: 3,
  hint: 4,
  none: 5,
};

const dateMsOf = (value: string): number => {
  const timestamp = Date.parse(value || '');
  return Number.isFinite(timestamp) ? timestamp : 0;
};

export function buildSqmAnalytics(estimates: Estimate[], filters: SqmFilters): SqmAnalyticsResult {
  const pool = filterToLatestEstimateVersions(Array.isArray(estimates) ? estimates : [])
    .filter(current => isTypicalProject(current));

  const regions = [...new Set(pool
    .map(current => (current.region ?? '').trim())
    .filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, 'ru'));

  const regionValue = (estimate: Estimate): string => (estimate.region ?? '').trim();
  const matchesRegion = (estimate: Estimate): boolean => {
    if (filters.region === undefined) return true;
    if (filters.region === null) return regionValue(estimate) === '';
    return regionValue(estimate) === filters.region;
  };
  const matchesArea = (estimate: Estimate): boolean => {
    // NaN/∞/0/отрицательная — не «вне диапазона», а «нет площади»: не отсекаем
    // здесь, смета дойдёт до hasArea=false и панели «Требуют проверки» (R03).
    // Границы диапазона применяются только к конечной положительной площади.
    if (!Number.isFinite(estimate.area) || estimate.area <= 0) return true;
    if (filters.areaMin != null && estimate.area < filters.areaMin) return false;
    if (filters.areaMax != null && estimate.area > filters.areaMax) return false;
    return true;
  };
  const matchesObjectType = (estimate: Estimate): boolean => detectSqmObjectType(estimate.buildingType) === filters.objectType;

  const scoped = pool.filter(current => matchesObjectType(current) && matchesRegion(current) && matchesArea(current));

  const baseByPackage = new Map<HousePackageId, Map<EstimateSqmAreaBase, SqmProjectEntry[]>>();
  const needsCheck: SqmNeedsCheckEntry[] = [];

  for (const current of scoped) {
    const entryId = current.id;
    const hasArea = Number.isFinite(current.area) && current.area > 0;
    const hasTotal = Number.isFinite(current.total) && current.total > 0;

    if (!hasArea || !hasTotal) {
      needsCheck.push({
        id: entryId,
        estimateNumber: current.estimateNumber,
        client: current.client,
        date: current.date,
        reason: hasArea ? 'no-total' : 'no-area',
        completion: classifySqmCompletion(current),
        hasSnapshotAdditions: snapshotHasAdditions(current),
      });
      continue;
    }

    const completion = classifySqmCompletion(current);
    const areaBase = resolveSqmAreaBase(current);

    if (!areaBase) {
      needsCheck.push({
        id: entryId,
        estimateNumber: current.estimateNumber,
        client: current.client,
        date: current.date,
        reason: 'needs-area-base',
        completion,
        hasSnapshotAdditions: true,
      });
      continue;
    }

    if (!isConfirmedPackage(completion.state) || !completion.package) {
      needsCheck.push({
        id: entryId,
        estimateNumber: current.estimateNumber,
        client: current.client,
        date: current.date,
        reason: completion.state === 'ambiguous' || completion.state === 'none' ? completion.state : 'hint',
        completion,
        hasSnapshotAdditions: snapshotHasAdditions(current),
      });
      continue;
    }

    const costTotal = costTotalOf(current);
    const entry: SqmProjectEntry = {
      id: entryId,
      estimateNumber: current.estimateNumber,
      client: current.client,
      date: current.date,
      area: current.area,
      areaBase,
      areaBaseConfirmed: Boolean(current.sqmAreaBase),
      total: current.total,
      clientPricePerSqm: Math.round(current.total / current.area),
      costPerSqm: costTotal ? Math.round(costTotal / current.area) : null,
      completion,
      region: regionValue(current) || undefined,
    };

    let baseMap = baseByPackage.get(completion.package);
    if (!baseMap) {
      baseMap = new Map<EstimateSqmAreaBase, SqmProjectEntry[]>();
      baseByPackage.set(completion.package, baseMap);
    }
    const entries = baseMap.get(areaBase) ?? [];
    entries.push(entry);
    baseMap.set(areaBase, entries);
  }

  const groups = {} as Record<HousePackageId, SqmGroupStats>;
  for (const pkg of SQM_PACKAGE_ORDER) {
    const baseMap = baseByPackage.get(pkg) ?? new Map<EstimateSqmAreaBase, SqmProjectEntry[]>();
    const buildBase = (areaBase: EstimateSqmAreaBase): SqmBaseGroupStats | null => {
      const entries = baseMap.get(areaBase) ?? [];
      if (!entries.length) return null;
      return {
        areaBase,
        entries,
        client: statsOf(entries.map(item => item.clientPricePerSqm)),
        cost: statsOf(entries.map(item => item.costPerSqm).filter((value): value is number => value != null)),
      };
    };
    const house = buildBase('house');
    const houseWithAdditions = buildBase('house-with-additions');
    groups[pkg] = {
      package: pkg,
      count: (house?.entries.length ?? 0) + (houseWithAdditions?.entries.length ?? 0),
      house,
      houseWithAdditions,
    };
  }

  needsCheck.sort((left, right) => (
    NEEDS_CHECK_REASON_PRIORITY[left.reason] - NEEDS_CHECK_REASON_PRIORITY[right.reason]
    || dateMsOf(right.date) - dateMsOf(left.date)
  ));

  return { groups, needsCheck, regions };
}

export function createSqmFieldPatch(options: { package?: HousePackageId; areaBase?: EstimateSqmAreaBase; confirmedAt?: string } = {}): SqmFieldPatch {
  const patch: SqmFieldPatch = { sqmConfirmedAt: options.confirmedAt ?? new Date().toISOString() };
  if (options.package) patch.sqmPackage = options.package;
  if (options.areaBase) patch.sqmAreaBase = options.areaBase;
  return patch;
}

export function formatSqmProjectCount(count: number): string {
  const rounded = Math.abs(Math.round(count));
  const mod10 = rounded % 10;
  const mod100 = rounded % 100;
  let word = 'проектов';
  if (mod10 === 1 && mod100 !== 11) word = 'проект';
  else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) word = 'проекта';
  return `${rounded} ${word}`;
}
