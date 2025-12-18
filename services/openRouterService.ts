import { Estimate, EstimateCategory, EstimateItem, EstimateSubgroup, GenerationParams, Material, Work } from '../types';
import { aiCache } from './aiCache';
import { AI_CONFIG, hasOpenRouterKey } from './aiConfig';

export interface AIEstimateRequest {
  area: number;
  buildingType: string;
  region: string;
  projectTemplateId?: string;
  projectTemplateName?: string;
  templateItems?: EstimateItem[];
  scopeDescription?: string;
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

const SYSTEM_PROMPT = `Ты - эксперт по составлению строительных смет.
Ты работаешь как для "дома под ключ", так и для частичных смет (например: только работы, ремонт крыши, отделка, без электрики/сантехники и т.п.).

Твоя задача: предлагать позиции сметы на основе:
1) Параметров проекта (площадь, тип объекта/строения, регион)
2) Истории похожих смет
3) Справочников материалов и работ

ЖЁСТКИЕ правила:
- Используй названия ТОЛЬКО из переданных списков материалов и работ. Если модель не знает точное название, просто оставь его пустым или заменяй на ближайшее совпадение.
- В тексте ответа никогда не придумывай новые названия. Только те, которые уже есть в списках.
- НЕ задавай цены: поле price всегда 0.
- Кол-во (quantity) строго масштабируй под указанную площадь.
- Если смета частичная — не добавляй лишние разделы.

Категории смет: ФУНДАМЕНТ, РОСТВЕРК, ЛАГИ, ПОЛЫ, СТЕНЫ, КРОВЛЯ/ПОТОЛОК, ОКНА/ДВЕРИ, ЭЛЕКТРИКА, ЛОГИСТИКА, ОБЩАЯ, ДЕМОНТАЖ

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
      // Price must come from catalogs in the app; never trust AI for pricing.
      const price = 0;
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

const normalizeKey = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

const applyCatalogPricing = (items: EstimateItem[], materials: Material[], works: Work[]): { items: EstimateItem[]; warnings: string[] } => {
  const materialIndex = new Map<string, Material>();
  const workIndex = new Map<string, Work>();
  for (const m of materials || []) materialIndex.set(normalizeKey(m.name), m);
  for (const w of works || []) workIndex.set(normalizeKey(w.name), w);

  const knownNames = new Set<string>([...materialIndex.keys(), ...workIndex.keys()]);

  const warnings: string[] = [];
  const priced: EstimateItem[] = [];

  for (const it of items || []) {
    const key = normalizeKey(it.name);
    if (!knownNames.has(key)) {
      warnings.push(`Пропущена позиция (нет в справочниках): ${it.name}`);
      continue;
    }

    const preferMaterials = it.subgroup === EstimateSubgroup.MATERIALS || it.subgroup === EstimateSubgroup.DELIVERY;
    let matched: Material | Work | undefined;

    if (preferMaterials) {
      matched = materialIndex.get(key) || workIndex.get(key);
    } else {
      matched = workIndex.get(key) || materialIndex.get(key);
    }

    if (!matched) {
      warnings.push(`Не удалось определить цену для позиции: ${it.name}`);
      continue;
    }

    const price = (matched as any).price || 0;
    priced.push({
      ...it,
      price,
      total: (it.quantity || 0) * price,
    });
  }

  return { items: priced, warnings };
};

export async function generateEstimateWithAI(req: AIEstimateRequest): Promise<AIEstimateResult> {
  const params: GenerationParams = {
    area: req.area,
    region: req.region,
    projectTemplateId: req.projectTemplateId || '',
  };

  const historical = buildHistoricalContext(req.historicalEstimates || [], params, req.buildingType);
  const materialsContext = buildMaterialsCatalog(req.materials || []);
  const worksContext = buildWorksCatalog(req.works || []);

  const templateContext = req.projectTemplateName
    ? `Выбранный шаблон проекта: ${req.projectTemplateName} (id: ${req.projectTemplateId || '—'})\n`
    : req.projectTemplateId
      ? `Выбранный шаблон проекта: id ${req.projectTemplateId}\n`
      : '';

  const templateItemsContext = (req.templateItems && req.templateItems.length > 0)
    ? `БАЗОВЫЕ позиции из шаблона (их нужно учитывать и не дублировать):\n${JSON.stringify(req.templateItems.map(i => ({ name: i.name, unit: i.unit, quantity: i.quantity, price: i.price, category: i.category, subgroup: i.subgroup })), null, 0)}\n`
    : '';

  const scopeContext = req.scopeDescription
    ? `Назначение сметы / какие работы нужны (важно): ${req.scopeDescription}\nЕсли указано исключение (например без электрики) — не добавляй этот раздел.\n`
    : '';

  const userPrompt = `Создай смету на основе справочников (без выдуманных позиций).\n- Площадь: ${req.area} м²\n- Регион: ${req.region}\n- Тип строения/объекта: ${req.buildingType || 'не указан'}\n${templateContext}\n${scopeContext}\n\n${historical}\n\n${templateItemsContext}\nДоступные материалы из справочника:\n${materialsContext}\n\nДоступные работы из справочника:\n${worksContext}\n\nУсловия:\n- Не дублируй уже добавленные позиции: ${(req.existingItems || []).map(i => i.name).join(', ') || 'нет'}\n- Кол-во (quantity) строго масштабируй под указанную площадь, где это применимо.\n- Поле price всегда 0 (цены подтянет приложение).\n`;

  const cacheKey = aiCache.generateKey(
    'estimate',
    req.area,
    req.region,
    req.buildingType,
    req.projectTemplateId || null,
    req.projectTemplateName || null,
    (req.existingItems || []).map(i => i.name).sort(),
  );
  const data = await callOpenRouterWithRetry(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    { cacheKey, ttlMs: 15 * 60 * 1000 },
  );

  const content = data?.choices?.[0]?.message?.content;
  const parsed = parseEstimateResponse(String(content || ''), EstimateCategory.GENERAL);
  const rawItems = toEstimateItems(parsed.items);
  const priced = applyCatalogPricing(rawItems, req.materials, req.works);
  const total = priced.items.reduce((s, it) => s + (it.total || it.quantity * it.price), 0);

  return {
    items: priced.items,
    total,
    suggestions: parsed.suggestions,
    warnings: [...parsed.warnings, ...priced.warnings],
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

  const prompt = `Пользователь начал вводить: "${q}"\nКатегория: ${category}\nУже добавленные позиции: ${existingItems.map(i => i.name).join(', ') || 'нет'}\n\nСправочник материалов (выжимка):\n${buildMaterialsCatalog(materials)}\n\nСправочник работ (выжимка):\n${buildWorksCatalog(works)}\n\nПредложи 5-10 вариантов завершения. Используй ТОЛЬКО названия из справочников.\nФормат ответа: ТОЛЬКО JSON массива items по схеме из системного промпта.\nprice всегда 0.\nДля quantity используй типичное значение для площади ${area || 'N/A'} м² (если площадь не указана — 1).`;

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

  const raw = toEstimateItems(items).slice(0, 12);
  return applyCatalogPricing(raw, materials, works).items;
}

export async function analyzeMissingItems(
  currentEstimate: Estimate,
  similarEstimates: Estimate[],
  materials: Material[],
  works: Work[],
  allowedCategories?: EstimateCategory[],
): Promise<{ missing: EstimateItem[]; optional: EstimateItem[]; reasoning: string[] }> {
  if (!hasOpenRouterKey()) {
    return { missing: [], optional: [], reasoning: ['AI не настроен: отсутствует VITE_OPENROUTER_API_KEY'] };
  }

  const curItems = (currentEstimate.items || []).map(i => ({ name: i.name, category: i.category, subgroup: i.subgroup }));
  const allowed = (allowedCategories && allowedCategories.length > 0)
    ? allowedCategories
    : Array.from(new Set((currentEstimate.items || []).map(i => i.category)));

  const prompt = `Текущая смета может быть ЧАСТИЧНОЙ (например только работы, ремонт крыши и т.п.).\n\nТекущая смета: площадь ${currentEstimate.area} м², тип/объект: ${currentEstimate.buildingType || 'не указан'}\nКатегории, которые нужно анализировать: ${allowed.join(', ') || 'не указаны'}\n\nПозиции в текущей смете:\n${JSON.stringify(curItems)}\n\nПохожие проекты (${similarEstimates.length}):\n${buildHistoricalContext(similarEstimates, { area: currentEstimate.area, region: (currentEstimate as any).region || '', projectTemplateId: '' }, currentEstimate.buildingType)}\n\nСправочник материалов (выжимка):\n${buildMaterialsCatalog(materials)}\n\nСправочник работ (выжимка):\n${buildWorksCatalog(works)}\n\nЗадача:\n1) Найди КРИТИЧЕСКИ недостающие позиции (missing) ТОЛЬКО в рамках перечисленных категорий\n2) Найди опциональные позиции (optional) ТОЛЬКО в рамках перечисленных категорий\n3) Дай краткое обоснование (reasoning)\n\nПравила:\n- НЕ добавляй позиции из других категорий.\n- Используй ТОЛЬКО названия из справочников.\n- price всегда 0 (цены подтянет приложение).\n\nФормат ответа: строгий JSON:\n{ "missing": [item...], "optional": [item...], "reasoning": ["..."] }`;

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

  const missingRaw = toEstimateItems(Array.isArray(obj?.missing) ? obj.missing : []);
  const optionalRaw = toEstimateItems(Array.isArray(obj?.optional) ? obj.optional : []);
  const missing = applyCatalogPricing(missingRaw, materials, works).items;
  const optional = applyCatalogPricing(optionalRaw, materials, works).items;
  const reasoning = Array.isArray(obj?.reasoning) ? obj.reasoning.map(String) : [];

  return { missing, optional, reasoning };
}

