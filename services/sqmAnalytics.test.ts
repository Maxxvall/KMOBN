import { describe, expect, it } from 'vitest';
import {
  buildSqmAnalytics,
  classifySqmCompletion,
  createSqmFieldPatch,
  detectSqmObjectType,
  formatSqmProjectCount,
  NEEDS_CHECK_REASON_LABELS,
  resolveSqmAreaBase,
  SQM_PACKAGE_LABELS,
  type SqmFilters,
  type SqmNeedsCheckReason,
  type SqmObjectType,
} from './sqmAnalytics';
import { HOUSE_PACKAGE_MATCHERS, parseHouseDescription } from './houseCalculator';
import { Estimate, EstimateCategory, EstimateItem, EstimateStatus, EstimateSubgroup, HouseCalculationSnapshot, normalizeRussianLower } from '../types';

const item = (overrides: Partial<EstimateItem> = {}): EstimateItem => ({
  id: 'item-1',
  name: 'Пиломатериал каркаса',
  unit: 'шт',
  quantity: 1,
  price: 100,
  total: 100,
  category: EstimateCategory.WALLS,
  subgroup: EstimateSubgroup.MATERIALS,
  ...overrides,
});

const estimate = (overrides: Partial<Estimate> = {}): Estimate => ({
  id: 'est-1',
  labelIds: ['system:typical-projects'],
  estimateNumber: 'КМ-1',
  client: 'Иванов',
  date: '2026-06-01',
  status: EstimateStatus.APPROVED,
  version: 1,
  items: [item()],
  total: 4_740_000,
  buildingType: 'Каркасный жилой дом',
  area: 79,
  ...overrides,
});

const snapshot = (overrides: Partial<HouseCalculationSnapshot['input']> = {}): HouseCalculationSnapshot => ({
  schemaVersion: 1,
  id: 'snap-1',
  createdAt: '2026-06-01T00:00:00.000Z',
  calculationRulesVersion: 1,
  scopeRulesVersion: 1,
  input: {
    area: 79,
    floors: 1,
    glazingArea: 0,
    doors: 4,
    roofShape: 'gable',
    package: 'warm-shell',
    additions: [],
    rates: { overheadPercent: 0, marginPercent: 0, reservePercent: 0, taxPercent: 0, discountPercent: 0 },
    ...overrides,
  },
  result: {
    low: 0,
    base: 0,
    high: 0,
    confidence: 'high',
    sourceEstimateId: 'est-1',
    sourceEstimateNumber: 'КМ-1',
    items: [],
    warnings: [],
    scope: [],
  },
});

const filters = (overrides: Partial<SqmFilters> = {}): SqmFilters => ({
  objectType: 'houses' as SqmObjectType,
  ...overrides,
});

describe('detectSqmObjectType', () => {
  it.each([
    ['Баня из бруса', 'baths'],
    ['баня', 'baths'],
    ['Хозблок 20 м2', 'utility'],
    ['Каркасный жилой дом', 'houses'],
    ['одноэтажный коттедж', 'houses'],
    ['гараж', 'other'],
    ['', 'other'],
  ] as const)('%s → %s', (buildingType, expected) => {
    expect(detectSqmObjectType(buildingType)).toBe(expected);
  });
});

describe('formatSqmProjectCount', () => {
  it('склоняет русские числительные', () => {
    expect(formatSqmProjectCount(1)).toBe('1 проект');
    expect(formatSqmProjectCount(2)).toBe('2 проекта');
    expect(formatSqmProjectCount(5)).toBe('5 проектов');
    expect(formatSqmProjectCount(11)).toBe('11 проектов');
    expect(formatSqmProjectCount(21)).toBe('21 проект');
    expect(formatSqmProjectCount(22)).toBe('22 проекта');
  });
});

