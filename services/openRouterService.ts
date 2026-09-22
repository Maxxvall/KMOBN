import { Estimate, EstimateCategory, EstimateItem, EstimateStatus, EstimateSubgroup, GenerationParams, Material, Work, normalizeKey, safeNumber, SectionId } from '../types';
import { aiCache } from './aiCache';
import { AI_CONFIG, getAIRequestHeaders, getAIRequestUrl, hasOpenRouterKey } from './aiConfig';
import { analyzeHistoricalPatterns, buildDependencyGraph, buildPromptInsights, filterToLatestEstimateVersions, pickFewShotExamples, scoreEstimateQuality } from './estimateIntelligence';
import { checkNormAnomalies, computeNormExpectations } from './constructionNorms';
import { getLearningHints, isCacheKeyBad } from './aiLearning';
import { buildSp31_105_2002SystemMessage, containsSp31Reference } from './sp31_105_2002';
import { CATALOG_CATEGORIES, normalizeEstimateCategory } from './estimateSections';
import { fingerprintData } from './hashing';
import { normalizeMeasurementUnit, parsePackAreaSqM } from './aiMeasurements';
import { deriveAIProjectScope, filterItemsToAIProjectScope } from './aiProjectSpec';

export interface AIEstimateRequest {
  area: number;
  buildingType: string;
  region: string;
  signal?: AbortSignal;
  projectTemplateId?: string;
  projectTemplateName?: string;
  templateItems?: EstimateItem[];
  scopeDescription?: string;
  historicalEstimates: Estimate[];
  existingItems?: EstimateItem[];
  materials: Material[];
  works: Work[];

  // Если true — поиск цены через AI отключён (оставлено для обратной совместимости).
  enableAiPriceSearch?: boolean;

  /** ID эталонной сметы, выбранной пользователем в визарде */
  referenceEstimateId?: string;
  /** Выбранные пользователем разделы (если не указаны — все) */
  selectedSections?: SectionId[];
  /** Кол-во окон, указанное пользователем в визарде */
  windowCount?: number;
  /** Кол-во дверей, указанное пользователем в визарде */
  doorCount?: number;
}

export type CatalogMismatchItem = {
  name: string;
  unit: string;
  quantity: number;
  price: number;
  category: SectionId;
  subgroup: EstimateSubgroup;
};

export type AIGenerationStatus = 'success' | 'needs_clarification' | 'partial' | 'unavailable' | 'cancelled';
export type AIGenerationSource = 'model' | 'rules' | 'template';

export type AIEstimateResult = {
  status: AIGenerationStatus;
  source: AIGenerationSource;
  items: EstimateItem[];
  total: number;
  suggestions: string[];
  warnings: string[];
  pricing: {
    status: 'complete' | 'incomplete';
    unknownItemIds: string[];
  };
  /** Позиции, которые AI хотел добавить, но не нашёл в справочниках */
  notInDbItems?: CatalogMismatchItem[];
  /** Exact generation input identity used for feedback invalidation. */
  cacheKey?: string;
};

const AI_PIPELINE_VERSION = '2026-09-22.2';

type OpenRouterChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

class NonRetryableAIError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NonRetryableAIError';
  }
}

const MATERIAL_KEYWORDS = [
  'пиломат',
  'утепл',
  'фанер',
  'линоли',
  'террас',
  'паро',
  'пароизоля',
  'гвозд',
  'саморез',
  'крепеж',
  'доска',
  'плит',
  'брус',
  'грунт',
  'песк',
  'цемент',
  'керамзит',
  'щебень',
  'пена',
  'ковер',
  'подкладоч',
  'андереп',
  'техноник',
  'мембран',
  'гидроизоля',
];

const DELIVERY_KEYWORDS = ['достав', 'доставка', 'транспорт', 'перевоз', 'курьер'];

const createAbortError = () => new DOMException('The operation was aborted.', 'AbortError');

const isAbortError = (error: unknown): boolean => {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && error.name === 'AbortError';
};

const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal?.aborted) {
    reject(createAbortError());
    return;
  }

  const timeoutId = setTimeout(() => {
    signal?.removeEventListener('abort', handleAbort);
    resolve();
  }, ms);

  const handleAbort = () => {
    clearTimeout(timeoutId);
    signal?.removeEventListener('abort', handleAbort);
    reject(createAbortError());
  };

  signal?.addEventListener('abort', handleAbort, { once: true });
});

const retryAfterMs = (response: Response, fallbackMs: number): number => {
  const raw = response.headers?.get?.('Retry-After')?.trim();
  if (!raw) return fallbackMs;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(30_000, seconds * 1000);
  const at = Date.parse(raw);
  if (Number.isFinite(at)) return Math.min(30_000, Math.max(0, at - Date.now()));
  return fallbackMs;
};

const normalizeUnitText = (unitRaw: string): string => {
  return normalizeMeasurementUnit(unitRaw) || 'шт';
};

const parsePackAreaSqMFromName = parsePackAreaSqM;

const looksLikePackOrRoll = (nameRaw: string): boolean => {
  const n = String(nameRaw || '').toLowerCase();
  return (
    n.includes('рулон') ||
    n.includes('пач') ||
    n.includes('упак') ||
    n.includes('уп.') ||
    n.includes('ковер') ||
    n.includes('подкладоч') ||
    n.includes('андереп') ||
    n.includes('техноник') ||
    n.includes('мембран') ||
    n.includes('утепл') ||
    /\b\d+\s*[x×]\s*\d+\b/i.test(n) ||
    n.includes('мм')
  );
};

const computePackQuantityWithReserve = (area: number, packArea: number): number => {
  const base = Math.max(1, Math.ceil(area / packArea));
  const reserve = base > 2 ? 2 : 0;
  return base + reserve;
};

export const applySmartPackagingRules = (items: EstimateItem[], projectArea?: number): EstimateItem[] => {
  const area = safeNumber(projectArea, 0);
  return (items || []).map((it) => {
    const packArea = parsePackAreaSqMFromName(it.name);
    if (!packArea) return { ...it, unit: normalizeUnitText(it.unit) };

    const unit = normalizeUnitText(it.unit);
    const quantity = safeNumber(it.quantity, 0);
    const packLike = looksLikePackOrRoll(it.name);

    if (!packLike) {
      return { ...it, unit };
    }

    const coverageArea = area > 0 ? getCoverageArea(it.category, area) : 0;
    const suggestedFromArea = coverageArea > 0 ? computePackQuantityWithReserve(coverageArea, packArea) : null;

    if (suggestedFromArea !== null) {
      const diffRatio = suggestedFromArea > 0 ? Math.abs(quantity - suggestedFromArea) / suggestedFromArea : 0;
      const isClearlyOff = quantity <= 0 || quantity >= suggestedFromArea * 1.3 || diffRatio > 0.35 || quantity > suggestedFromArea + 4;

      if (isClearlyOff || unit !== 'шт') {
        return { ...it, unit: 'шт', quantity: suggestedFromArea, total: (it.price || 0) * suggestedFromArea };
      }

      return { ...it, unit: 'шт' };
    }

    if (unit === 'м2' && quantity > 0) {
      const fallbackQty = Math.max(1, Math.round(quantity / packArea));
      return { ...it, unit: 'шт', quantity: fallbackQty, total: (it.price || 0) * fallbackQty };
    }

    return { ...it, unit };
  });
};

export const sanitizeQuantities = (
  items: EstimateItem[],
  _floorArea: number,
): EstimateItem[] => {
  return items.map(it => {
    const quantity = Math.max(0, safeNumber(it.quantity, 0));
    const subgroup = it.subgroup;

    if (subgroup === EstimateSubgroup.DELIVERY) {
      return { ...it, quantity: 1, unit: 'шт' };
    }

    return { ...it, quantity, total: quantity * safeNumber(it.price, 0) };
  });
};

const extractFirstJsonLikeSubstring = (text: string): string => {
  const s = (text || '').trim();
  if (!s) return '';
  const startObj = s.indexOf('{');
  const startArr = s.indexOf('[');
  const start = startObj >= 0 ? startObj : (startArr >= 0 ? startArr : -1);
  if (start < 0) return s;

  const stack: Array<'{' | '['> = [];
  let inString = false;
  let quote: '"' | "'" | null = null;
  let escape = false;

  for (let i = start; i < s.length; i++) {
    const ch = s[i];

    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\') {
        escape = true;
        continue;
      }
      if (quote && ch === quote) {
        inString = false;
        quote = null;
        continue;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = true;
      quote = ch as any;
      continue;
    }

    if (ch === '{' || ch === '[') {
      stack.push(ch);
      continue;
    }
    if (ch === '}' || ch === ']') {
      const top = stack[stack.length - 1];
      const ok = (ch === '}' && top === '{') || (ch === ']' && top === '[');
      if (ok) {
        stack.pop();
        if (stack.length === 0) {
          return s.slice(start, i + 1).trim();
        }
      }
    }
  }

  if (stack.length > 0) {
    const closings = stack
      .slice()
      .reverse()
      .map(ch => (ch === '{' ? '}' : ']'))
      .join('');
    return `${s.slice(start).trim()}${closings}`;
  }

  return s.slice(start).trim();
};

const escapeRawNewlinesInStrings = (text: string): string => {
  // Some models emit literal newlines inside JSON strings which breaks JSON.parse.
  const s = String(text || '');
  let out = '';
  let inString = false;
  let quote: '"' | "'" | null = null;
  let escape = false;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];

    if (inString) {
      if (escape) {
        out += ch;
        escape = false;
        continue;
      }
      if (ch === '\\') {
        out += ch;
        escape = true;
        continue;
      }
      if (quote && ch === quote) {
        out += ch;
        inString = false;
        quote = null;
        continue;
      }
      if (ch === '\n') {
        out += '\\n';
        continue;
      }
      if (ch === '\r') {
        // drop CR
        continue;
      }
      const code = ch.charCodeAt(0);
      if (code < 0x20) {
        // Replace other control chars inside strings
        out += ' ';
        continue;
      }
      out += ch;
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = true;
      quote = ch as any;
      out += ch;
      continue;
    }

    out += ch;
  }

  return out;
};

