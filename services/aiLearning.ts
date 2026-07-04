import { Estimate, EstimateItem, normalizeKey, safeNumber } from '../types';
import { aiCache } from './aiCache';

export type LearningContext = {
  area: number;
  region?: string;
  buildingType?: string;
  projectTemplateId?: string;
  projectTemplateName?: string;
  scopeDescription?: string;
};

export type CorrectionEvent = {
  at: string;
  context: LearningContext;
  // stable key that identifies the AI generation session/prompt
  cacheKey?: string;
  added: Array<{ name: string }>; // item names
  removed: Array<{ name: string }>; // item names
  changed: Array<{ name: string; fromQty: number; toQty: number; fromUnit?: string; toUnit?: string }>; // qty changes
};

export type AggregatedLearning = {
  version: 1;
  updatedAt: string;
  // key = context signature (buildingType+template+region)
  byContext: Record<string, {
    additions: Record<string, number>;
    deletions: Record<string, number>;
    qtyFactorSum: Record<string, number>;
    qtyFactorCount: Record<string, number>;
    pairAdditions: Record<string, number>; // "A|||B" where A added when B was present
  }>;
  badCacheKeys: Record<string, { until: number; count: number; reason?: string }>;
};

const STORAGE_KEY = 'kmobn:aiLearning:v1';

const ctxSignature = (ctx: LearningContext): string => {
  const parts = [
    normalizeKey(ctx.buildingType || ''),
    normalizeKey(ctx.region || ''),
    normalizeKey(ctx.projectTemplateId || ''),
    normalizeKey(ctx.projectTemplateName || ''),
  ].filter(Boolean);
  return parts.join('|') || 'default';
};

const load = (): AggregatedLearning => {
  if (typeof window === 'undefined') {
    return { version: 1, updatedAt: new Date().toISOString(), byContext: {}, badCacheKeys: {} };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: 1, updatedAt: new Date().toISOString(), byContext: {}, badCacheKeys: {} };
    const parsed = JSON.parse(raw);
    if (parsed?.version !== 1) {
      return { version: 1, updatedAt: new Date().toISOString(), byContext: {}, badCacheKeys: {} };
    }
    return parsed as AggregatedLearning;
  } catch {
    return { version: 1, updatedAt: new Date().toISOString(), byContext: {}, badCacheKeys: {} };
  }
};

const save = (data: AggregatedLearning) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
};

const indexByName = (items: EstimateItem[]) => {
  const m = new Map<string, EstimateItem>();
  for (const it of items || []) {
    const k = normalizeKey(it.name);
    if (!k) continue;
    // last wins is fine
    m.set(k, it);
  }
  return m;
};

export function diffItems(before: EstimateItem[], after: EstimateItem[]) {
  const b = indexByName(before || []);
  const a = indexByName(after || []);

  const added: Array<{ name: string }> = [];
  const removed: Array<{ name: string }> = [];
  const changed: Array<{ name: string; fromQty: number; toQty: number; fromUnit?: string; toUnit?: string }> = [];

  for (const [k, it] of a.entries()) {
    if (!b.has(k)) {
      added.push({ name: it.name });
      continue;
    }
    const old = b.get(k)!;
    const fromQty = safeNumber(old.quantity, 0);
    const toQty = safeNumber(it.quantity, 0);
    const fromUnit = old.unit;
    const toUnit = it.unit;
    const qtyChanged = Math.abs(fromQty - toQty) > Math.max(0.01, fromQty * 0.05);
    const unitChanged = normalizeKey(fromUnit) !== normalizeKey(toUnit);
    if (qtyChanged || unitChanged) {
      changed.push({ name: it.name, fromQty, toQty, fromUnit, toUnit });
    }
  }

  for (const [k, it] of b.entries()) {
    if (!a.has(k)) removed.push({ name: it.name });
  }

  return { added, removed, changed };
}