describe('createSqmFieldPatch', () => {
  it('патч содержит только sqm-поля и штамп подтверждения', () => {
    const patch = createSqmFieldPatch({ package: 'warm-shell', areaBase: 'house', confirmedAt: '2026-11-15T10:00:00.000Z' });
    expect(Object.keys(patch).sort()).toEqual(['sqmAreaBase', 'sqmConfirmedAt', 'sqmPackage']);
    expect(patch.sqmPackage).toBe('warm-shell');
    expect(patch.sqmAreaBase).toBe('house');
    expect(patch.sqmConfirmedAt).toBe('2026-11-15T10:00:00.000Z');
    expect(Number.isNaN(Date.parse(patch.sqmConfirmedAt))).toBe(false);
  });

  it('без опций ставит только штамп подтверждения', () => {
    const patch = createSqmFieldPatch();
    expect(Object.keys(patch)).toEqual(['sqmConfirmedAt']);
    expect(Number.isNaN(Date.parse(patch.sqmConfirmedAt))).toBe(false);
  });
});

describe('HOUSE_PACKAGE_MATCHERS согласован с parseHouseDescription', () => {
  // Матчеры работают по нормализованному тексту (ё→е, дефисы → пробелы) —
  // та же нормализация, что и внутри parseHouseDescription.
  const normalizePhrase = (value: string): string => normalizeRussianLower(value)
    .replace(/[_\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  it('первый совпавший матчер даёт тот же пакет, что и парсер', () => {
    const phrases = [
      'дом под ключ',
      'тёплый контур',
      'дом с подготовкой под чистовую отделку',
      'оптимальный',
      'черновая',
      'коробка дома',
      'премиум',
      'под ключ с инженерными системами',
      'под ключ с коммуникациями',
    ];
    for (const phrase of phrases) {
      const expected = parseHouseDescription(phrase).package;
      const normalized = normalizePhrase(phrase);
      const matched = HOUSE_PACKAGE_MATCHERS.find(matcher => matcher.test(normalized))?.package;
      expect(matched, phrase).toBe(expected);
    }
  });

  it('у карточек фактические названия комплектаций кода', () => {
    expect(SQM_PACKAGE_LABELS['rough-finish']).toBe('Подготовка под чистовую');
    expect(SQM_PACKAGE_LABELS['turnkey']).toBe('Под ключ');
  });
});

describe('NEEDS_CHECK_REASON_LABELS', () => {
  it('экспорт из сервиса покрывает все причины панели непустыми подписями (R01)', () => {
    const reasons: SqmNeedsCheckReason[] = ['no-area', 'no-total', 'needs-area-base', 'ambiguous', 'hint', 'none'];
    for (const reason of reasons) {
      expect(NEEDS_CHECK_REASON_LABELS[reason], reason).toBeTruthy();
    }
    expect(NEEDS_CHECK_REASON_LABELS['no-area']).toBe('нет площади');
    expect(NEEDS_CHECK_REASON_LABELS['no-total']).toBe('нет итога');
  });
});

describe('classifySqmCompletion', () => {
  it('сохранённое подтверждение побеждает автораспознавание (R11)', () => {
    const est = estimate({ sqmPackage: 'box', explanation: 'дом под ключ' });
    expect(classifySqmCompletion(est)).toEqual({ state: 'confirmed', package: 'box' });
  });

  it('пакет из снапшота — статус «из расчёта дома», даже при другой фразе (R07)', () => {
    const est = estimate({ explanation: 'дом под ключ', houseCalculationSnapshots: [snapshot({ package: 'warm-shell' })] });
    const state = classifySqmCompletion(est);
    expect(state.state).toBe('explicit');
    expect(state.package).toBe('warm-shell');
  });

  it('«дом под ключ» — предложение turnkey (R08)', () => {
    expect(classifySqmCompletion(estimate({ explanation: 'дом под ключ' })))
      .toEqual({ state: 'hint', package: 'turnkey' });
  });

  it('«тёплый контур без отделки» — НЕ отрицание, это определение warm-shell (R10)', () => {
    const state = classifySqmCompletion(estimate({ explanation: 'тёплый контур без отделки' }));
    expect(state).toEqual({ state: 'hint', package: 'warm-shell' });
  });

  it('«под ключ без отделки» — конфликтное отрицание, требует проверки (R10)', () => {
    const state = classifySqmCompletion(estimate({ explanation: 'дом под ключ без отделки' }));
    expect(state.state).toBe('ambiguous');
    expect(state.reason).toBeTruthy();
  });

  it('«под ключ без инженерии» — конфликтное отрицание (R10)', () => {
    const state = classifySqmCompletion(estimate({ explanation: 'дом под ключ без инженерии' }));
    expect(state.state).toBe('ambiguous');
    expect(state.reason).toBeTruthy();
  });

  it('несколько разных комплектаций в тексте — требует проверки (R10)', () => {
    const state = classifySqmCompletion(estimate({ explanation: 'тёплый контур и под ключ' }));
    expect(state.state).toBe('ambiguous');
    expect(state.candidates).toEqual(expect.arrayContaining(['warm-shell', 'turnkey']));
  });

  it('«под ключ с инженерными системами» — уточнение одного пакета, не конфликт', () => {
    const state = classifySqmCompletion(estimate({ explanation: 'дом под ключ с инженерными системами' }));
    expect(state).toEqual({ state: 'hint', package: 'turnkey-engineering' });
  });

  it('«каркасный дом» — комплектации нет, без ложных предложений (R08)', () => {
    expect(classifySqmCompletion(estimate({ buildingType: 'Каркасный дом', explanation: 'по технологии каркас' })))
      .toEqual({ state: 'none' });
  });

  it('без фраз — статус «не определена»', () => {
    expect(classifySqmCompletion(estimate({ buildingType: 'Гараж' }))).toEqual({ state: 'none' });
  });
});

describe('resolveSqmAreaBase', () => {
  it('сохранённая база побеждает', () => {
    const est = estimate({ sqmAreaBase: 'house-with-additions', houseCalculationSnapshots: [snapshot({ additions: ['terrace'] })] });
    expect(resolveSqmAreaBase(est)).toBe('house-with-additions');
  });

  it('снапшот с дополнениями без подтверждения — база не определена (R06)', () => {
    const est = estimate({ houseCalculationSnapshots: [snapshot({ additions: ['terrace'] })] });
    expect(resolveSqmAreaBase(est)).toBeUndefined();
  });

  it('без дополнений — база «дом»', () => {
    expect(resolveSqmAreaBase(estimate({}))).toBe('house');
  });
});

describe('buildSqmAnalytics — базовые кейсы брифа', () => {
  it('одна смета: цена за м² и подпись «1 проект», без слова «средняя» (R20)', () => {
    const result = buildSqmAnalytics([estimate({ sqmPackage: 'turnkey', total: 4_740_000, area: 79 })], filters());
    const group = result.groups.turnkey;
    expect(group.count).toBe(1);
    expect(group.house?.client?.median).toBe(60_000);
    expect(group.house?.client?.min).toBe(60_000);
    expect(group.house?.client?.max).toBe(60_000);
    expect(group.house?.client?.average).toBe(60_000);
    expect(formatSqmProjectCount(group.count)).toBe('1 проект');
  });

  it('нет подходящих смет — карточка пустая, «Нет данных», не нули (R21)', () => {
    const result = buildSqmAnalytics([], filters());
    for (const pkg of Object.keys(result.groups)) {
      const group = result.groups[pkg as keyof typeof result.groups];
      expect(group.count).toBe(0);
      expect(group.house).toBeNull();
      expect(group.houseWithAdditions).toBeNull();
    }
    expect(result.needsCheck).toEqual([]);
  });

  it('смета без метки «Типовые проекты» не попадает никуда (R02)', () => {
    const est = estimate({ sqmPackage: 'turnkey', labelIds: [] });
    const result = buildSqmAnalytics([est], filters());
    expect(result.groups.turnkey.count).toBe(0);
    expect(result.needsCheck).toEqual([]);
  });

  it('смета без площади — в «Требуют проверки» с причиной «нет площади» (R03)', () => {
    const est = estimate({ sqmPackage: 'turnkey', area: 0 });
    const result = buildSqmAnalytics([est], filters());
    expect(result.groups.turnkey.count).toBe(0);
    expect(result.needsCheck).toHaveLength(1);
    expect(result.needsCheck[0].reason).toBe('no-area');
    expect(result.needsCheck[0].id).toBe('est-1');
  });

  it('NaN-площадь не исчезает: доходит до «Требуют проверки» как «нет площади» (R03)', () => {
    const est = estimate({ sqmPackage: 'turnkey', area: Number.NaN });
    const result = buildSqmAnalytics([est], filters());
    expect(result.groups.turnkey.count).toBe(0);
    expect(result.needsCheck).toHaveLength(1);
    expect(result.needsCheck[0].reason).toBe('no-area');
    expect(result.needsCheck[0].id).toBe('est-1');
  });

  it('площадь 0 и NaN ведут себя одинаково при включённых границах площади (R03)', () => {
    const zero = estimate({ id: 'est-zero', estimateNumber: 'КМ-31', sqmPackage: 'turnkey', area: 0 });
    const nan = estimate({ id: 'est-nan', estimateNumber: 'КМ-32', sqmPackage: 'turnkey', area: Number.NaN });
    const result = buildSqmAnalytics([zero, nan], filters({ areaMin: 50, areaMax: 100 }));
    expect(result.groups.turnkey.count).toBe(0);
    // границы применяются только к конечным значениям площади — «нет площади»
    // границы не прячут, обе сметы доходят до панели проверки
    expect(result.needsCheck.map(entry => entry.reason)).toEqual(['no-area', 'no-area']);
    expect(result.needsCheck.map(entry => entry.id).sort()).toEqual(['est-nan', 'est-zero']);
  });

  it('смета без итога — причина «нет итога» (R03)', () => {
    const est = estimate({ sqmPackage: 'turnkey', total: 0 });
    const result = buildSqmAnalytics([est], filters());
    expect(result.needsCheck[0].reason).toBe('no-total');
  });

  it('предложенная комплектация не входит в расчёт до подтверждения (R09)', () => {
    const est = estimate({ explanation: 'дом под ключ', total: 4_740_000, area: 79 });
    const result = buildSqmAnalytics([est], filters());
    expect(result.groups.turnkey.count).toBe(0);
    expect(result.needsCheck).toHaveLength(1);
    expect(result.needsCheck[0].reason).toBe('hint');
    expect(result.needsCheck[0].completion.package).toBe('turnkey');
  });

  it('снапшот считает смету сразу со статусом «из расчёта» (R07)', () => {
    const est = estimate({ houseCalculationSnapshots: [snapshot({ package: 'warm-shell' })], total: 3_950_000, area: 79 });
    const result = buildSqmAnalytics([est], filters());
    expect(result.groups['warm-shell'].count).toBe(1);
    expect(result.groups['warm-shell'].house?.entries[0].completion.state).toBe('explicit');
    expect(result.needsCheck).toEqual([]);
  });

  it('снапшот с дополнениями без подтверждённой базы — вопрос в «Требуют проверки» (R06)', () => {
    const est = estimate({ houseCalculationSnapshots: [snapshot({ package: 'warm-shell', additions: ['terrace'] })], total: 3_950_000, area: 90 });
    const result = buildSqmAnalytics([est], filters());
    expect(result.groups['warm-shell'].count).toBe(0);
    expect(result.needsCheck).toHaveLength(1);
    expect(result.needsCheck[0].reason).toBe('needs-area-base');
    expect(result.needsCheck[0].hasSnapshotAdditions).toBe(true);
  });

  it('подтверждённая база «с дополнениями» считается отдельно от «без дополнений» (R05)', () => {
    const plain = estimate({ id: 'est-plain', estimateNumber: 'КМ-10', sqmPackage: 'turnkey', total: 4_740_000, area: 79 });
    const withAdditions = estimate({ id: 'est-add', estimateNumber: 'КМ-11', sqmPackage: 'turnkey', sqmAreaBase: 'house-with-additions', total: 5_550_000, area: 92 });
    const result = buildSqmAnalytics([plain, withAdditions], filters());
    const group = result.groups.turnkey;
    expect(group.count).toBe(2);
    expect(group.house?.entries.map(entry => entry.id)).toEqual(['est-plain']);
    expect(group.houseWithAdditions?.entries.map(entry => entry.id)).toEqual(['est-add']);
    expect(group.house?.client?.median).toBe(60_000);
    expect(group.houseWithAdditions?.client?.median).toBe(60_326);
  });

  it('архивная смета не участвует, из версий берётся последняя (R02)', () => {
    const archived = estimate({ id: 'est-old', version: 1, sqmPackage: 'turnkey', isArchived: true, total: 1_000_000, area: 100 });
    const old = estimate({ id: 'est-v1', version: 1, sqmPackage: 'warm-shell', total: 2_000_000, area: 100 });
    const latest = estimate({ id: 'est-v2', version: 2, sqmPackage: 'warm-shell', total: 4_000_000, area: 100 });
    const result = buildSqmAnalytics([archived, old, latest], filters());
    expect(result.groups.turnkey.count).toBe(0);
    expect(result.groups['warm-shell'].count).toBe(1);
    expect(result.groups['warm-shell'].house?.client?.median).toBe(40_000);
  });
});

describe('buildSqmAnalytics — медиана, диапазон, среднее (R16-R19)', () => {
  // Разные номера смет — иначе filterToLatestEstimateVersions схлопнет их в одну.
  const confirmed = (id: string, total: number, area: number) => estimate({ id, estimateNumber: id, sqmPackage: 'box', total, area });

  it('нечётный список — середина', () => {
    const result = buildSqmAnalytics([
      confirmed('a', 100_000, 100),
      confirmed('b', 200_000, 100),
      confirmed('c', 300_000, 100),
    ], filters());
    // цены за м²: 1000, 2000, 3000
    expect(result.groups.box.house?.client?.median).toBe(2_000);
    expect(result.groups.box.house?.client?.min).toBe(1_000);
    expect(result.groups.box.house?.client?.max).toBe(3_000);
    expect(result.groups.box.house?.client?.average).toBe(2_000);
  });

  it('min/max по всем значениям: диапазон не зависит от порядка смет (R17)', () => {
    const result = buildSqmAnalytics([
      confirmed('a', 300_000, 100),
      confirmed('b', 100_000, 100),
      confirmed('c', 200_000, 100),
    ], filters());
    // цены за м² приходят в statsOf в порядке входа: 3000, 1000, 2000 —
    // концы неотсортированного массива не являются мин/максом
    expect(result.groups.box.house?.client?.min).toBe(1_000);
    expect(result.groups.box.house?.client?.max).toBe(3_000);
    expect(result.groups.box.house?.client?.median).toBe(2_000);
  });

  it('чётный список — среднее двух средних', () => {
    const result = buildSqmAnalytics([
      confirmed('a', 100_000, 100),
      confirmed('b', 200_000, 100),
      confirmed('c', 300_000, 100),
      confirmed('d', 500_000, 100),
    ], filters());
    // цены за м²: 1000, 2000, 3000, 5000
    expect(result.groups.box.house?.client?.median).toBe(2_500);
    expect(result.groups.box.house?.client?.average).toBe(2_750);
  });

  it('цена за м² округляется до целого (R13)', () => {
    const result = buildSqmAnalytics([confirmed('a', 10_000_000, 79)], filters());
    expect(result.groups.box.house?.client?.median).toBe(Math.round(10_000_000 / 79));
  });
});

describe('buildSqmAnalytics — цена для клиента и себестоимость раздельны (R14)', () => {
  const verifiedItem = (total: number) => item({ actual: { quantity: 1, price: total, total, source: 'verified' } });

  it('cost-факт даёт вторую метрику, не смешанную с клиентской', () => {
    const est = estimate({
      sqmPackage: 'turnkey',
      houseActualBasis: 'cost',
      houseExecutionStatus: 'actual-verified',
      items: [verifiedItem(3_160_000)],
      total: 4_740_000,
      area: 79,
    });
    const result = buildSqmAnalytics([est], filters());
    const client = result.groups.turnkey.house?.client;
    const cost = result.groups.turnkey.house?.cost;
    expect(client?.median).toBe(60_000);
    expect(cost?.median).toBe(Math.round(3_160_000 / 79));
    expect(cost?.count).toBe(1);
  });

  it('без cost-факта второй строки нет', () => {
    const est = estimate({ sqmPackage: 'turnkey', total: 4_740_000, area: 79 });
    const result = buildSqmAnalytics([est], filters());
    expect(result.groups.turnkey.house?.cost).toBeNull();
  });

  it('неверифицированный факт себестоимости не считается', () => {
    const est = estimate({
      sqmPackage: 'turnkey',
      houseActualBasis: 'cost',
      items: [item({ actual: { quantity: 1, price: 100, total: 100, source: 'manual' } })],
      total: 4_740_000,
      area: 79,
    });
    const result = buildSqmAnalytics([est], filters());
    expect(result.groups.turnkey.house?.cost).toBeNull();
  });
});

describe('buildSqmAnalytics — фильтры (R25)', () => {
  const house = estimate({ id: 'est-house', estimateNumber: 'КМ-21', sqmPackage: 'turnkey', buildingType: 'Каркасный дом', region: 'Московская область', total: 4_740_000, area: 79 });
  const bath = estimate({ id: 'est-bath', estimateNumber: 'КМ-22', sqmPackage: 'turnkey', buildingType: 'Баня из бруса', region: 'Московская область', total: 1_200_000, area: 30 });
  const noRegion = estimate({ id: 'est-no-region', estimateNumber: 'КМ-23', sqmPackage: 'turnkey', buildingType: 'Каркасный дом', total: 3_000_000, area: 60 });

  it('тип объекта не смешивает дома и бани (R04)', () => {
    const houses = buildSqmAnalytics([house, bath], filters({ objectType: 'houses' }));
    expect(houses.groups.turnkey.count).toBe(1);
    expect(houses.groups.turnkey.house?.entries[0].id).toBe('est-house');

    const baths = buildSqmAnalytics([house, bath], filters({ objectType: 'baths' }));
    expect(baths.groups.turnkey.count).toBe(1);
    expect(baths.groups.turnkey.house?.entries[0].id).toBe('est-bath');
  });

  it('регион: конкретный, «без региона», «все»', () => {
    const all = buildSqmAnalytics([house, noRegion], filters({ region: undefined }));
    expect(all.groups.turnkey.count).toBe(2);
    expect(all.regions).toEqual(['Московская область']);

    const onlyMoscow = buildSqmAnalytics([house, noRegion], filters({ region: 'Московская область' }));
    expect(onlyMoscow.groups.turnkey.count).toBe(1);

    const withoutRegion = buildSqmAnalytics([house, noRegion], filters({ region: null }));
    expect(withoutRegion.groups.turnkey.count).toBe(1);
    expect(withoutRegion.groups.turnkey.house?.entries[0].id).toBe('est-no-region');
  });

  it('площадь мин-макс отсекает смету целиком', () => {
    const result = buildSqmAnalytics([house, bath], filters({ areaMin: 50, areaMax: 100 }));
    expect(result.groups.turnkey.count).toBe(1);
    expect(result.needsCheck).toEqual([]);
  });
});