const normalizeJsonFromLLM = (text: string): string => {
  const trimmed = (text || '').trim();
  if (!trimmed) return '';

  // Strip ```json fences
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenceMatch ? fenceMatch[1].trim() : trimmed;

  // Extract first JSON object/array even if extra prose is present
  return extractFirstJsonLikeSubstring(candidate);
};

const tryParseJsonWithHeuristics = (text: string): { obj: any | null; cleanedText?: string } => {
  // Normalize some whitespace / non-breaking spaces
  const base = escapeRawNewlinesInStrings(String(text || '')).replace(/\u00A0/g, ' ').trim();

  // Try raw
  try {
    return { obj: JSON.parse(base) };
  } catch {
    // continue to heuristics
  }

  // Heuristic 1: remove trailing commas before } or ]
  let t = base.replace(/,\s*([}\]])/g, '$1');

  // Heuristic 2: replace smart quotes and non-standard quotes
  t = t.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");

  // Heuristic 3: attempt to convert single-quoted strings to double quotes when safe
  try {
    const singleQuoted = t.replace(/'([^']*)'/g, '"$1"');
    t = singleQuoted;
  } catch {
    // ignore
  }

  try {
    return { obj: JSON.parse(t), cleanedText: t };
  } catch {
    return { obj: null, cleanedText: t };
  }
};

const classifySubgroup = (name: string, unit?: string): EstimateSubgroup => {
  if (!name) return EstimateSubgroup.WORKS;
  const lower = name.toLowerCase();

  if (DELIVERY_KEYWORDS.some(kw => lower.includes(kw))) return EstimateSubgroup.DELIVERY;
  if (MATERIAL_KEYWORDS.some(kw => lower.includes(kw))) return EstimateSubgroup.MATERIALS;

  const materialUnits = ['шт', 'пог', 'пог.м', 'м.п.', 'м.п', 'куб', 'куб.', 'м3'];
  if (unit && materialUnits.some(u => unit.toLowerCase().includes(u))) {
    if (unit.toLowerCase().includes('шт') || unit.toLowerCase().includes('куб') || unit.toLowerCase().includes('м3')) {
      return EstimateSubgroup.MATERIALS;
    }
  }

  return EstimateSubgroup.WORKS;
};

const SYSTEM_PROMPT = `Ты - эксперт по составлению строительных смет.
ВСЕГДА отвечай строго на русском языке. Никогда не используй английский.
Ты работаешь как для "дома под ключ", так и для частичных смет (например: только работы, ремонт крыши, отделка, без электрики/сантехники и т.п.).

Твоя задача: предлагать позиции сметы на основе:
1) Параметров проекта (площадь, тип объекта/строения, регион)
2) Истории похожих смет
3) Справочников материалов и работ

ЖЁСТКИЕ правила:
- ПРИОРИТЕТ ИСТОРИЧЕСКИХ ДАННЫХ:
  - История похожих смет содержит согласованные версии реальных проектов, но не является инженерной экспертизой.
  - Если в истории/паттернах есть позиция с частотой ≥ 50% похожих проектов — включи её, если это не противоречит описанию сметы и справочникам.
  - Количества из истории трактуй как реальный ориентир и масштабируй под текущую площадь (не копируй 1:1, а нормируй на площадь).
  - При конфликте между «логическими рассуждениями» и историей — предпочитай историю, но не нарушай справочники.

- Используй названия ТОЛЬКО из переданных списков материалов и работ. Если модель не знает точное название, просто оставь его пустым или заменяй на ближайшее совпадение.
- В тексте ответа никогда не придумывай новые названия. Только те, которые уже есть в списках.
- РАБОТА СО СПРАВОЧНИКАМИ (критически важно):
  - Справочник материалов и работ — ЕДИНСТВЕННЫЙ источник корректных названий.
  - ЗАПРЕЩЕНО выдумывать названия, даже если они кажутся «логичными».
  - Если не уверен в точном названии:
    1) ищи по ключевым словам в справочнике,
    2) выбирай наиболее близкое совпадение (ориентир: ≥ 70% совпадения токенов),
    3) если нет приемлемого совпадения — ПРОПУСТИ позицию и добавь предупреждение в warnings.
- НЕ задавай цены: поле price всегда 0.
- Кол-во (quantity) строго масштабируй под указанную площадь.
- Тебе могут дать: 1) исторические паттерны (корреляции/соотношения), 2) несколько примеров хороших смет (few-shot), 3) подсказки на основе пользовательских правок. Используй их как ориентиры, но не нарушай справочники.
- КРИТИЧЕСКИЕ ЗАВИСИМОСТИ:
  - Учитывай зависимости работ и материалов: если есть работа — обычно нужны соответствующие материалы и крепёж.
  - Перед финальным JSON пройди по КАЖДОЙ работе и проверь комплектность.

- ПРАВИЛА ЕДИНИЦ ИЗМЕРЕНИЯ (строго соблюдай):
  1) Если в названии есть площадь/объём упаковки (примеры):
     - "Мембрана ветровлагозащитная 25м2" → unit: "шт", quantity: ceil(площадь_проекта / 25) + запас
     - "Утеплитель … 3 м²" → unit: "шт", quantity: ceil(площадь_проекта / 3) + запас
     - "Пароизоляция рулон 50м2" → unit: "шт", quantity: ceil(площадь_проекта / 50) + запас
  2) Если в названии есть "шт", "упак", "уп" — НИКОГДА не ставь "м2"; только "шт" или "уп".
  3) Если материал обычно измеряется в м² (листовой/рулонный):
     - если продаётся листами/упаковками → unit: "шт", quantity: количество листов/упаковок,
     - если площадью без упаковки → unit: "м2", quantity: площадь с запасом.
  4) Погонные метры (доска, брус, профиль с размерами типа "50x50x6000"):
     - unit: "м/п" ИЛИ "шт" (если указана длина одной единицы),
     - quantity: рассчитай из размеров профиля.

- ТИПИЧНЫЕ ОШИБКИ ИИ (избегай их):
  - Не ставь "м2" там, где продаётся упаковками/рулонами.
  - Не добавляй работы без крепежа/материалов.
  - Не копируй количества из истории 1:1 — масштабируй.
  - Не дублируй одинаковые позиции — суммируй.
  - Не игнорируй подсказки обучения (learning hints).
- Если смета частичная — не добавляй лишние разделы.

### ПРИМЕРЫ РАСЧЁТА КОЛИЧЕСТВА (ОБЯЗАТЕЛЬНО СЛЕДУЙ ЭТИМ ФОРМУЛАМ):

Площадь проекта = 120 м², стены ≈ 135 м² (периметр ~43м × 2.8м), крыша ≈ 156 м².

1) "Мембрана ветровлагозащитная 25 м2"
   pack area = 25 м², категория = СТЕНЫ → coverage = 135 м²
   quantity = ceil(135 / 25) + запас(2) = 6 + 2 = 8
   → unit: "шт", quantity: 8

2) "Утеплитель Кнауф 3 м²"
   pack area = 3 м², категория = СТЕНЫ → coverage = 135 м²
   quantity = ceil(135 / 3) + запас(2) = 45 + 2 = 47
   → unit: "шт", quantity: 47

3) "Подкладочная кровля 50м2"
   pack area = 50 м², категория = КРОВЛЯ → coverage = 156 м²
   quantity = ceil(156 / 50) + запас(1) = 4 + 1 = 5
   → unit: "шт", quantity: 5

4) "Пароизоляция рулон 70кв.м"
   pack area = 70 м², категория = СТЕНЫ → coverage = 135 м²
   quantity = ceil(135 / 70) + запас(1) = 2 + 1 = 3
   → unit: "шт", quantity: 3

5) "Оконный блок 1200x1400"
   → unit: "шт", quantity: = кол-во окон из визарда (например 6)

6) "Саморезы кровельные 4.8x35"
   → unit: "уп", quantity: 1-2 уп на крышу

ФОРМУЛА: quantity = ceil(coverage_area / pack_area) + запас
- запас: 1-2 шт если packs > 2, иначе 0-1
- coverage_area: СТЕНЫ = периметр×2.8, КРОВЛЯ = площадь×1.3, остальное = площадь проекта
- Работы ВСЕГДА quantity = 1 (это услуга)

Категории смет: ${CATALOG_CATEGORIES.join(', ')}

Формат ответа: ТОЛЬКО строгий JSON без поясняющего текста.
Схема:
{
  "items": [
    {
      "name": "Название из справочника",
      "unit": "Ед.изм",
      "quantity": число,
      "price": 0,
      "category": "КАТЕГОРИЯ",
      "subgroup": "Работы|Материалы|Доставка",
      "reasoning": "Короткое обоснование"
    }
  ],
  "suggestions": ["..."],
  "warnings": ["..."]
}
`;

const NORMATIVE_SYSTEM_PROMPT = buildSp31_105_2002SystemMessage();

const ensureSp31Mention = (texts: string[], fallbackLine: string): string[] => {
  if (containsSp31Reference(texts)) return texts;
  return [...texts, fallbackLine];
};

