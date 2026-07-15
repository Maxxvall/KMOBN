import { Estimate, EstimateCategory, EstimateItem, EstimateSubgroup, Material, Work, normalizeKey, safeNumber } from '../types';
import { hashData } from './hashing';

export type DependencySeverity = 'critical' | 'important' | 'optional';

export type DependencyEdge = {
  requiresName: string;
  severity: DependencySeverity;
  note?: string;
};

export type WorkDependencies = {
  workName: string;
  requires: DependencyEdge[];
  prerequisites?: string[]; // other works that should come earlier in a full-build scenario
};

export type DependencyGraph = {
  workToMaterials: Map<string, DependencyEdge[]>;
  workPrerequisites: Map<string, string[]>;
};

export type HistoricalPatterns = {
  similarCount: number;
  avgArea: number;
  // Item frequencies in similar projects
  itemFrequency: Array<{ name: string; count: number; weight: number }>;
  // Co-occurrence strength between items, measured as lift-like score
  cooccurrence: Array<{ a: string; b: string; score: number; support: number }>;
  // Typical ratios (works vs materials totals)
  costShares: { worksShare: number; materialsShare: number; deliveryShare: number };
  // Category cost shares, normalized to 0..1 (sum across categories)
  categoryCostShares: Array<{ category: EstimateCategory; share: number }>;
};

export type QualityScore = {
  score: number; // 0..1
  completeness: number;
  anomaly: number;
  balance: number;
  notes: string[];
};

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);

const parseDateMs = (v: any): number => {
  const ms = Date.parse(String(v || ''));
  return Number.isFinite(ms) ? ms : 0;
};

export function getLatestEstimateVersions(estimates: Estimate[]): Estimate[] {
  const latestByRoot = new Map<string, Estimate>();
  for (const e of (estimates || [])) {
    if (!e) continue;
    // Unified grouping key: prefer estimateNumber, then parentId, then id
    const rootId = e.estimateNumber ? `num:${e.estimateNumber}` : (e.parentId || e.id);
    const prev = latestByRoot.get(rootId);
    if (!prev) {
      latestByRoot.set(rootId, e);
      continue;
    }
    const vA = typeof prev.version === 'number' ? prev.version : 0;
    const vB = typeof e.version === 'number' ? e.version : 0;
    if (vB > vA) {
      latestByRoot.set(rootId, e);
      continue;
    }
    if (vB === vA) {
      const dA = parseDateMs(prev.date);
      const dB = parseDateMs(e.date);
      if (dB > dA) latestByRoot.set(rootId, e);
    }
  }
  return Array.from(latestByRoot.values());
}

export function filterToLatestEstimateVersions(estimates: Estimate[]): Estimate[] {
  return getLatestEstimateVersions(estimates).filter(estimate => !estimate.isArchived);
}

