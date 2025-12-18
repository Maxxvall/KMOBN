import { EstimateCategory, EstimateItem, EstimateSubgroup, Material, Work } from '../types';

export type NormRule = {
  id: string;
  category?: EstimateCategory;
  // material name hint (substring) that will be resolved to catalog name
  materialHint: string;
  unit: string;
  // expected quantity per 1 m2 of project area (rough)
  perSqMArea: number;
  // optional: only apply if these work substrings exist in estimate
  whenWorkHintAny?: string[];
  // reserve / waste coefficient (0.05 = +5%)
  waste: number;
  severity: 'critical' | 'important' | 'optional';
  note?: string;
};

const normalizeKey = (s: string) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

const safeNumber = (v: any, fallback = 0): number => {
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : fallback;
};

const containsAny = (haystack: string, needles: string[]) => {
  const h = normalizeKey(haystack);
  return needles.some(n => h.includes(normalizeKey(n)));
};

export type NormExpectation = {
  materialName: string;
  unit: string;
  expectedMin: number;
  expectedMax: number;
  severity: 'critical' | 'important' | 'optional';
  note?: string;
};

export function getBaseNormRules(): NormRule[] {
  // Это НЕ «официальные» нормы, а практические ориентиры для поиска явных аномалий и подсказок.
  return [
    {
      id: 'wind-membrane',
      category: EstimateCategory.WALLS,
      materialHint: 'мембран',
      unit: 'м2',
      perSqMArea: 1.25,
      whenWorkHintAny: ['ветровлагозащит', 'мембран'],
      waste: 0.08,
      severity: 'critical',
      note: 'Ветровлагозащита обычно покрывает стены с запасом.',
    },
    {
      id: 'vapor-barrier',
      category: EstimateCategory.WALLS,
      materialHint: 'паро',
      unit: 'м2',
      perSqMArea: 1.2,
      whenWorkHintAny: ['утепление стен', 'пароизоля'],
      waste: 0.10,
      severity: 'important',
    },
    {
      id: 'roof-underlay',
      category: EstimateCategory.ROOF,
      materialHint: 'подкладоч',
      unit: 'м2',
      perSqMArea: 1.15,
      whenWorkHintAny: ['кровл', 'металлочереп'],
      waste: 0.10,
      severity: 'important',
    },
    {
      id: 'fasteners',
      materialHint: 'саморез',
      unit: 'уп',
      perSqMArea: 0.02,
      whenWorkHintAny: ['монтаж', 'каркас', 'кровл', 'обрешет'],
      waste: 0.0,
      severity: 'important',
      note: 'Крепёж почти всегда нужен вместе с монтажными работами.',
    },
  ];
}

const resolveCatalogNameByHint = (hint: string, materials: Material[]): string | null => {
  const h = normalizeKey(hint);
  let best: string | null = null;
  for (const m of materials || []) {
    const mk = normalizeKey(m.name);
    if (mk === h) return m.name;
    if (mk.includes(h)) best = best ?? m.name;
  }
  return best;
};

export function computeNormExpectations(opts: {
  area: number;
  items: EstimateItem[];
  materials: Material[];
  works: Work[];
  rules?: NormRule[];
}): NormExpectation[] {
  const rules = opts.rules || getBaseNormRules();
  const area = Math.max(0, safeNumber(opts.area, 0));

  const workNames = (opts.items || [])
    .filter(it => (it.subgroup || EstimateSubgroup.WORKS) === EstimateSubgroup.WORKS)
    .map(it => it.name);

  const out: NormExpectation[] = [];

  for (const r of rules) {
    if (r.category) {
      const anyInCat = (opts.items || []).some(it => it.category === r.category);
      if (!anyInCat) {
        // If category is not present at all, don't enforce
        continue;
      }
    }

    if (r.whenWorkHintAny && r.whenWorkHintAny.length) {
      const ok = workNames.some(w => containsAny(w, r.whenWorkHintAny!));
      if (!ok) continue;
    }

    const resolved = resolveCatalogNameByHint(r.materialHint, opts.materials);
    if (!resolved) continue;

    const base = area * r.perSqMArea;
    const withWaste = base * (1 + (r.waste || 0));

    // Wide range to avoid false positives
    const expectedMin = withWaste * 0.6;
    const expectedMax = Math.max(withWaste * 2.0, withWaste + 2);

    out.push({
      materialName: resolved,
      unit: r.unit,
      expectedMin,
      expectedMax,
      severity: r.severity,
      note: r.note,
    });
  }

  return out;
}

export function checkNormAnomalies(opts: {
  area: number;
  items: EstimateItem[];
  materials: Material[];
  works: Work[];
}): { warnings: string[] } {
  const exp = computeNormExpectations(opts);
  const byName = new Map<string, EstimateItem>();
  for (const it of opts.items || []) {
    byName.set(normalizeKey(it.name), it);
  }

  const warnings: string[] = [];

  for (const e of exp) {
    const it = byName.get(normalizeKey(e.materialName));
    if (!it) continue;
    const q = safeNumber(it.quantity, 0);

    if (q < e.expectedMin) {
      warnings.push(
        `${e.severity === 'critical' ? 'КРИТИЧНО' : e.severity === 'important' ? 'ВАЖНО' : 'ОПЦИОНАЛЬНО'}: похоже, мало материала "${e.materialName}" (кол-во ${q} ${it.unit}). Ожидалось порядка ${e.expectedMin.toFixed(1)}–${e.expectedMax.toFixed(1)} ${e.unit}.` +
        (e.note ? ` ${e.note}` : ''),
      );
    } else if (q > e.expectedMax) {
      warnings.push(
        `Аномалия: возможно, слишком много "${e.materialName}" (кол-во ${q} ${it.unit}). Ожидалось порядка ${e.expectedMin.toFixed(1)}–${e.expectedMax.toFixed(1)} ${e.unit}.`,
      );
    }
  }

  return { warnings };
}