const buildAdvancedContext = (opts: {
  historicalEstimates: Estimate[];
  params: GenerationParams;
  buildingType?: string;
  region?: string;
  materials: Material[];
  works: Work[];
  scopeDescription?: string;
  projectTemplateId?: string;
  projectTemplateName?: string;
}) => {
  const latestHistory = filterToLatestEstimateVersions(opts.historicalEstimates || [])
    .filter(estimate => estimate.status === EstimateStatus.APPROVED && (estimate.items || []).length > 0);
  const graph = buildDependencyGraph(opts.materials || [], opts.works || []);
  const patterns = analyzeHistoricalPatterns(latestHistory, {
    area: opts.params.area,
    region: opts.region || opts.params.region,
    buildingType: opts.buildingType,
  });

  const insightsText = buildPromptInsights(patterns);
  const fewShot = pickFewShotExamples(
    latestHistory,
    { area: opts.params.area, region: opts.region || opts.params.region, buildingType: opts.buildingType },
    graph,
  );

  const learningHints = getLearningHints({
    area: opts.params.area,
    region: opts.region || opts.params.region,
    buildingType: opts.buildingType,
    projectTemplateId: opts.projectTemplateId,
    projectTemplateName: opts.projectTemplateName,
    scopeDescription: opts.scopeDescription,
  });

  const fewShotText = fewShot.length
    ? `ЭТАЛОННЫЕ ПРИМЕРЫ (few-shot learning) — лучшие сметы по качеству и полноте (используй структуру как образец):\n${fewShot
      .map(x => `- ${x.title}\n  Это согласованная историческая смета с внутренней оценкой структуры ${typeof x.qualityScore === 'number' ? x.qualityScore.toFixed(2) : 'N/A'}; оценка не подтверждает инженерную правильность.\n  ${JSON.stringify(x.example)}`)
      .join('\n')}`
    : '';

  const learningText = learningHints.length
    ? `Подсказки на основе пользовательских правок (обучение):\n- ${learningHints.join('\n- ')}`
    : '';

  // Dependency overview (bounded)
  const depLines: string[] = [];
  for (const w of (opts.works || []).slice(0, 1000)) {
    const edges = graph.workToMaterials.get(normalizeKey(w.name));
    if (!edges || edges.length === 0) continue;
    depLines.push(`${w.name} ⇒ ${edges.map(e => `${e.requiresName} (${e.severity})`).join(', ')}`);
    if (depLines.length >= 14) break;
  }
  const depsText = depLines.length
    ? `КРИТИЧЕСКИЕ ЗАВИСИМОСТИ (самопроверка ОБЯЗАТЕЛЬНА):\nЕсли ты добавляешь работу, АВТОМАТИЧЕСКИ проверь материалы/крепёж:\n- ${depLines.join('\n- ')}\n\nПРАВИЛО САМОПРОВЕРКИ: перед финальным ответом пройди по каждой работе и убедись, что ключевые материалы присутствуют. Если материала нет — добавь или объясни в warnings.`
    : '';

  return {
    graph,
    patterns,
    text: [insightsText, learningText, fewShotText, depsText].filter(Boolean).join('\n\n'),
  };
};

const buildMaterialsCatalog = (materials: Material[]): string => {
  // Keep context reasonably bounded: too long prompts increase failure rate.
  const maxChars = 22_000;
  let out = '';
  for (const m of (materials || [])) {
    const line = `- ${m.name} | ${m.price} ₽ | ${m.category}`;
    if ((out.length + line.length + 1) > maxChars) break;
    out += (out ? '\n' : '') + line;
  }
  return out;
};

const buildWorksCatalog = (works: Work[]): string => {
  const maxChars = 22_000;
  let out = '';
  for (const w of (works || [])) {
    const line = `- ${w.name} | ${w.price} ₽ | ${w.category}`;
    if ((out.length + line.length + 1) > maxChars) break;
    out += (out ? '\n' : '') + line;
  }
  return out;
};

async function callOpenRouterWithRetry(messages: OpenRouterChatMessage[], opts?: { temperature?: number; maxTokens?: number; cacheKey?: string; ttlMs?: number; signal?: AbortSignal }) {
  if (!hasOpenRouterKey()) {
    throw new Error('AI connection is not configured');
  }

  if (opts?.signal?.aborted) {
    throw createAbortError();
  }

  const cacheKey = opts?.cacheKey;
  if (cacheKey) {
    const cached = aiCache.get<any>(cacheKey);
    if (cached) return cached;
  }

  let lastError: unknown;
  const maxRetries = 3;

  for (let i = 0; i < maxRetries; i++) {
    try {
      if (opts?.signal?.aborted) {
        throw createAbortError();
      }

      const headers = await getAIRequestHeaders();

      const res = await fetch(getAIRequestUrl(), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: AI_CONFIG.model,
          messages,
          temperature: opts?.temperature ?? 0.7,
          max_tokens: opts?.maxTokens ?? 4000,
        }),
        signal: opts?.signal,
      });

      if (res.status === 429) {
        lastError = new Error('AI rate limit exceeded');
        await sleep(retryAfterMs(res, Math.pow(2, i) * 1000), opts?.signal);
        continue;
      }

      if (!res.ok) {
        const message = `AI provider returned HTTP ${res.status}${res.statusText ? ` (${res.statusText})` : ''}`;
        if (res.status === 408 || res.status >= 500) throw new Error(message);
        throw new NonRetryableAIError(message);
      }

      const data = await res.json();

      // Production diagnostics intentionally exclude prompts and response bodies.
      const _respContent = data?.choices?.[0]?.message?.content;
      const _promptTokens = data?.usage?.prompt_tokens;
      const _completionTokens = data?.usage?.completion_tokens;
      console.info(`[AI][callOpenRouter] model=${AI_CONFIG.model} prompt_tokens=${_promptTokens ?? '?'} completion_tokens=${_completionTokens ?? '?'} content_length=${String(_respContent || '').length}`);
      if (!_respContent || String(_respContent).trim().length === 0) {
        console.warn('[AI][callOpenRouter] Model returned empty content');
      }

      if (cacheKey) {
        aiCache.set(cacheKey, data, opts?.ttlMs ?? 30 * 60 * 1000);
      }
      return data;
    } catch (e) {
      if (isAbortError(e) || opts?.signal?.aborted) {
        throw createAbortError();
      }
      if (e instanceof NonRetryableAIError) throw e;

      lastError = e;
      if (i < maxRetries - 1) {
        await sleep(800, opts?.signal);
      }
    }
  }

  throw new Error(`OpenRouter failed after ${maxRetries} retries: ${String(lastError)}`);
}

export async function explainHouseCalculation(params: {
  deterministicSummary: string;
  historicalSummary: string;
  clientDescription?: string;
  signal?: AbortSignal;
}): Promise<string> {
  const cacheKey = aiCache.generateKey('house-calculation-review', params.deterministicSummary, params.historicalSummary, params.clientDescription || '');
  const data = await callOpenRouterWithRetry(
    [
      {
        role: 'system',
        content: 'Ты помощник по каркасному домостроению. Отвечай по-русски, кратко и практично. Нельзя менять, пересчитывать или придумывать цены и позиции: денежный расчёт уже выполнен детерминированно по сметам пользователя.',
      },
      {
        role: 'user',
        content: `Данные детерминированного расчёта:\n${params.deterministicSummary}\n\nПожелания клиента:\n${params.clientDescription || 'не указаны'}\n\nСформируй: 1) краткое объяснение результата, 2) до трёх факторов, которые сильнее всего влияют на цену, 3) до трёх уточняющих вопросов. Не называй новую цену и не добавляй новые работы или материалы.`,
      },
      {
        role: 'user',
        content: `Выполни финальную перепроверку по истории смет текущего пользователя (без персональных данных):\n${params.historicalSummary}\n\nВерни ровно четыре коротких раздела Markdown:\n1. «Итоговый вывод» — насколько пожелания соответствуют расчёту.\n2. «Предварительный расчёт» — повтори только сумму и диапазон из данных детерминированного расчёта выше.\n3. «Что перепроверено» — какие параметры и исторические сметы были сопоставлены.\n4. «Что уточнить» — до трёх вопросов или рисков.\nНельзя менять, пересчитывать или придумывать цены, диапазоны, позиции, работы или материалы.`,
      },
    ],
    { cacheKey, ttlMs: 15 * 60 * 1000, maxTokens: 650, temperature: 0.2, signal: params.signal },
  );
  const content = String(data?.choices?.[0]?.message?.content || '').trim();
  if (!content) throw new Error('Free AI вернул пустое пояснение');
  return content;
}

const parseEstimateResponse = (rawText: string, fallbackCategory?: SectionId): { items: any[]; suggestions: string[]; warnings: string[] } => {
  const normalized = normalizeJsonFromLLM(rawText);
  if (!normalized) {
    return { items: [], suggestions: [], warnings: ['AI вернул пустой ответ'] };
  }

  // First, try a straightforward parse
  let parsedObj: any = null;
  const firstTry = tryParseJsonWithHeuristics(normalized);
  if (firstTry.obj) parsedObj = firstTry.obj;

  if (!parsedObj) {
    // As a last resort, try to extract any JSON-like substring from normalized text
    const match = normalized.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (match) {
      const extracted = match[0];
      const secondTry = tryParseJsonWithHeuristics(extracted);
      if (secondTry.obj) parsedObj = secondTry.obj;
      else {
        return { items: [], suggestions: [], warnings: ['AI вернул ответ в неподдерживаемом формате.'] };
      }
    } else {
      return { items: [], suggestions: [], warnings: ['AI вернул ответ в неподдерживаемом формате.'] };
    }
  }

  const obj = parsedObj;
  const items = Array.isArray(obj?.items) ? obj.items : (Array.isArray(obj) ? obj : []);
  const suggestions = Array.isArray(obj?.suggestions) ? obj.suggestions.map(String) : [];
  const warnings = Array.isArray(obj?.warnings) ? obj.warnings.map(String) : [];

  // Fallback: if AI forgot category for all items, we still proceed.
  if (items.length > 0 && fallbackCategory) {
    for (const it of items) {
      if (!it.category) it.category = fallbackCategory;
    }
  }

  return { items, suggestions, warnings };
};