export function buildDependencyGraph(materials: Material[], works: Work[]): DependencyGraph {
  const workNames = new Set((works || []).map(w => normalizeKey(w.name)));
  const materialNames = new Set((materials || []).map(m => normalizeKey(m.name)));

  // Minimal базовый граф (расширяется через обучение и историю косвенно, но без изменения UX)
  const rules: WorkDependencies[] = [
    {
      workName: 'Монтаж силового каркаса стен',
      requires: [
        { requiresName: 'Брус', severity: 'critical', note: 'Каркас' },
        { requiresName: 'Доска', severity: 'important', note: 'Обвязка/раскосы/обрешётка' },
        { requiresName: 'Крепеж', severity: 'critical', note: 'Гвозди/саморезы' },
      ],
      prerequisites: ['Разметка свайного поля, монтаж свай'],
    },
    {
      workName: 'Монтаж ветровлагозащитной мембраны',
      requires: [
        { requiresName: 'Ветровлагозащитная мембрана', severity: 'critical' },
        { requiresName: 'Крепеж', severity: 'important' },
      ],
      prerequisites: ['Монтаж силового каркаса стен'],
    },
    {
      workName: 'Утепление стен (150мм)',
      requires: [
        { requiresName: 'Утеплитель', severity: 'critical' },
        { requiresName: 'Пароизоляция', severity: 'important' },
        { requiresName: 'Крепеж', severity: 'important' },
      ],
      prerequisites: ['Монтаж силового каркаса стен', 'Монтаж ветровлагозащитной мембраны'],
    },
    {
      workName: 'Монтаж кровли (металлочерепица)',
      requires: [
        { requiresName: 'Металлочерепица', severity: 'critical' },
        { requiresName: 'Подкладочный ковер', severity: 'important' },
        { requiresName: 'Крепеж', severity: 'critical' },
      ],
      prerequisites: ['Монтаж контробрешетки'],
    },
  ];

  const graph: DependencyGraph = {
    workToMaterials: new Map(),
    workPrerequisites: new Map(),
  };

  // Match rules to actual catalog names by fuzzy contains (no extra deps)
  const materialList = (materials || []).map(m => m.name);
  const workList = (works || []).map(w => w.name);

  const findContains = (needle: string, haystack: string[]): string | null => {
    const n = normalizeKey(needle);
    // Prefer exact word/substring matches
    let best: string | null = null;
    for (const h of haystack) {
      const hk = normalizeKey(h);
      if (hk === n) return h;
      if (hk.includes(n)) best = best ?? h;
    }
    return best;
  };

  for (const r of rules) {
    const workResolved = findContains(r.workName, workList);
    if (!workResolved) continue;
    if (!workNames.has(normalizeKey(workResolved))) continue;

    const edges: DependencyEdge[] = [];
    for (const req of r.requires) {
      const materialResolved = findContains(req.requiresName, materialList);
      if (!materialResolved) continue;
      if (!materialNames.has(normalizeKey(materialResolved))) continue;
      edges.push({ ...req, requiresName: materialResolved });
    }

    if (edges.length) graph.workToMaterials.set(normalizeKey(workResolved), edges);

    const prereqResolved = (r.prerequisites || [])
      .map(p => findContains(p, workList))
      .filter(Boolean) as string[];

    if (prereqResolved.length) {
      graph.workPrerequisites.set(normalizeKey(workResolved), prereqResolved);
    }
  }

  return graph;
}

