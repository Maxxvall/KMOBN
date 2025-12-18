import { Estimate, EstimateCategory, EstimateItem, EstimateSubgroup, GenerationParams, Material, Work } from '../types';
import { aiCache } from './aiCache';
import { AI_CONFIG, hasOpenRouterKey } from './aiConfig';

export interface AIEstimateRequest {
  area: number;
  buildingType: string;
  region: string;
  historicalEstimates: Estimate[];
  existingItems?: EstimateItem[];
  materials: Material[];
  works: Work[];
}

export type AIEstimateResult = {
  items: EstimateItem[];
  total: number;
  suggestions: string[];
  warnings: string[];
};

type OpenRouterChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

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
];

const DELIVERY_KEYWORDS = ['достав', 'доставка', 'транспорт', 'перевоз', 'курьер'];

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const safeNumber = (v: any, fallback = 0): number => {
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : fallback;
};

const normalizeJsonFromLLM = (text: string): string => {
  const trimmed = (text || '').trim();
  if (!trimmed) return '';

  // Strip ```json fences
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenceMatch ? fenceMatch[1].trim() : trimmed;

  // Extract first {...} block if the model adds extra text
  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return candidate.slice(firstBrace, lastBrace + 1);
  }
  return candidate;
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

const normalizeCategory = (raw: any): EstimateCategory | null => {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return null;

  const map: Array<[EstimateCategory, string[]]> = [
    [EstimateCategory.FOUNDATION, ['фундамент', 'сваи', 'свай', 'плита', 'лента']],
    [EstimateCategory.GRILLAGE, ['ростверк', 'лаги', 'полы', 'обвязка']],
    [EstimateCategory.WALLS, ['стены', 'стена', 'каркас', 'перегород']],
    [EstimateCategory.ROOF, ['кровля', 'крыша', 'потолок', 'стропил']],
    [EstimateCategory.WINDOWS, ['окна', 'двери', 'окно', 'дверь']],
    [EstimateCategory.ELECTRICAL, ['электрика', 'кабель', 'щит', 'розет', 'выключ']],
    [EstimateCategory.LOGISTICS, ['логистика', 'доставка', 'транспорт', 'перевоз']],
    [EstimateCategory.GENERAL, ['общая', 'общее', 'прочее']],
    [EstimateCategory.DEMOLITION, ['демонтаж', 'разбор', 'снос']],
  ];

  for (const [cat, keys] of map) {
    if (keys.some(k => s.includes(k))) return cat;
  }

  // Exact match for the Russian enum values
  for (const cat of Object.values(EstimateCategory)) {
    if (s === cat.toLowerCase()) return cat;
  }

  return null;
};

const SYSTEM_PROMPT = `Ты - эксперт по составлению строительных смет для каркасных домов.
Твоя задача - генерировать детальные сметы на основе:
1) Параметров проекта (площадь, тип здания, регион)
2) Истории похожих смет
3) Актуальных справочников материалов и работ

Категории смет: ФУНДАМЕНТ, РОСТВЕРК, ЛАГИ, ПОЛЫ, СТЕНЫ, КРОВЛЯ/ПОТОЛОК, ОКНА/ДВЕРИ, ЭЛЕКТРИКА, ЛОГИСТИКА, ОБЩАЯ, ДЕМОНТАЖ

Формат ответа: ТОЛЬКО строгий JSON без поясняющего текста.
Схема:
{
  "items": [
    {
      "name": "Название",
      "unit": "Ед.изм (м², шт, м.п., м3, компл.)",
      "quantity": число,
      "price": число,
      "category": "КАТЕГОРИЯ",
      "subgroup": "Работы|Материалы|Доставка",
      "reasoning": "Короткое обоснование"
    }
  ],
  "suggestions": ["..."],
  "warnings": ["..."]
}
`;

const buildHistoricalContext = (estimates: Estimate[], params: GenerationParams, buildingType?: string): string => {
  const area = params.area || 0;
  const similar = (estimates || []).filter(e => {
    if (!e?.area || area <= 0) return false;
    const areaClose = Math.abs(e.area - area) / area < 0.2;
    const typeOk = buildingType ? e.buildingType === buildingType : true;
    const regionOk = params.region ? String((e as any).region || '').toLowerCase() === String(params.region).toLowerCase() : true;
    return areaClose && typeOk && regionOk;
  });

  const freq = new Map<string, number>();
  let worksSum = 0;
  let materialsSum = 0;

  for (const est of similar) {
    for (const it of est.items || []) {
      const k = (it.name || '').trim();
      if (k) freq.set(k, (freq.get(k) || 0) + 1);
      const subtotal = it.total || (it.quantity || 0) * (it.price || 0);
      const sg = it.subgroup || EstimateSubgroup.WORKS;
      if (sg === EstimateSubgroup.MATERIALS) materialsSum += subtotal;
      else worksSum += subtotal;
    }
  }

  const mostCommon = Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([name]) => name);

  const avgArea = similar.length ? similar.reduce((s, e) => s + (e.area || 0), 0) / similar.length : 0;

  return `История похожих проектов (${similar.length} смет):\n- Средняя площадь: ${avgArea.toFixed(1)} м²\n- Частые позиции: ${mostCommon.join(', ') || 'нет данных'}\n- Суммарная стоимость работ (история): ${Math.round(worksSum).toLocaleString('ru-RU')} ₽\n- Суммарная стоимость материалов (история): ${Math.round(materialsSum).toLocaleString('ru-RU')} ₽\n`;
};