const toEstimateItems = (aiItems: any[]): EstimateItem[] => {
  const now = Date.now();
  return (aiItems || [])
    .map((it, index): EstimateItem | null => {
      const name = String(it?.name || '').trim();
      if (!name) return null;

      const unit = normalizeUnitText(String(it?.unit || 'шт'));
      const quantity = Math.max(0, safeNumber(it?.quantity, 0));
      // Price must come from catalogs in the app; never trust AI for pricing.
      const price = 0;
      const category = normalizeEstimateCategory(it?.category) || EstimateCategory.GENERAL;

      const subgroupFromAi = String(it?.subgroup || '').trim();
      const subgroup: EstimateSubgroup =
        subgroupFromAi === EstimateSubgroup.MATERIALS
          ? EstimateSubgroup.MATERIALS
          : subgroupFromAi === EstimateSubgroup.DELIVERY
            ? EstimateSubgroup.DELIVERY
            : subgroupFromAi === EstimateSubgroup.WORKS
              ? EstimateSubgroup.WORKS
              : classifySubgroup(name, unit);

      return {
        id: `ai-${now}-${index}`,
        name,
        unit,
        quantity,
        price,
        total: quantity * price,
        category,
        subgroup,
      };
    })
    .filter(Boolean) as EstimateItem[];
};

/**
 * Correct AI-generated quantities based on construction rules.
 * Applies only corrections backed by explicit project inputs or explicit units.
 */
const correctAIQuantities = (
  items: EstimateItem[],
  windowCount?: number,
  doorCount?: number,
): EstimateItem[] => {
  return items.map(it => {
    const name = it.name.toLowerCase();
    const isDelivery = it.subgroup === EstimateSubgroup.DELIVERY || /доставк|транспорт|логист|курьер/i.test(name);

    // Delivery is a single service in the current catalog. Work quantities are
    // preserved because the wizard already uses м², м/п, points and pieces.
    if (isDelivery) {
      return { ...it, quantity: 1, unit: 'шт' };
    }

    // Rule 2: Door/window related materials use user-provided counts
    if (isDoorOrWindowMaterial(name)) {
      const newQty = /окн/i.test(name) ? (windowCount ?? it.quantity) : (doorCount ?? it.quantity);
      return { ...it, quantity: Math.max(0, newQty) };
    }

    return it;
  });
};

const toEstimateItemsWithPrefix = (aiItems: any[], idPrefix: string): EstimateItem[] => {
  const now = Date.now();
  return (aiItems || [])
    .map((it, index): EstimateItem | null => {
      const name = String(it?.name || '').trim();
      if (!name) return null;

      const unit = normalizeUnitText(String(it?.unit || 'шт'));
      const quantity = Math.max(0, safeNumber(it?.quantity, 0));
      const price = 0;
      const category = normalizeEstimateCategory(it?.category) || EstimateCategory.GENERAL;

      const subgroupFromAi = String(it?.subgroup || '').trim();
      const subgroup: EstimateSubgroup =
        subgroupFromAi === EstimateSubgroup.MATERIALS
          ? EstimateSubgroup.MATERIALS
          : subgroupFromAi === EstimateSubgroup.DELIVERY
            ? EstimateSubgroup.DELIVERY
            : subgroupFromAi === EstimateSubgroup.WORKS
              ? EstimateSubgroup.WORKS
              : classifySubgroup(name, unit);

      return {
        id: `${idPrefix}-${now}-${index}`,
        name,
        unit,
        quantity,
        price,
        total: quantity * price,
        category,
        subgroup,
      };
    })
    .filter(Boolean) as EstimateItem[];
};