export function analyzeHistoricalPatterns(
  estimates: Estimate[],
  params: { area: number; region?: string; buildingType?: string },
): HistoricalPatterns {
  const latestOnly = filterToLatestEstimateVersions(estimates || []);
  const area = safeNumber(params.area, 0);
  const region = normalizeKey(params.region || '');
  const buildingType = normalizeKey(params.buildingType || '');

  const similar = (latestOnly || []).filter(e => {
    if (!e?.area || area <= 0) return false;
    const areaClose = Math.abs(e.area - area) / area < 0.2;
    const typeOk = buildingType ? normalizeKey(e.buildingType) === buildingType : true;
    const regionOk = region ? normalizeKey((e as any).region || '') === region : true;
    return areaClose && typeOk && regionOk;
  });

  const freq = new Map<string, number>();
  const presenceByEstimate: Array<Set<string>> = [];

  const subgroupTotals = { works: 0, materials: 0, delivery: 0 };
  const categoryTotals = new Map<EstimateCategory, number>();

  for (const est of similar) {
    const present = new Set<string>();
    for (const it of est.items || []) {
      const k = normalizeKey(it.name);
      if (!k) continue;
      freq.set(k, (freq.get(k) || 0) + 1);
      present.add(k);

      const subtotal = safeNumber(it.total, safeNumber(it.quantity, 0) * safeNumber(it.price, 0));
      const sg = it.subgroup || EstimateSubgroup.WORKS;
      if (sg === EstimateSubgroup.MATERIALS) subgroupTotals.materials += subtotal;
      else if (sg === EstimateSubgroup.DELIVERY) subgroupTotals.delivery += subtotal;
      else subgroupTotals.works += subtotal;

      categoryTotals.set(it.category, (categoryTotals.get(it.category) || 0) + subtotal);
    }
    presenceByEstimate.push(present);
  }

  const n = similar.length;
  const avgArea = n ? sum(similar.map(s => safeNumber(s.area, 0))) / n : 0;

  const freqEntries = Array.from(freq.entries()).map(([k, count]) => {
    // Вес: частота * лог(1+n)
    const weight = count * Math.log(1 + n);
    return { name: k, count, weight };
  });

  freqEntries.sort((a, b) => b.weight - a.weight);

  // Co-occurrence: compute lift-like score for top items only
  const topKeys = freqEntries.slice(0, 60).map(x => x.name);
  const keyIndex = new Map<string, number>();
  topKeys.forEach((k, idx) => keyIndex.set(k, idx));

  const itemSupport = new Map<string, number>();
  for (const k of topKeys) itemSupport.set(k, 0);

  for (const pres of presenceByEstimate) {
    for (const k of topKeys) {
      if (pres.has(k)) itemSupport.set(k, (itemSupport.get(k) || 0) + 1);
    }
  }

  const pairSupport = new Map<string, number>();
  for (const pres of presenceByEstimate) {
    const presentTop = topKeys.filter(k => pres.has(k));
    for (let i = 0; i < presentTop.length; i++) {
      for (let j = i + 1; j < presentTop.length; j++) {
        const a = presentTop[i];
        const b = presentTop[j];
        const key = a < b ? `${a}|||${b}` : `${b}|||${a}`;
        pairSupport.set(key, (pairSupport.get(key) || 0) + 1);
      }
    }
  }

  const cooccurrence = Array.from(pairSupport.entries())
    .map(([k, supp]) => {
      const [a, b] = k.split('|||');
      const pa = (itemSupport.get(a) || 0) / Math.max(1, n);
      const pb = (itemSupport.get(b) || 0) / Math.max(1, n);
      const pab = supp / Math.max(1, n);
      // lift = P(A,B)/(P(A)P(B))
      const score = (pa > 0 && pb > 0) ? (pab / (pa * pb)) : 0;
      return { a, b, score, support: supp };
    })
    .filter(x => x.support >= 2 && x.score >= 1.2)
    .sort((x, y) => (y.score - x.score) || (y.support - x.support))
    .slice(0, 25);

  const totalCost = subgroupTotals.works + subgroupTotals.materials + subgroupTotals.delivery;
  const costShares = totalCost > 0
    ? {
      worksShare: subgroupTotals.works / totalCost,
      materialsShare: subgroupTotals.materials / totalCost,
      deliveryShare: subgroupTotals.delivery / totalCost,
    }
    : { worksShare: 0, materialsShare: 0, deliveryShare: 0 };

  const totalByCat = sum(Array.from(categoryTotals.values()));
  const categoryCostShares = Array.from(categoryTotals.entries())
    .map(([category, v]) => ({ category, share: totalByCat > 0 ? v / totalByCat : 0 }))
    .sort((a, b) => b.share - a.share)
    .slice(0, 12);

  return {
    similarCount: n,
    avgArea,
    itemFrequency: freqEntries.slice(0, 20),
    cooccurrence,
    costShares,
    categoryCostShares,
  };
}