const buildMaterialsCatalog = (materials: Material[]): string => {
  const slice = (materials || []).slice(0, 300);
  return slice
    .map(m => `- ${m.name} | ${m.price} ₽ | ${m.category}`)
    .join('\n');
};

const buildWorksCatalog = (works: Work[]): string => {
  const slice = (works || []).slice(0, 300);
  return slice
    .map(w => `- ${w.name} | ${w.price} ₽ | ${w.category}`)
    .join('\n');
};

async function callOpenRouterWithRetry(messages: OpenRouterChatMessage[], opts?: { temperature?: number; maxTokens?: number; cacheKey?: string; ttlMs?: number }) {
  if (!hasOpenRouterKey()) {
    throw new Error('OpenRouter API key is not configured (VITE_OPENROUTER_API_KEY)');
  }

  const cacheKey = opts?.cacheKey;
  if (cacheKey) {
    const cached = aiCache.get<any>(cacheKey);
    if (cached) return cached;
  }

  let lastError: any;
  const maxRetries = 3;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${AI_CONFIG.apiKey}`,
        'Content-Type': 'application/json',
      };
      if (AI_CONFIG.siteUrl) headers['HTTP-Referer'] = AI_CONFIG.siteUrl;
      if (AI_CONFIG.siteName) headers['X-Title'] = AI_CONFIG.siteName;

      const res = await fetch(AI_CONFIG.baseUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: AI_CONFIG.model,
          messages,
          temperature: opts?.temperature ?? 0.7,
          max_tokens: opts?.maxTokens ?? 4000,
        }),
      });

      if (res.status === 429) {
        await sleep(Math.pow(2, i) * 1000);
        continue;
      }

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`OpenRouter error ${res.status}: ${text || res.statusText}`);
      }

      const data = await res.json();
      if (cacheKey) {
        aiCache.set(cacheKey, data, opts?.ttlMs ?? 30 * 60 * 1000);
      }
      return data;
    } catch (e) {
      lastError = e;
      if (i < maxRetries - 1) await sleep(800);
    }
  }

  throw new Error(`OpenRouter failed after ${maxRetries} retries: ${String(lastError)}`);
}

const parseEstimateResponse = (rawText: string, fallbackCategory?: EstimateCategory): { items: any[]; suggestions: string[]; warnings: string[] } => {
  const normalized = normalizeJsonFromLLM(rawText);
  if (!normalized) {
    return { items: [], suggestions: [], warnings: ['AI вернул пустой ответ'] };
  }

  let obj: any;
  try {
    obj = JSON.parse(normalized);
  } catch {
    return { items: [], suggestions: [], warnings: ['Не удалось распарсить JSON от AI'] };
  }

  const items = Array.isArray(obj?.items) ? obj.items : [];
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

      const unit = String(it?.unit || 'шт').trim() || 'шт';
      const quantity = Math.max(0, safeNumber(it?.quantity, 0));
      const price = Math.max(0, safeNumber(it?.price, 0));
      const category = normalizeCategory(it?.category) || EstimateCategory.GENERAL;

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

export async function generateEstimateWithAI(req: AIEstimateRequest): Promise<AIEstimateResult> {
  const params: GenerationParams = {
    area: req.area,
    region: req.region,
    projectTemplateId: '',
  };

  const historical = buildHistoricalContext(req.historicalEstimates || [], params, req.buildingType);
  const materialsContext = buildMaterialsCatalog(req.materials || []);
  const worksContext = buildWorksCatalog(req.works || []);

  const userPrompt = `Создай детальную смету для каркасного дома:\n- Площадь: ${req.area} м²\n- Регион: ${req.region}\n- Тип строения: ${req.buildingType || 'не указан'}\n\n${historical}\n\nДоступные материалы из справочника:\n${materialsContext}\n\nДоступные работы из справочника:\n${worksContext}\n\nУсловия:\n- Не дублируй уже добавленные позиции: ${(req.existingItems || []).map(i => i.name).join(', ') || 'нет'}\n- Выдавай реалистичные количества и цены (ориентируйся на справочники).\n`;

  const cacheKey = aiCache.generateKey('estimate', req.area, req.region, req.buildingType, (req.existingItems || []).map(i => i.name).sort());
  const data = await callOpenRouterWithRetry(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    { cacheKey, ttlMs: 15 * 60 * 1000 },
  );

  const content = data?.choices?.[0]?.message?.content;
  const parsed = parseEstimateResponse(String(content || ''), EstimateCategory.GENERAL);
  const items = toEstimateItems(parsed.items);
  const total = items.reduce((s, it) => s + (it.total || it.quantity * it.price), 0);

  return {
    items,
    total,
    suggestions: parsed.suggestions,
    warnings: parsed.warnings,
  };
}

export async function aiAutocomplete(
  partialName: string,
  category: EstimateCategory,
  existingItems: EstimateItem[],
  materials: Material[],
  works: Work[],
  area?: number,
): Promise<EstimateItem[]> {
  if (!hasOpenRouterKey()) return [];
  const q = (partialName || '').trim();
  if (q.length < 3) return [];

  const prompt = `Пользователь начал вводить: "${q}"\nКатегория: ${category}\nУже добавленные позиции: ${existingItems.map(i => i.name).join(', ') || 'нет'}\n\nСправочник материалов (выжимка):\n${buildMaterialsCatalog(materials)}\n\nСправочник работ (выжимка):\n${buildWorksCatalog(works)}\n\nПредложи 5-10 вариантов завершения. Формат ответа: ТОЛЬКО JSON массива items по схеме из системного промпта.\nДля quantity используй типичное значение для дома ${area || 'N/A'} м² (если площадь не указана — 1).`;

  const cacheKey = aiCache.generateKey('autocomplete', q, category, area || null);
  const data = await callOpenRouterWithRetry(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
    { cacheKey, ttlMs: 10 * 60 * 1000, maxTokens: 1600, temperature: 0.3 },
  );

  const content = String(data?.choices?.[0]?.message?.content || '');
  // allow response to be either {items:[...]} or just [...]
  const normalized = normalizeJsonFromLLM(content);
  let obj: any;
  try {
    obj = JSON.parse(normalized);
  } catch {
    return [];
  }
  const items = Array.isArray(obj) ? obj : Array.isArray(obj?.items) ? obj.items : [];

  // force category to the one the UI asked for to avoid cross-category noise
  for (const it of items) {
    it.category = category;
  }

  return toEstimateItems(items).slice(0, 12);
}

export async function analyzeMissingItems(
  currentEstimate: Estimate,
  similarEstimates: Estimate[],
  materials: Material[],
  works: Work[],
): Promise<{ missing: EstimateItem[]; optional: EstimateItem[]; reasoning: string[] }> {
  if (!hasOpenRouterKey()) {
    return { missing: [], optional: [], reasoning: ['AI не настроен: отсутствует VITE_OPENROUTER_API_KEY'] };
  }

  const curItems = (currentEstimate.items || []).map(i => ({ name: i.name, category: i.category, subgroup: i.subgroup }));
  const prompt = `Текущая смета (${currentEstimate.area} м², ${currentEstimate.buildingType}):\n${JSON.stringify(curItems)}\n\nПохожие проекты (${similarEstimates.length}):\n${buildHistoricalContext(similarEstimates, { area: currentEstimate.area, region: (currentEstimate as any).region || '', projectTemplateId: '' }, currentEstimate.buildingType)}\n\nСправочник материалов (выжимка):\n${buildMaterialsCatalog(materials)}\n\nСправочник работ (выжимка):\n${buildWorksCatalog(works)}\n\nОпредели:\n1) Критически важные недостающие позиции (missing)\n2) Рекомендуемые дополнительные позиции (optional)\n3) Обоснование (reasoning)\n\nФормат ответа: строгий JSON:\n{ "missing": [item...], "optional": [item...], "reasoning": ["..."] }\nГде item использует ту же схему полей что и в системном промпте.`;

  const cacheKey = aiCache.generateKey('missing', currentEstimate.area, currentEstimate.buildingType, (currentEstimate.items || []).map(i => i.name).sort());
  const data = await callOpenRouterWithRetry(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
    { cacheKey, ttlMs: 10 * 60 * 1000, maxTokens: 2500, temperature: 0.4 },
  );

  const content = String(data?.choices?.[0]?.message?.content || '');
  const normalized = normalizeJsonFromLLM(content);
  let obj: any;
  try {
    obj = JSON.parse(normalized);
  } catch {
    return { missing: [], optional: [], reasoning: ['Не удалось распарсить ответ AI (JSON).'] };
  }

  const missing = toEstimateItems(Array.isArray(obj?.missing) ? obj.missing : []);
  const optional = toEstimateItems(Array.isArray(obj?.optional) ? obj.optional : []);
  const reasoning = Array.isArray(obj?.reasoning) ? obj.reasoning.map(String) : [];

  return { missing, optional, reasoning };
}

export async function prepareTrainingData(loadAllEstimates: () => Promise<Estimate[]>): Promise<string> {
  const estimates = await loadAllEstimates();
  const trainingData = (estimates || []).map(estimate => ({
    prompt: `Создай смету для ${estimate.buildingType}, площадь ${estimate.area} м²`,
    completion: JSON.stringify({
      items: (estimate.items || []).map(item => ({
        name: item.name,
        unit: item.unit,
        quantity: item.quantity,
        price: item.price,
        category: item.category,
        subgroup: item.subgroup,
      })),
    }),
  }));

  return JSON.stringify(trainingData, null, 2);
}