const normalizeTokens = (s: string): string[] => {
  const cleaned = normalizeKey(s)
    .replace(/[^a-zа-я0-9\s./-]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return [];

  const raw = cleaned.split(' ');
  // Drop common noise/version tokens
  return raw
    .map(t => t.trim())
    .filter(Boolean)
    .filter(t => !/^v\d+$/i.test(t))
    .filter(t => t !== 'мм' && t !== 'м' && t !== 'см');
};

const tokenOverlapScore = (aTokens: string[], bTokens: string[]): number => {
  if (aTokens.length === 0 || bTokens.length === 0) return 0;
  const aSet = new Set(aTokens);
  const bSet = new Set(bTokens);
  let common = 0;
  for (const t of aSet) if (bSet.has(t)) common++;
  // How much of A is covered by B
  return common / aSet.size;
};

const findBestCatalogMatch = (name: string, candidates: string[]): { best?: string; score: number } => {
  const aTokens = normalizeTokens(name);
  if (aTokens.length === 0) return { score: 0 };
  let best: string | undefined;
  let bestScore = 0;

  for (const c of candidates) {
    const score = tokenOverlapScore(aTokens, normalizeTokens(c));
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return { best, score: bestScore };
};

const applyCatalogPricing = (items: EstimateItem[], materials: Material[], works: Work[]): { items: EstimateItem[]; warnings: string[]; notInDbItems: CatalogMismatchItem[] } => {
  const materialIndex = new Map<string, Material>();
  const workIndex = new Map<string, Work>();
  for (const m of materials || []) materialIndex.set(normalizeKey(m.name), m);
  for (const w of works || []) workIndex.set(normalizeKey(w.name), w);

  const knownNames = new Set<string>([...materialIndex.keys(), ...workIndex.keys()]);
  const knownOriginalNames = Array.from(new Set<string>([
    ...(materials || []).map(m => m.name),
    ...(works || []).map(w => w.name),
  ]));

  const warnings: string[] = [];
  const priced: EstimateItem[] = [];
  const notInDbItems: CatalogMismatchItem[] = [];

  for (const it of items || []) {
    let resolvedName = it.name;
    let key = normalizeKey(resolvedName);
    if (!knownNames.has(key)) {
      // Try to map AI name to the closest catalog item.
      const match = findBestCatalogMatch(resolvedName, knownOriginalNames);
      if (match.best && match.score >= 0.72) {
        resolvedName = match.best;
        key = normalizeKey(resolvedName);
        warnings.push(`AI-именование сопоставлено со справочником: "${it.name}" → "${resolvedName}"`);
      } else {
        // Позиция не найдена — собираем для вкладки «Нет в БД»
        warnings.push(`Позиция не найдена в справочниках: ${it.name}. Цена = 0.`);
        const subgroup = it.subgroup || classifySubgroup(resolvedName, it.unit);
        notInDbItems.push({
          name: it.name,
          unit: it.unit || 'шт',
          quantity: it.quantity || 1,
          price: it.price || 0,
          category: it.category || EstimateCategory.GENERAL,
          subgroup,
        });
        // Still keep in items with price 0 for AI price search step
        priced.push({
          ...it,
          name: resolvedName,
          subgroup,
          price: 0,
          total: 0,
        });
        continue;
      }
    }

    const preferMaterials = it.subgroup === EstimateSubgroup.MATERIALS || it.subgroup === EstimateSubgroup.DELIVERY;
    let matched: Material | Work | undefined;

    if (preferMaterials) {
      matched = materialIndex.get(key) || workIndex.get(key);
    } else {
      matched = workIndex.get(key) || materialIndex.get(key);
    }

    if (!matched) {
      warnings.push(`Не удалось определить цену для позиции: ${resolvedName}. Цена = 0.`);
      const subgroup = it.subgroup || classifySubgroup(resolvedName, it.unit);
      priced.push({
        ...it,
        name: resolvedName,
        subgroup,
        price: 0,
        total: 0,
      });
      continue;
    }

    const price = (matched as any).price || 0;

    // Improve subgroup classification once we know catalog type.
    // Delivery stays delivery; otherwise infer by which index contains the key.
    let subgroup: EstimateSubgroup = it.subgroup || EstimateSubgroup.WORKS;
    if (subgroup !== EstimateSubgroup.DELIVERY) {
      const isMaterial = materialIndex.has(key);
      const isWork = workIndex.has(key);
      if (isMaterial && !isWork) subgroup = EstimateSubgroup.MATERIALS;
      else if (isWork && !isMaterial) subgroup = EstimateSubgroup.WORKS;
      else {
        // fallback heuristic
        subgroup = classifySubgroup(resolvedName, it.unit);
      }
    }

    priced.push({
      ...it,
      name: resolvedName,
      subgroup,
      price,
      total: (it.quantity || 0) * price,
    });
  }

  return { items: priced, warnings, notInDbItems };
};

const applyAiPriceSearchForMissingMaterials = async (opts: {
  items: EstimateItem[];
  materials: Material[];
  region: string;
}): Promise<{ items: EstimateItem[]; warnings: string[] } > => {
  const warnings: string[] = [];
  const items = [...(opts.items || [])];
  return { items, warnings };
};

// ─── Construction-aware area multipliers ─────────────────────────────────────

/** Estimate total wall surface area from floor area (perimeter * wall height). */
const estimateWallArea = (floorArea: number, wallHeight = 2.8): number => {
  // Approximate perimeter from floor area assuming roughly square footprint
  const side = Math.sqrt(Math.max(1, floorArea));
  const perimeter = side * 4;
  return Math.ceil(perimeter * wallHeight);
};

/** Estimate roof area from floor area (pitch factor ~1.3 for typical gable roof). */
const estimateRoofArea = (floorArea: number, pitchFactor = 1.3): number => {
  return Math.ceil(floorArea * pitchFactor);
};

/**
 * Get the appropriate coverage area for a material based on its category.
 * Walls use wall surface area, roof uses pitched roof area, others use floor area.
 */
const getCoverageArea = (category: SectionId, floorArea: number): number => {
  switch (category) {
    case EstimateCategory.WALLS:
      return estimateWallArea(floorArea);
    case EstimateCategory.ROOF:
      return estimateRoofArea(floorArea);
    default:
      return Math.max(1, floorArea);
  }
};

/** Detect if a material name refers to doors/windows/similar countable items. */
const isDoorOrWindowMaterial = (name: string): boolean => {
  const n = String(name || '').toLowerCase();
  return /(дверь|дверн|двер|окно|окон|стеклопакет|фурнитур|ручк|замок|петл|наличник|доборн|откос|подоконник)/.test(n);
};

/**
 * Deterministic fallback: generates estimate items directly from catalogs
 * when AI is unavailable or returns empty results.
 * Uses construction-aware logic for quantities.
 */
/**
 * Build a compact prompt for the one-shot fallback (reduced context to fit smaller models).
 */
const buildCompactOneShotPrompt = (req: AIEstimateRequest, referenceContext?: string, sectionsFilter?: string): string => {
  // Only include top-N materials and works to keep prompt small
  const maxCatalogItems = 80;
  const filteredMaterials = (req.selectedSections?.length)
    ? (req.materials || []).filter(m => req.selectedSections!.includes(m.category))
    : (req.materials || []);
  const filteredWorks = (req.selectedSections?.length)
    ? (req.works || []).filter(w => req.selectedSections!.includes(w.category))
    : (req.works || []);

  const matLines = filteredMaterials.slice(0, maxCatalogItems).map(m => `${m.name} | ${m.category}`).join('\n');
  const workLines = filteredWorks.slice(0, maxCatalogItems).map(w => `${w.name} | ${w.category}`).join('\n');

  return `Создай строительную смету. Ответ — ТОЛЬКО JSON.

Площадь: ${req.area} м². Тип: ${req.buildingType || 'не указан'}. Регион: ${req.region}.
Окон: ${req.windowCount ?? 'авто'}. Дверей: ${req.doorCount ?? 'авто'}.
${req.scopeDescription ? `Описание: ${req.scopeDescription}` : ''}
${sectionsFilter || ''}
${referenceContext || ''}

Материалы:
${matLines || 'нет данных'}

Работы:
${workLines || 'нет данных'}

Уже добавлено: ${(req.existingItems || []).map(i => i.name).join(', ') || 'нет'}

Правила:
- Используй ТОЛЬКО названия из списков выше.
- price=0 (цены подтянет приложение).
- Для работ сохраняй единицу тарифа и объём из надёжного примера. Если база тарифа неизвестна — quantity=1, unit="шт" и добавь предупреждение.
- Материалы: масштабируй quantity под площадь. Если в названии указана площадь упаковки (напр. "75 м2") — рассчитай кол-во упаковок. Для стен учитывай площадь стен (периметр × высота ~2.8м), для кровли — площадь крыши (площадь × 1.3).
- Окна/двери: используй указанное кол-во окон и дверей для соответствующих позиций.

JSON формат:
{"items":[{"name":"...","unit":"...","quantity":число,"price":0,"category":"КАТЕГОРИЯ","subgroup":"Работы|Материалы"}],"suggestions":[],"warnings":[]}`;
};

const catalogFingerprint = (materials: Material[], works: Work[]): string => fingerprintData({
  materials: (materials || []).map(item => ({
    id: item.id,
    name: item.name,
    category: item.category,
    price: item.price,
    lastUpdated: item.lastUpdated,
    updatedAt: item.updated_at,
  })),
  works: (works || []).map(item => ({
    id: item.id,
    name: item.name,
    category: item.category,
    price: item.price,
    updatedAt: item.updated_at,
  })),
});

const estimateItemsFingerprint = (items: EstimateItem[]): string => fingerprintData((items || []).map(item => ({
  id: item.id,
  name: item.name,
  unit: item.unit,
  quantity: item.quantity,
  price: item.price,
  category: item.category,
  subgroup: item.subgroup,
})).sort((left, right) => `${left.category}:${left.name}:${left.id}`.localeCompare(`${right.category}:${right.name}:${right.id}`, 'ru')));

const historyFingerprint = (estimates: Estimate[]): string => fingerprintData((estimates || []).map(estimate => ({
  id: estimate.id,
  estimateNumber: estimate.estimateNumber,
  version: estimate.version,
  status: estimate.status,
  updatedAt: estimate.updated_at,
  region: estimate.region,
  buildingType: estimate.buildingType,
  area: estimate.area,
  items: estimateItemsFingerprint(estimate.items || []),
})).sort((left, right) => left.id.localeCompare(right.id)));

export const createEstimateGenerationCacheKey = (req: AIEstimateRequest): string => aiCache.generateKey(
  'estimate',
  AI_PIPELINE_VERSION,
  AI_CONFIG.model,
  {
    area: req.area,
    region: req.region,
    buildingType: req.buildingType,
    projectTemplateId: req.projectTemplateId || null,
    projectTemplateName: req.projectTemplateName || null,
    referenceEstimateId: req.referenceEstimateId || null,
    selectedSections: req.selectedSections ? [...req.selectedSections].sort() : null,
    scopeDescription: req.scopeDescription || null,
    windowCount: req.windowCount ?? null,
    doorCount: req.doorCount ?? null,
    enableAiPriceSearch: req.enableAiPriceSearch ?? true,
    templateItems: estimateItemsFingerprint(req.templateItems || []),
    existingItems: estimateItemsFingerprint(req.existingItems || []),
    catalogs: catalogFingerprint(req.materials || [], req.works || []),
    history: historyFingerprint(req.historicalEstimates || []),
  },
);

export async function generateEstimateWithAI(req: AIEstimateRequest): Promise<AIEstimateResult> {
  const params: GenerationParams = {
    area: req.area,
    region: req.region,
    projectTemplateId: req.projectTemplateId || '',
  };

  const templateContext = req.projectTemplateName
    ? `Выбранный шаблон проекта: ${req.projectTemplateName} (id: ${req.projectTemplateId || '—'})\n`
    : req.projectTemplateId
      ? `Выбранный шаблон проекта: id ${req.projectTemplateId}\n`
      : '';

  const scopeContext = req.scopeDescription
    ? `Назначение сметы / какие работы нужны (важно): ${req.scopeDescription}\nЕсли указано исключение (например без электрики) — не добавляй этот раздел.\n`
    : '';

  // Reference estimate — сильный пример из истории, выбранный пользователем
  const referenceEstimate = req.referenceEstimateId
    ? (req.historicalEstimates || []).find(e => e.id === req.referenceEstimateId)
    : undefined;
  const referenceContext = referenceEstimate && referenceEstimate.items?.length
    ? `ЭТАЛОННАЯ СМЕТА (выбрана пользователем как образец, площадь ${referenceEstimate.area} м², тип: ${referenceEstimate.buildingType || 'не указан'}):\n${JSON.stringify(referenceEstimate.items.map(i => ({ name: i.name, unit: i.unit, quantity: i.quantity, category: i.category, subgroup: i.subgroup })), null, 0)}\nИспользуй эту смету как основу: адаптируй количества под текущую площадь (${req.area} м²), но сохраняй структуру и набор позиций.\n`
    : '';

  // Selected sections filter
  const sectionsFilter = (req.selectedSections && req.selectedSections.length > 0)
    ? `Включай ТОЛЬКО следующие разделы/категории: ${req.selectedSections.join(', ')}. НЕ добавляй позиции из других категорий.\n`
    : '';
  const projectScope = deriveAIProjectScope(req.scopeDescription, req.selectedSections);
  const appliesSp31 = /каркас/i.test(req.buildingType || '');
  const normativeMessages: OpenRouterChatMessage[] = appliesSp31
    ? [{ role: 'system', content: NORMATIVE_SYSTEM_PROMPT }]
    : [];

  const cacheKey = createEstimateGenerationCacheKey(req);

  // Cache: only return if not marked bad by learning
  if (!isCacheKeyBad(cacheKey)) {
    const cached = aiCache.get<AIEstimateResult>(cacheKey);
    if (cached) return { ...cached, cacheKey };
  }

  if (projectScope.needsClarification.length > 0) {
    return {
      status: 'needs_clarification',
      source: 'rules',
      items: [],
      total: 0,
      suggestions: [],
      warnings: projectScope.needsClarification,
      pricing: { status: 'complete', unknownItemIds: [] },
      cacheKey,
    };
  }

  const adv = buildAdvancedContext({
    historicalEstimates: req.historicalEstimates || [],
    params,
    buildingType: req.buildingType,
    region: req.region,
    materials: req.materials,
    works: req.works,
    scopeDescription: req.scopeDescription,
    projectTemplateId: req.projectTemplateId,
    projectTemplateName: req.projectTemplateName,
  });

  // Helper to bound catalogs per category (reduces token pressure)
  const buildMaterialsCatalogForCategory = (cat: SectionId): string => {
    return buildMaterialsCatalog((req.materials || []).filter(m => m.category === cat));
  };
  const buildWorksCatalogForCategory = (cat: SectionId): string => {
    return buildWorksCatalog((req.works || []).filter(w => w.category === cat));
  };

  let parsedItems: any[] = [];
  let parsedSuggestions: string[] = [];
  let parsedWarnings: string[] = [];
  let usedCompactFallback = false;
  let failedStageBlocks = 0;

  // --- Stage 1: structure ---
  try {
    const stage1Prompt = `Этап 1/3: Структура.\n\nДанные проекта:\n- Площадь: ${req.area} м²\n- Регион: ${req.region}\n- Тип: ${req.buildingType || 'не указан'}\n- Окон: ${req.windowCount ?? 'авто'}, Дверей: ${req.doorCount ?? 'авто'}\n${templateContext}${scopeContext}${sectionsFilter}\n${referenceContext}\n${adv.text}\n\nБАЗОВЫЕ позиции из шаблона (их нужно учитывать и не дублировать):\n${req.templateItems && req.templateItems.length ? JSON.stringify(req.templateItems.map(i => ({ name: i.name, category: i.category, subgroup: i.subgroup }))) : 'нет'}\n\nУже добавленные позиции: ${(req.existingItems || []).map(i => i.name).join(', ') || 'нет'}\n\nЗадача: определить основные блоки/разделы сметы и приблизительные объёмы.\n\nВажные правила:\n- Для работ сохраняй единицу тарифа и объём из надёжного примера. Если база тарифа неизвестна — quantity=1, unit=\"шт\" и добавь предупреждение.\n- Материалы: масштабируй под площадь. Если в названии указана площадь упаковки (75 м2, 25м2, 70 кв.м) — рассчитай кол-во пачек. Для стен — площадь стен = периметр × 2.8м. Для кровли — площадь × 1.3.\n- Окна/двери: используй указанное кол-во, включая ноль.\n\nФормат ответа: строгий JSON:\n{\n  \"blocks\": [\n    {\"category\": \"КАТЕГОРИЯ\", \"intent\": \"кратко\", \"keyWorks\": [\"...\"], \"volumeHints\": {\"areaFactor\": число } }\n  ],\n  \"assumptions\": [\"...\"],\n  \"warnings\": [\"...\"]\n}\n\nПравила:\n- Если смета частичная (по описанию) — включай только нужные блоки.\n- category только из списка категорий смет.\n- keyWorks только из справочника работ (если не уверен — оставь пустым).`;

    console.info('[AI] Stage 1: sending structure request to model');
    const s1 = await callOpenRouterWithRetry(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        ...normativeMessages,
        { role: 'user', content: stage1Prompt },
      ],
      { maxTokens: 1600, temperature: 0.2, signal: req.signal },
    );
    const s1Content = String(s1?.choices?.[0]?.message?.content || '');
    console.info('[AI] Stage 1: received response (length:', String((s1Content || '').length) + ')');
    const s1Norm = normalizeJsonFromLLM(s1Content);
    const s1Parsed = tryParseJsonWithHeuristics(s1Norm);
    const s1Obj: any = s1Parsed.obj;

    const blocksRaw: any[] = Array.isArray(s1Obj?.blocks) ? s1Obj.blocks : [];
    const blocks = blocksRaw
      .map(b => ({
        category: normalizeEstimateCategory(b?.category),
        intent: String(b?.intent || '').trim(),
        keyWorks: Array.isArray(b?.keyWorks) ? b.keyWorks.map(String) : [],
        areaFactor: Number(b?.volumeHints?.areaFactor || 1) || 1,
      }))
      .filter(b => Boolean(b.category));

    // Filter blocks to only selected sections if provided by wizard
    const sectionFiltered = (req.selectedSections && req.selectedSections.length > 0)
      ? blocks.filter(b => req.selectedSections!.includes(b.category as SectionId))
      : blocks;

    const stage1Warnings = Array.isArray(s1Obj?.warnings) ? s1Obj.warnings.map(String) : [];
    const stage1Assumptions = Array.isArray(s1Obj?.assumptions) ? s1Obj.assumptions.map(String) : [];

    // Explicit user selection is authoritative: detail every selected section,
    // even when Stage 1 omitted it. Keep the historical cap only for unfiltered runs.
    const selectedSections = Array.from(new Set(req.selectedSections || []));
    const chosenBlocks = selectedSections.length > 0
      ? selectedSections.map(category => sectionFiltered.find(block => block.category === category) || ({
        category,
        intent: '',
        keyWorks: [],
        areaFactor: 1,
      }))
      : sectionFiltered.slice(0, 6);

    parsedWarnings.push(...stage1Warnings);
    if (stage1Assumptions.length) {
      parsedSuggestions.push(`Предположения (этап 1): ${stage1Assumptions.join('; ')}`);
    }

    // --- Stage 2: detail per block (parallel) ---
    const stage2Results = await Promise.allSettled(chosenBlocks.map(async block => {
      const cat = block.category as SectionId;

      const catMaterials = buildMaterialsCatalogForCategory(cat);
      const catWorks = buildWorksCatalogForCategory(cat);

      // Reference items for this category (if available)
      const refItemsForCat = referenceEstimate?.items?.filter(i => i.category === cat) || [];
      const refContext = refItemsForCat.length > 0
        ? `\nЭТАЛОН для блока ${cat} (из выбранной пользователем сметы, площадь ${referenceEstimate!.area} м²):\n${JSON.stringify(refItemsForCat.map(i => ({ name: i.name, unit: i.unit, quantity: i.quantity, subgroup: i.subgroup })), null, 0)}\nАдаптируй количества под площадь ${req.area} м².\n`
        : '';

      const stage2Prompt = `Этап 2/3: Детализация блока.\n\nБлок: ${cat}\nИнтент: ${block.intent || '—'}\nКлючевые работы (ориентир): ${block.keyWorks.join(', ') || '—'}\n\nДанные проекта: площадь ${req.area} м², регион ${req.region}, тип ${req.buildingType || 'не указан'}\nОкон: ${req.windowCount ?? 'авто'}, Дверей: ${req.doorCount ?? 'авто'}\n${scopeContext}\n${refContext}\n${adv.text}\n\nОграничения блока:\n- Генерируй ТОЛЬКО category=${cat}\n- Используй только имена из справочников\n- Для работ сохраняй единицу тарифа и объём из надёжного примера; при неизвестной базе тарифа используй quantity=1, unit=\"шт\" и добавь warning\n- Материалы: если в названии указана площадь упаковки (напр. 75 м2, 25м2, 70 кв.м) — рассчитай кол-во пачек от покрываемой площади. Для стен площадь = периметр × 2.8м, для кровли = площадь × 1.3\n- Окна/двери: используй указанное кол-во, включая ноль\n- Не дублируй уже имеющиеся позиции: ${(req.existingItems || []).map(i => i.name).join(', ') || 'нет'}\n- Учитывай базовые позиции шаблона и не дублируй их\n\nСправочник материалов (только этот раздел):\n${catMaterials || 'нет'}\n\nСправочник работ (только этот раздел):\n${catWorks || 'нет'}\n\nФормат ответа: строгий JSON по общей схеме (items/suggestions/warnings).`;

      console.info('[AI] Stage 2: sending detail request for block', cat);
      const s2 = await callOpenRouterWithRetry(
        [
          { role: 'system', content: SYSTEM_PROMPT },
          ...normativeMessages,
          { role: 'user', content: stage2Prompt },
        ],
        { maxTokens: 2200, temperature: 0.35, signal: req.signal },
      );

      const s2Content = String(s2?.choices?.[0]?.message?.content || '');
      console.info('[AI] Stage 2: received response for block', cat, '(length:', String((s2Content || '').length) + ')');
      return {
        cat,
        parsed: parseEstimateResponse(s2Content, cat),
      };
    }));

    stage2Results.forEach((result, index) => {
      const categoryLabel = String(chosenBlocks[index]?.category || 'unknown');
      if (result.status === 'fulfilled') {
        parsedItems.push(...(result.value.parsed.items || []));
        parsedSuggestions.push(...(result.value.parsed.suggestions || []));
        parsedWarnings.push(...(result.value.parsed.warnings || []));
        return;
      }

      parsedWarnings.push(`AI: блок ${categoryLabel} не обработан на этапе 2. Причина: ${String(result.reason)}`);
      failedStageBlocks += 1;
    });

    // --- Stage 3: self-check ---
    const stage3Prompt = `Этап 3/3: Самопроверка и корректировка.\n\nДанные проекта: площадь ${req.area} м², регион ${req.region}, тип ${req.buildingType || 'не указан'}\n${scopeContext}${sectionsFilter}\n\nПромежуточная смета (черновик items):\n${JSON.stringify(parsedItems, null, 0)}\n\n${adv.text}\n\nЗадача:\n1) Удалить дубли/мусорные позиции\n2) Проверить комплектность: если есть работа — добавь необходимые материалы (в рамках справочников и только если уместно по описанию сметы)\n3) Исправить явные несоответствия масштаба количеств (ориентируйся на историю и площадь)\n4) Не выходить за явно выбранные разделы.\n\nФормат ответа: строгий JSON по общей схеме (items/suggestions/warnings).`;

    console.info('[AI] Stage 3: sending self-check request to model');
    const s3 = await callOpenRouterWithRetry(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        ...normativeMessages,
        { role: 'user', content: stage3Prompt },
      ],
      { maxTokens: 2600, temperature: 0.2, signal: req.signal },
    );

    const s3Content = String(s3?.choices?.[0]?.message?.content || '');
    console.info('[AI] Stage 3: received response (length:', String((s3Content || '').length) + ')');
    const s3Parsed = parseEstimateResponse(s3Content, EstimateCategory.GENERAL);
    if (Array.isArray(s3Parsed.items) && s3Parsed.items.length > 0) {
      parsedItems = s3Parsed.items;
      parsedSuggestions.push(...(s3Parsed.suggestions || []));
      parsedWarnings.push(...(s3Parsed.warnings || []));
    }
  } catch (e) {
    if (isAbortError(e) || req.signal?.aborted) throw createAbortError();
    // If multi-stage fails, fall back to the legacy one-shot prompt.
    console.warn('[AI] Multi-stage generation failed, falling back to one-shot', e);
    parsedWarnings.push(`AI: не удалось выполнить многоэтапную генерацию, использую упрощённый режим. Причина: ${String(e)}`);
    parsedItems = [];
  }

  // Fallback 1: if multi-stage produced 0 items, try compact one-shot prompt (much smaller context)
  if (parsedItems.length === 0) {
    console.warn('[AI] Multi-stage produced 0 items, falling back to COMPACT one-shot prompt');
    parsedWarnings.push('AI: многоэтапная генерация не вернула позиций, использую упрощённый режим.');
    try {
      const compactPrompt = buildCompactOneShotPrompt(req, referenceContext, sectionsFilter);
      console.info('[AI] Compact one-shot prompt length:', compactPrompt.length, 'chars');
      const data = await callOpenRouterWithRetry(
        [
          { role: 'system', content: 'Ты эксперт по строительным сметам. Отвечай ТОЛЬКО валидным JSON без пояснений.' },
          { role: 'user', content: compactPrompt },
        ],
        { maxTokens: 4000, temperature: 0.7, signal: req.signal },
      );
      const content = data?.choices?.[0]?.message?.content;
      const parsed = parseEstimateResponse(String(content || ''), EstimateCategory.GENERAL);
      parsedItems = parsed.items;
      parsedSuggestions.push(...(parsed.suggestions || []));
      parsedWarnings.push(...(parsed.warnings || []));
      console.info('[AI] Compact one-shot fallback returned', parsedItems.length, 'items');
    } catch (fallbackErr) {
      if (isAbortError(fallbackErr) || req.signal?.aborted) throw createAbortError();
      console.error('[AI] Compact one-shot fallback also failed', fallbackErr);
      parsedWarnings.push(`AI: упрощённый режим тоже не смог сгенерировать позиции. Причина: ${String(fallbackErr)}`);
    }
  }

  // Do not disguise an AI failure as a complete estimate by adding the entire catalog.
  if (parsedItems.length === 0) {
    usedCompactFallback = true;
    if (req.signal?.aborted) throw createAbortError();
    parsedWarnings.push('AI не вернул проверяемых позиций. Изменения в смету не внесены; уточните описание или повторите запрос позже.');
  }

  // Post-processing: Correct AI quantities (works/delivery=1, windows/doors from wizard, pack areas)
  const aiItems = toEstimateItems(parsedItems);
  const scoped = filterItemsToAIProjectScope(aiItems, projectScope);
  if (scoped.dropped > 0) {
    parsedWarnings.push(`AI: удалено позиций, противоречащих выбранному составу работ: ${scoped.dropped}.`);
  }
  const correctedItems = correctAIQuantities(scoped.items, req.windowCount, req.doorCount);

  // Apply packaging rules once, then pricing.
  const rawItems = applySmartPackagingRules(correctedItems, req.area);
  const priced = applyCatalogPricing(rawItems, req.materials, req.works);
  const pricedScope = filterItemsToAIProjectScope(priced.items, projectScope);
  const notInDbScope = filterItemsToAIProjectScope(priced.notInDbItems, projectScope);
  if (pricedScope.dropped > 0) {
    parsedWarnings.push(`AI: после сверки со справочниками удалено позиций вне состава работ: ${pricedScope.dropped}.`);
  }

  // Final sanity: sanitize quantities with physical bounds
  const sanitizedItems = sanitizeQuantities(pricedScope.items, req.area);

  // New step: AI-assisted search for missing/zero prices (materials only)
  const aiPriceEnabled = req.enableAiPriceSearch ?? true;
  const pricedWithAi = aiPriceEnabled
    ? await applyAiPriceSearchForMissingMaterials({
        items: sanitizedItems,
        materials: req.materials,
        region: req.region,
      })
    : { items: sanitizedItems, warnings: [] };

  const norm = checkNormAnomalies({ area: req.area, items: pricedWithAi.items, materials: req.materials, works: req.works });
  const total = pricedWithAi.items.reduce((s, it) => s + (it.total || it.quantity * it.price), 0);
  const unknownPriceItemIds = pricedWithAi.items
    .filter(item => !Number.isFinite(item.price) || item.price <= 0)
    .map(item => item.id);

  const quality = scoreEstimateQuality(pricedWithAi.items, { graph: adv.graph, historical: adv.patterns });
  const finalWarnings = [...parsedWarnings, ...priced.warnings, ...pricedWithAi.warnings, ...norm.warnings, ...quality.notes];
  if (unknownPriceItemIds.length > 0) {
    finalWarnings.push(`Итоговая сумма неполная: у ${unknownPriceItemIds.length} позиций цена не определена. Эти позиции не считаются бесплатными.`);
  }

  const suggestionsWithNorm = appliesSp31
    ? ensureSp31Mention(
      parsedSuggestions,
      'Нормативный эталон: СП 31-105-2002 (каркасные одноквартирные дома). При выводах/ограничениях см. п. 1, п. 4.2.1, п. 5.1.3, табл. 5-1 и др. [СП 31-105-2002]',
    )
    : parsedSuggestions;

  const result: AIEstimateResult = {
    status: pricedWithAi.items.length === 0
      ? 'unavailable'
      : (usedCompactFallback || failedStageBlocks > 0 || unknownPriceItemIds.length > 0 || notInDbScope.items.length > 0)
        ? 'partial'
        : 'success',
    source: 'model',
    items: pricedWithAi.items,
    total,
    suggestions: suggestionsWithNorm,
    warnings: finalWarnings,
    pricing: {
      status: unknownPriceItemIds.length > 0 ? 'incomplete' : 'complete',
      unknownItemIds: unknownPriceItemIds,
    },
    notInDbItems: notInDbScope.items.length > 0 ? notInDbScope.items : undefined,
    cacheKey,
  };

  // Cache only if quality is above threshold and not marked bad
  if (!isCacheKeyBad(cacheKey)) {
    aiCache.setIfGood(cacheKey, result, 15 * 60 * 1000, {
      qualityScore: quality.score,
      minQuality: 0.62,
      meta: { quality, area: req.area, region: req.region, buildingType: req.buildingType },
    });
  }

  return result;
}