export function scoreEstimateQuality(
  items: EstimateItem[],
  opts: {
    graph: DependencyGraph;
    historical?: HistoricalPatterns;
  },
): QualityScore {
  const notes: string[] = [];
  const list = items || [];

  const byName = new Map<string, EstimateItem>();
  for (const it of list) {
    const k = normalizeKey(it.name);
    if (k) byName.set(k, it);
  }

  // Completeness: how many required materials exist for present works
  let reqTotal = 0;
  let reqMet = 0;

  for (const it of list) {
    const isWork = (it.subgroup || EstimateSubgroup.WORKS) === EstimateSubgroup.WORKS;
    if (!isWork) continue;

    const edges = opts.graph.workToMaterials.get(normalizeKey(it.name)) || [];
    for (const e of edges) {
      reqTotal++;
      if (byName.has(normalizeKey(e.requiresName))) reqMet++;
    }
  }

  const completeness = reqTotal > 0 ? reqMet / reqTotal : 0.75;
  if (reqTotal > 0 && completeness < 0.8) notes.push('Есть вероятные пропуски материалов к работам.');

  // Anomaly: zero/negative quantities, too many duplicates, empty categories
  let anomalyPenalty = 0;
  const nameCounts = new Map<string, number>();
  for (const it of list) {
    if (!it.name) anomalyPenalty += 0.03;
    if (safeNumber(it.quantity, 0) <= 0) anomalyPenalty += 0.05;
    const k = normalizeKey(it.name);
    nameCounts.set(k, (nameCounts.get(k) || 0) + 1);
  }
  for (const [, c] of nameCounts) {
    if (c >= 2) anomalyPenalty += 0.02 * (c - 1);
  }
  const anomaly = clamp01(1 - anomalyPenalty);
  if (anomaly < 0.8) notes.push('Есть аномалии (нулевые количества или дубли).');

  // Balance: compare works/materials share against history if present
  let balance = 0.8;
  if (opts.historical && opts.historical.similarCount >= 2) {
    const hist = opts.historical.costShares;
    const totals = { works: 0, materials: 0, delivery: 0 };
    for (const it of list) {
      const v = safeNumber(it.total, safeNumber(it.quantity, 0) * safeNumber(it.price, 0));
      const sg = it.subgroup || EstimateSubgroup.WORKS;
      if (sg === EstimateSubgroup.MATERIALS) totals.materials += v;
      else if (sg === EstimateSubgroup.DELIVERY) totals.delivery += v;
      else totals.works += v;
    }
    const t = totals.works + totals.materials + totals.delivery;
    if (t > 0) {
      const worksShare = totals.works / t;
      const materialsShare = totals.materials / t;
      const diff = Math.abs(worksShare - hist.worksShare) + Math.abs(materialsShare - hist.materialsShare);
      balance = clamp01(1 - diff);
      if (balance < 0.7) notes.push('Соотношение работ/материалов заметно отличается от истории.');
    }
  }

  const score = clamp01(0.45 * completeness + 0.35 * anomaly + 0.20 * balance);

  return { score, completeness, anomaly, balance, notes };
}

export function buildPromptInsights(patterns: HistoricalPatterns): string {
  const n = Math.max(1, patterns.similarCount);
  const freq = patterns.itemFrequency
    .slice(0, 12)
    .map(x => {
      const pct = (x.count / n) * 100;
      return `${x.name} (${x.count}/${n}, ${pct.toFixed(0)}%)`;
    });

  const co = patterns.cooccurrence
    .slice(0, 10)
    .map(x => `- ${x.a} + ${x.b} (сила: ${x.score.toFixed(2)}, поддержка: ${x.support})`)
    .join('\n');

  const shares = patterns.costShares;
  const catShares = patterns.categoryCostShares
    .slice(0, 8)
    .map(x => `${x.category}: ${(x.share * 100).toFixed(0)}%`)
    .join(', ');

  return [
    `Исторические паттерны (похожие проекты: ${patterns.similarCount}, средняя площадь: ${patterns.avgArea.toFixed(1)} м²):`,
    `- Частые позиции: ${freq.join(', ') || 'нет данных'}`,
    `- Типичное соотношение стоимости: работы ${(shares.worksShare * 100).toFixed(0)}% / материалы ${(shares.materialsShare * 100).toFixed(0)}% / доставка ${(shares.deliveryShare * 100).toFixed(0)}%`,
    catShares ? `- Доли разделов (стоимость): ${catShares}` : '',
    co ? `- Частые сочетания (корреляции):\n${co}` : '',
  ].filter(Boolean).join('\n');
}

export function summarizeEstimateExample(items: EstimateItem[], maxPerCategory = 5): any {
  const byCat = new Map<EstimateCategory, EstimateItem[]>();
  for (const it of items || []) {
    const list = byCat.get(it.category) || [];
    list.push(it);
    byCat.set(it.category, list);
  }

  const out: any = {};
  for (const [cat, list] of byCat.entries()) {
    const top = list
      .slice()
      .sort((a, b) => (safeNumber(b.total, 0) - safeNumber(a.total, 0)) || (safeNumber(b.quantity, 0) - safeNumber(a.quantity, 0)))
      .slice(0, maxPerCategory)
      .map(it => ({ name: it.name, unit: it.unit, quantity: safeNumber(it.quantity, 0), subgroup: it.subgroup || EstimateSubgroup.WORKS }));
    out[cat] = top;
  }
  return out;
}