export function recordCorrectionEvent(ev: CorrectionEvent) {
  const data = load();
  const sig = ctxSignature(ev.context);
  if (!data.byContext[sig]) {
    data.byContext[sig] = {
      additions: {},
      deletions: {},
      qtyFactorSum: {},
      qtyFactorCount: {},
      pairAdditions: {},
    };
  }
  const bucket = data.byContext[sig];

  for (const a of ev.added) {
    const k = normalizeKey(a.name);
    if (!k) continue;
    bucket.additions[k] = (bucket.additions[k] || 0) + 1;
  }
  for (const r of ev.removed) {
    const k = normalizeKey(r.name);
    if (!k) continue;
    bucket.deletions[k] = (bucket.deletions[k] || 0) + 1;
  }
  for (const c of ev.changed) {
    const k = normalizeKey(c.name);
    if (!k) continue;
    const from = Math.max(0.0001, safeNumber(c.fromQty, 0));
    const to = Math.max(0, safeNumber(c.toQty, 0));
    const factor = Math.max(0.2, Math.min(5, to / from));
    bucket.qtyFactorSum[k] = (bucket.qtyFactorSum[k] || 0) + factor;
    bucket.qtyFactorCount[k] = (bucket.qtyFactorCount[k] || 0) + 1;
  }

  // Pair additions: if user adds A while B exists in final estimate (approx)
  // Caller may precompute "present" set; here we keep it lightweight and skip.

  // Mark cache as bad if there were notable corrections
  const totalEdits = ev.added.length + ev.removed.length + ev.changed.length;
  if (ev.cacheKey && totalEdits >= 3) {
    markBadCacheKey(ev.cacheKey, 'Пользователь внёс значимые правки');
  }

  data.updatedAt = new Date().toISOString();
  save(data);
}

export function markBadCacheKey(cacheKey: string, reason?: string, ttlMs = 7 * 24 * 60 * 60 * 1000) {
  const data = load();
  const now = Date.now();
  const until = now + ttlMs;
  const existing = data.badCacheKeys[cacheKey];
  data.badCacheKeys[cacheKey] = {
    until: Math.max(until, existing?.until || 0),
    count: (existing?.count || 0) + 1,
    reason: reason || existing?.reason,
  };
  data.updatedAt = new Date().toISOString();
  save(data);

  // In-memory invalidation too
  aiCache.markBad(cacheKey, ttlMs, reason);
}

export function isCacheKeyBad(cacheKey: string): boolean {
  const data = load();
  const entry = data.badCacheKeys[cacheKey];
  if (!entry) return false;
  return Date.now() < entry.until;
}

export function getLearningHints(ctx: LearningContext): string[] {
  const data = load();
  const sig = ctxSignature(ctx);
  const bucket = data.byContext[sig];
  if (!bucket) return [];

  const top = (obj: Record<string, number>, n = 8) => Object.entries(obj)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);

  const additions = top(bucket.additions, 6);
  const deletions = top(bucket.deletions, 6);

  const qtyTweaks = Object.entries(bucket.qtyFactorCount)
    .map(([k, c]) => {
      const sum = bucket.qtyFactorSum[k] || 0;
      const avg = c > 0 ? sum / c : 1;
      return { k, c, avg };
    })
    .filter(x => x.c >= 2 && Math.abs(x.avg - 1) >= 0.15)
    .sort((a, b) => Math.abs(b.avg - 1) - Math.abs(a.avg - 1))
    .slice(0, 6);

  const hints: string[] = [];
  if (additions.length) {
    hints.push(`Частые добавления пользователями (учти, если уместно): ${additions.map(([k, c]) => `${k} (${c})`).join(', ')}`);
  }
  if (deletions.length) {
    hints.push(`Частые удаления пользователями (избегай лишнего): ${deletions.map(([k, c]) => `${k} (${c})`).join(', ')}`);
  }
  if (qtyTweaks.length) {
    hints.push(`Типичные правки количеств: ${qtyTweaks.map(x => `${x.k}: множитель ~${x.avg.toFixed(2)} (n=${x.c})`).join(', ')}`);
  }

  return hints;
}

export function maybeRecordCorrectionFromSession(opts: {
  baselineItems: EstimateItem[];
  finalItems: EstimateItem[];
  context: LearningContext;
  cacheKey?: string;
}): CorrectionEvent | null {
  const { added, removed, changed } = diffItems(opts.baselineItems || [], opts.finalItems || []);
  const total = added.length + removed.length + changed.length;
  if (total === 0) return null;

  const ev: CorrectionEvent = {
    at: new Date().toISOString(),
    context: opts.context,
    cacheKey: opts.cacheKey,
    added,
    removed,
    changed,
  };
  recordCorrectionEvent(ev);
  return ev;
}

export function buildLearningContextFromEstimate(e: Estimate, extra?: Partial<LearningContext>): LearningContext {
  return {
    area: e.area,
    buildingType: e.buildingType,
    region: (e as any).region || extra?.region,
    projectTemplateId: extra?.projectTemplateId,
    projectTemplateName: extra?.projectTemplateName,
    scopeDescription: extra?.scopeDescription,
  };
}