export async function aiAutocomplete(
  partialName: string,
  category: SectionId,
  existingItems: EstimateItem[],
  materials: Material[],
  works: Work[],
  area?: number,
  signal?: AbortSignal,
): Promise<EstimateItem[]> {
  if (!hasOpenRouterKey()) return [];
  const q = (partialName || '').trim();
  if (q.length < 3) return [];

  const prompt = `Пользователь начал вводить: "${q}"\nКатегория: ${category}\nУже добавленные позиции: ${existingItems.map(i => i.name).join(', ') || 'нет'}\n\nСправочник материалов (выжимка):\n${buildMaterialsCatalog(materials)}\n\nСправочник работ (выжимка):\n${buildWorksCatalog(works)}\n\nПредложи 5-10 вариантов завершения. Используй ТОЛЬКО названия из справочников.\nФормат ответа: ТОЛЬКО JSON массива items по схеме из системного промпта.\nprice всегда 0.\nДля quantity используй типичное значение для площади ${area || 'N/A'} м² (если площадь не указана — 1).`;

  const cacheKey = aiCache.generateKey(
    'autocomplete',
    AI_PIPELINE_VERSION,
    AI_CONFIG.model,
    q,
    category,
    area || null,
    estimateItemsFingerprint(existingItems || []),
    catalogFingerprint(materials || [], works || []),
  );
  const data = await callOpenRouterWithRetry(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
    { cacheKey, ttlMs: 10 * 60 * 1000, maxTokens: 1600, temperature: 0.3, signal },
  );

  const content = String(data?.choices?.[0]?.message?.content || '');
  // allow response to be either {items:[...]} or just [...]
  const normalized = normalizeJsonFromLLM(content);
  const parsed = tryParseJsonWithHeuristics(normalized);
  const obj: any = parsed.obj;
  if (!obj) return [];
  const items = Array.isArray(obj) ? obj : Array.isArray(obj?.items) ? obj.items : [];

  // force category to the one the UI asked for to avoid cross-category noise
  for (const it of items) {
    it.category = category;
  }

  const raw = toEstimateItems(items).slice(0, 12);
  const smart = applySmartPackagingRules(raw, area);
  return applyCatalogPricing(smart, materials, works).items;
}