export function pickFewShotExamples(
  estimates: Estimate[],
  params: { area: number; region?: string; buildingType?: string },
  graph: DependencyGraph,
): Array<{ title: string; example: any; qualityScore?: number }>{
  const latestOnly = filterToLatestEstimateVersions(estimates || []);
  const patterns = analyzeHistoricalPatterns(latestOnly, params);
  const similar = (latestOnly || []).filter(e => {
    if (!e?.area || !params.area) return false;
    const areaClose = Math.abs(e.area - params.area) / params.area < 0.25;
    const typeOk = params.buildingType ? normalizeKey(e.buildingType) === normalizeKey(params.buildingType) : true;
    const regionOk = params.region ? normalizeKey((e as any).region || '') === normalizeKey(params.region) : true;
    return areaClose && typeOk && regionOk;
  });

  const scored = similar
    .map(e => {
      const q = scoreEstimateQuality(e.items || [], { graph, historical: patterns });
      return { e, q };
    })
    .sort((a, b) => b.q.score - a.q.score);

  const picked = scored.slice(0, 3);
  return picked.map((x, idx) => ({
    title: `Пример ${idx + 1} (площадь ${safeNumber(x.e.area, 0)} м², качество ${x.q.score.toFixed(2)})`,
    qualityScore: x.q.score,
    example: summarizeEstimateExample(x.e.items || [], 5),
  }));
}

// ── Estimate version deduplication ──

const optionalNumber = (value: unknown): number | null => {
  return value === null || value === undefined ? null : safeNumber(value, 0);
};

export function getEstimateContentFingerprint(e: Estimate): string {
  const sortedItems = (e.items || [])
    .map(item => ({
      name: normalizeKey(item.name),
      unit: normalizeKey(item.unit),
      quantity: safeNumber(item.quantity, 0),
      price: safeNumber(item.price, 0),
      total: safeNumber(item.total, 0),
      category: item.category,
      subgroup: item.subgroup ?? null,
      note: normalizeKey(item.note || ''),
      isActualOnly: Boolean(item.isActualOnly),
      actual: item.actual ? {
        unit: normalizeKey(item.actual.unit || ''),
        quantity: optionalNumber(item.actual.quantity),
        price: optionalNumber(item.actual.price),
        total: optionalNumber(item.actual.total),
        note: normalizeKey(item.actual.note || ''),
      } : null,
    }))
    .map(item => ({ item, key: hashData(item) }))
    .sort((left, right) => left.key.localeCompare(right.key))
    .map(({ item }) => item);

  return hashData({
    items: sortedItems,
    total: safeNumber(e.total, 0),
    client: normalizeKey(e.client),
    area: safeNumber(e.area, 0),
    buildingType: normalizeKey(e.buildingType),
    status: e.status,
    isArchived: Boolean(e.isArchived),
    selectedSections: [...(e.selectedSections || [])].sort(),
    needsPriceUpdate: Boolean(e.needsPriceUpdate),
  });
}

export type EstimateDuplicateGroup = {
  estimateNumber: string;
  latestVersionId: string;
  latestVersion: Estimate;
  identicalToLatest: Estimate[];
  identicalPairs: Estimate[][];
};

export function findEstimateVersionDuplicates(estimates: Estimate[]): EstimateDuplicateGroup[] {
  const byNumber = new Map<string, Estimate[]>();
  for (const e of estimates || []) {
    if (!e?.estimateNumber) continue;
    const list = byNumber.get(e.estimateNumber) || [];
    list.push(e);
    byNumber.set(e.estimateNumber, list);
  }

  const result: EstimateDuplicateGroup[] = [];

  for (const [number, versions] of byNumber) {
    if (versions.length < 2) continue;

    const sorted = [...versions].sort((a, b) => {
      const vA = typeof a.version === 'number' ? a.version : 0;
      const vB = typeof b.version === 'number' ? b.version : 0;
      if (vB !== vA) return vB - vA;
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });

    const latest = sorted[0];
    const older = sorted.slice(1);

    const latestHash = getEstimateContentFingerprint(latest);
    const identicalToLatest: Estimate[] = [];
    const remaining: Estimate[] = [];

    for (const e of older) {
      if (getEstimateContentFingerprint(e) === latestHash) {
        identicalToLatest.push(e);
      } else {
        remaining.push(e);
      }
    }

    // Group remaining by content hash to find identical pairs
    const hashGroups = new Map<string, Estimate[]>();
    for (const e of remaining) {
      const h = getEstimateContentFingerprint(e);
      const group = hashGroups.get(h) || [];
      group.push(e);
      hashGroups.set(h, group);
    }
    const identicalPairs: Estimate[][] = [];
    for (const group of hashGroups.values()) {
      if (group.length >= 2) {
        identicalPairs.push(group);
      }
    }

    if (identicalToLatest.length > 0 || identicalPairs.length > 0) {
      result.push({
        estimateNumber: number,
        latestVersionId: latest.id,
        latestVersion: latest,
        identicalToLatest,
        identicalPairs,
      });
    }
  }

  return result;
}

export type EstimateDuplicateDeleteRequest = {
  estimateNumber: string;
  expectedLatestVersionId: string;
  candidates: Array<{ id: string; expectedFingerprint: string }>;
};

export type EstimateDuplicateDeletePlan = {
  deleteIds: string[];
};

const sortEstimateVersions = (versions: Estimate[]): Estimate[] => {
  return [...versions].sort((left, right) => {
    const versionDiff = safeNumber(right.version, 0) - safeNumber(left.version, 0);
    if (versionDiff !== 0) return versionDiff;
    return parseDateMs(right.date) - parseDateMs(left.date);
  });
};

export function buildEstimateDuplicateDeletePlan(
  currentEstimates: Estimate[],
  requests: EstimateDuplicateDeleteRequest[],
): EstimateDuplicateDeletePlan {
  const deleteIds: string[] = [];
  const requestedIds = new Set<string>();

  for (const request of requests) {
    if (!request.estimateNumber || request.candidates.length === 0) {
      throw new Error('План удаления дублей пуст или некорректен.');
    }

    const chain = sortEstimateVersions(
      currentEstimates.filter(estimate => estimate.estimateNumber === request.estimateNumber),
    );
    if (chain.length < 2 || chain[0].id !== request.expectedLatestVersionId) {
      throw new Error(`Смета №${request.estimateNumber} изменилась. Запустите поиск дублей повторно.`);
    }

    const chainById = new Map(chain.map(estimate => [estimate.id, estimate]));
    const idsForRequest = new Set<string>();
    for (const candidate of request.candidates) {
      if (requestedIds.has(candidate.id) || idsForRequest.has(candidate.id)) {
        throw new Error('Одна версия выбрана для удаления несколько раз.');
      }
      const current = chainById.get(candidate.id);
      if (!current) {
        throw new Error(`Версия сметы №${request.estimateNumber} больше не существует или принадлежит другой цепочке.`);
      }
      if (current.id === chain[0].id) {
        throw new Error(`Актуальная версия сметы №${request.estimateNumber} не может быть удалена как дубль.`);
      }
      if (getEstimateContentFingerprint(current) !== candidate.expectedFingerprint) {
        throw new Error(`Версия сметы №${request.estimateNumber} была изменена. Удаление отменено.`);
      }
      idsForRequest.add(candidate.id);
    }

    const fingerprintGroups = new Map<string, Estimate[]>();
    for (const estimate of chain) {
      const fingerprint = getEstimateContentFingerprint(estimate);
      const group = fingerprintGroups.get(fingerprint) || [];
      group.push(estimate);
      fingerprintGroups.set(fingerprint, group);
    }

    for (const id of idsForRequest) {
      const estimate = chainById.get(id) as Estimate;
      const group = fingerprintGroups.get(getEstimateContentFingerprint(estimate)) || [];
      if (group.length < 2) {
        throw new Error(`Версия сметы №${request.estimateNumber} больше не является дублем.`);
      }
      const remainingInGroup = group.filter(item => !idsForRequest.has(item.id));
      if (remainingInGroup.length === 0) {
        throw new Error(`Для каждой одинаковой группы сметы №${request.estimateNumber} нужно сохранить одну версию.`);
      }
    }

    if (chain.length - idsForRequest.size < 1) {
      throw new Error(`Нельзя удалить все версии сметы №${request.estimateNumber}.`);
    }

    for (const id of idsForRequest) {
      requestedIds.add(id);
      deleteIds.push(id);
    }
  }

  return { deleteIds };
}