export async function analyzeMissingItems(
  currentEstimate: Estimate,
  similarEstimates: Estimate[],
  materials: Material[],
  works: Work[],
  allowedCategories?: SectionId[],
  signal?: AbortSignal,
): Promise<{ missing: EstimateItem[]; optional: EstimateItem[]; reasoning: string[] }> {
  const allowed = (allowedCategories && allowedCategories.length > 0)
    ? allowedCategories
    : Array.from(new Set((currentEstimate.items || []).map(i => i.category)));

  const graph = buildDependencyGraph(materials || [], works || []);
  const patterns = analyzeHistoricalPatterns(similarEstimates || [], {
    area: currentEstimate.area,
    region: (currentEstimate as any).region || '',
    buildingType: currentEstimate.buildingType,
  });
  const insightsText = buildPromptInsights(patterns);

  const curItems = (currentEstimate.items || []).map(i => ({ name: i.name, category: i.category, subgroup: i.subgroup, quantity: i.quantity, unit: i.unit }));
  const present = new Set<string>((currentEstimate.items || []).map(i => normalizeKey(i.name)));
  const materialByName = new Map<string, Material>((materials || []).map(m => [normalizeKey(m.name), m]));

  // Norm expectations: use them both for anomaly detection and for suggesting missing materials.
  const expectations = computeNormExpectations({
    area: currentEstimate.area,
    items: currentEstimate.items || [],
    materials,
    works,
  });
  const expectationByName = new Map<string, typeof expectations[number]>();
  for (const e of expectations) expectationByName.set(normalizeKey(e.materialName), e);

  const severityRank = (s: any) => (s === 'critical' ? 0 : s === 'important' ? 1 : 2);

  const deterministicMissing: Array<{ name: string; severity: 'critical' | 'important' | 'optional'; reason: string; category?: SectionId; unit?: string; qty?: number }> = [];

  // 1) Dependency-driven missing (works -> required materials)
  for (const it of currentEstimate.items || []) {
    if (!allowed.includes(it.category)) continue;
    const isWork = (it.subgroup || EstimateSubgroup.WORKS) === EstimateSubgroup.WORKS;
    if (!isWork) continue;

    const edges = graph.workToMaterials.get(normalizeKey(it.name)) || [];
    for (const e of edges) {
      const mk = normalizeKey(e.requiresName);
      if (present.has(mk)) continue;

      const mat = materialByName.get(mk);
      const catOk = mat ? allowed.includes(mat.category) : true;
      if (!catOk) continue;

      const exp = expectationByName.get(mk);
      const qty = exp ? Math.max(1, Math.ceil(exp.expectedMin)) : 1;
      const unit = exp?.unit || 'шт';

      deterministicMissing.push({
        name: e.requiresName,
        severity: e.severity,
        reason: `Связано с работой: ${it.name}`,
        category: mat?.category,
        unit,
        qty,
      });
    }
  }

  // 2) Norm-driven missing (if expectation exists but material absent)
  for (const exp of expectations) {
    const k = normalizeKey(exp.materialName);
    if (present.has(k)) continue;
    const mat = materialByName.get(k);
    const catOk = mat ? allowed.includes(mat.category) : true;
    if (!catOk) continue;
    deterministicMissing.push({
      name: exp.materialName,
      severity: exp.severity,
      reason: `Нормативный ориентир: ${exp.note || 'ожидается при данном наборе работ'}`,
      category: mat?.category,
      unit: exp.unit,
      qty: Math.max(1, Math.ceil(exp.expectedMin)),
    });
  }

  // 3) Correlation-driven suggestions (history co-occurrence)
  for (const pair of patterns.cooccurrence || []) {
    const a = pair.a;
    const b = pair.b;
    const hasA = present.has(a);
    const hasB = present.has(b);
    if (hasA === hasB) continue;
    const missingNameKey = hasA ? b : a;
    const missingName = hasA ? b : a;
    if (present.has(missingNameKey)) continue;

    // only suggest if the item exists in catalogs
    const existsInCatalog = materialByName.has(missingNameKey) || works.some(w => normalizeKey(w.name) === missingNameKey);
    if (!existsInCatalog) continue;

    deterministicMissing.push({
      name: missingName,
      severity: 'optional',
      reason: `Часто встречается вместе с "${hasA ? a : b}" (история: сила ${pair.score.toFixed(2)})`,
    });
  }

  // De-duplicate and prioritize
  const uniq = new Map<string, { name: string; severity: 'critical' | 'important' | 'optional'; reason: string; category?: SectionId; unit?: string; qty?: number }>();
  for (const x of deterministicMissing) {
    const k = normalizeKey(x.name);
    const prev = uniq.get(k);
    if (!prev) {
      uniq.set(k, x);
      continue;
    }
    // keep the more severe / richer record
    if (severityRank(x.severity) < severityRank(prev.severity)) {
      uniq.set(k, x);
      continue;
    }
    if (!prev.category && x.category) prev.category = x.category;
    if (!prev.unit && x.unit) prev.unit = x.unit;
    if (!prev.qty && x.qty) prev.qty = x.qty;
  }

  const ordered = Array.from(uniq.values())
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity));

  const toSuggestionItem = (x: typeof ordered[number], prefix: string): EstimateItem => {
    const now = Date.now();
    return {
      id: `${prefix}-${now}-${Math.random().toString(36).slice(2)}`,
      name: x.name,
      unit: x.unit || 'шт',
      quantity: x.qty ?? 1,
      price: 0,
      total: 0,
      category: x.category || EstimateCategory.GENERAL,
      subgroup: EstimateSubgroup.MATERIALS,
    };
  };

  const deterministicMissingItems = ordered
    .filter(x => x.severity === 'critical' || x.severity === 'important')
    .map(x => toSuggestionItem(x, 'ai-missing'));
  const deterministicOptionalItems = ordered
    .filter(x => x.severity === 'optional')
    .map(x => toSuggestionItem(x, 'ai-optional'));

  const anomalyWarnings = checkNormAnomalies({ area: currentEstimate.area, items: currentEstimate.items || [], materials, works }).warnings;
  const deterministicReasoning: string[] = [];
  const appliesSp31 = /каркас/i.test(currentEstimate.buildingType || '');
  if (appliesSp31) {
    deterministicReasoning.push(
      'Нормативный эталон для каркасных домов: СП 31-105-2002 (используй при проверке конструктивных ограничений и пояснениях). [СП 31-105-2002]',
    );
  }
  if (ordered.length) {
    const crit = ordered.filter(x => x.severity === 'critical').map(x => x.name);
    const imp = ordered.filter(x => x.severity === 'important').map(x => x.name);
    const opt = ordered.filter(x => x.severity === 'optional').map(x => x.name);
    if (crit.length) deterministicReasoning.push(`КРИТИЧНО (по зависимостям/комплектности): ${crit.join(', ')}`);
    if (imp.length) deterministicReasoning.push(`ВАЖНО: ${imp.join(', ')}`);
    if (opt.length) deterministicReasoning.push(`ОПЦИОНАЛЬНО (по корреляциям/истории): ${opt.slice(0, 12).join(', ')}`);
  }
  if (anomalyWarnings.length) {
    deterministicReasoning.push(...anomalyWarnings.slice(0, 8));
  }

  // If AI is not configured, return deterministic analysis.
  if (!hasOpenRouterKey()) {
    const missing = applyCatalogPricing(applySmartPackagingRules(deterministicMissingItems, currentEstimate.area), materials, works).items;
    const optional = applyCatalogPricing(applySmartPackagingRules(deterministicOptionalItems, currentEstimate.area), materials, works).items;
    return { missing, optional, reasoning: deterministicReasoning.length ? deterministicReasoning : ['AI не настроен: использован локальный анализ зависимостей/норм.'] };
  }

  // AI augmentation (formatting + extra reasoning + quantity check).
  const prompt = `Отвечай строго на русском языке.\n\nТекущая смета может быть ЧАСТИЧНОЙ (например только работы, ремонт крыши и т.п.).\n\nТекущая смета: площадь ${currentEstimate.area} м², тип/объект: ${currentEstimate.buildingType || 'не указан'}\nКатегории, которые нужно анализировать: ${allowed.join(', ') || 'не указаны'}\n\nПозиции в текущей смете:\n${JSON.stringify(curItems)}\n\n${insightsText}\n\nПредварительный анализ (детерминированный):\n- missingCandidates: ${JSON.stringify(deterministicMissingItems.map(i => ({ name: i.name, unit: i.unit, quantity: i.quantity, category: i.category })))}\n- optionalCandidates: ${JSON.stringify(deterministicOptionalItems.map(i => ({ name: i.name, unit: i.unit, quantity: i.quantity, category: i.category })))}\n\nСправочник материалов (выжимка):\n${buildMaterialsCatalog(materials)}\n\nСправочник работ (выжимка):\n${buildWorksCatalog(works)}\n\nЗадача:\n1) Сформируй итоговый список КРИТИЧЕСКИ недостающих позиций (missing) ТОЛЬКО в рамках перечисленных категорий\n2) Сформируй итоговый список опциональных позиций (optional) ТОЛЬКО в рамках перечисленных категорий\n3) Проверь явные аномалии количеств (если материалов явно мало/много относительно работ/площади) и отметь в reasoning\n\nПравила:\n- НЕ добавляй позиции из других категорий.\n- Используй ТОЛЬКО названия из справочников.\n- price всегда 0 (цены подтянет приложение).\n\nФормат ответа: строгий JSON:\n{ \"missing\": [item...], \"optional\": [item...], \"reasoning\": [\"...\"] }`;

  const cacheKey = aiCache.generateKey(
    'missing',
    AI_PIPELINE_VERSION,
    AI_CONFIG.model,
    currentEstimate.area,
    currentEstimate.buildingType,
    currentEstimate.region || null,
    [...allowed].sort(),
    estimateItemsFingerprint(currentEstimate.items || []),
    catalogFingerprint(materials || [], works || []),
    historyFingerprint(similarEstimates || []),
  );

  // cache only if not marked bad
  const cached = !isCacheKeyBad(cacheKey) ? aiCache.get<any>(cacheKey) : null;
  const data = cached
    ? cached
    : await callOpenRouterWithRetry(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        ...(appliesSp31 ? [{ role: 'system' as const, content: NORMATIVE_SYSTEM_PROMPT }] : []),
        { role: 'user', content: prompt },
      ],
      { maxTokens: 2500, temperature: 0.2, signal },
    );

  if (!cached && !isCacheKeyBad(cacheKey)) {
    // We don't have a strong quality metric for missing-analysis; cache conservatively.
    aiCache.set(cacheKey, data, 10 * 60 * 1000, { qualityScore: 0.75 });
  }

  const content = String(data?.choices?.[0]?.message?.content || '');
  const normalized = normalizeJsonFromLLM(content);
  const parsed = tryParseJsonWithHeuristics(normalized);
  const obj: any = parsed.obj;
  if (!obj) {
    const missing = applyCatalogPricing(applySmartPackagingRules(deterministicMissingItems, currentEstimate.area), materials, works).items;
    const optional = applyCatalogPricing(applySmartPackagingRules(deterministicOptionalItems, currentEstimate.area), materials, works).items;
    return { missing, optional, reasoning: [...deterministicReasoning, 'AI не смог вернуть проверяемый структурированный ответ. Использован локальный анализ.'] };
  }

  const missingRaw = applySmartPackagingRules(
    toEstimateItemsWithPrefix(Array.isArray(obj?.missing) ? obj.missing : [], 'ai-missing'),
    currentEstimate.area,
  ).filter(item => allowed.includes(item.category));
  const optionalRaw = applySmartPackagingRules(
    toEstimateItemsWithPrefix(Array.isArray(obj?.optional) ? obj.optional : [], 'ai-optional'),
    currentEstimate.area,
  ).filter(item => allowed.includes(item.category));
  const missingAi = applyCatalogPricing(missingRaw, materials, works).items;
  const optionalAi = applyCatalogPricing(optionalRaw, materials, works).items;
  const reasoningAi = Array.isArray(obj?.reasoning) ? obj.reasoning.map(String) : [];

  // Merge AI with deterministic (ensure critical stays present)
  const mergeByName = (base: EstimateItem[], extra: EstimateItem[]) => {
    const map = new Map<string, EstimateItem>();
    for (const it of base) map.set(normalizeKey(it.name), it);
    for (const it of extra) {
      const k = normalizeKey(it.name);
      if (!map.has(k)) map.set(k, it);
    }
    return Array.from(map.values());
  };

  const missingMerged = mergeByName(missingAi, deterministicMissingItems);
  const optionalMerged = mergeByName(optionalAi, deterministicOptionalItems);

  return {
    missing: missingMerged,
    optional: optionalMerged,
    reasoning: [...deterministicReasoning, ...reasoningAi],
  };
}

