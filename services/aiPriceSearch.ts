import type { EstimateCategory, MaterialSearchSource } from '../types';
import { aiCache } from './aiCache';
import { AI_CONFIG, hasOpenRouterKey } from './aiConfig';
import { searchPrice, type SearchPriceOptions } from './priceService';

type OpenRouterChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type AiPriceSearchContext = {
  region?: string;
  category?: EstimateCategory;
  unit?: string;
  quantity?: number;
};

export type AiPriceSearchRequest = {
  materialName: string;
  context?: AiPriceSearchContext;

  // Prefer these as hints; AI may override.
  preferredSource?: MaterialSearchSource;
  minPriceHint?: number;
  maxPriceHint?: number;

  // For caching/quota behavior inside searchPrice
  materialId?: string;
  lastUpdated?: string;
  apiDailyLimit?: number;
  fallbackPrice?: number;
};

export type AiPriceSearchDecision = {
  query: string;
  source?: MaterialSearchSource;
  minPrice?: number;
  maxPrice?: number;
  explanation: string[];
  confidence?: number;
};

export type AiPriceSearchResult = {
  price: number;
  decision?: AiPriceSearchDecision;
  logs: string[];
  usedAi: boolean;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function callOpenRouterForJson(messages: OpenRouterChatMessage[], opts?: { temperature?: number; maxTokens?: number; cacheKey?: string; ttlMs?: number }) {
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
          temperature: opts?.temperature ?? 0.2,
          max_tokens: opts?.maxTokens ?? 800,
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

function extractJson(text: string): any {
  const s = String(text || '').trim();
  if (!s) return null;
  const match = s.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

const allowedSources: MaterialSearchSource[] = ['JUKOV_LES', 'PETROVICH', 'LEMANO_PRO', 'VSEINSTRUMENTI', 'GRANDLINE'];

const coerceFinite = (v: any): number | undefined => {
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
};

const clampRange = (minPrice?: number, maxPrice?: number): { minPrice?: number; maxPrice?: number } => {
  let min = typeof minPrice === 'number' && Number.isFinite(minPrice) ? minPrice : undefined;
  let max = typeof maxPrice === 'number' && Number.isFinite(maxPrice) ? maxPrice : undefined;
  if (min != null && max != null && min > max) [min, max] = [max, min];
  // keep sane bounds; searchPrice also enforces 50..1_000_000
  if (min != null && min < 0) min = undefined;
  if (max != null && max < 0) max = undefined;
  return { minPrice: min, maxPrice: max };
};

export async function aiPriceSearch(req: AiPriceSearchRequest): Promise<AiPriceSearchResult> {
  const logs: string[] = [];
  const materialName = String(req.materialName || '').trim();
  if (!materialName) {
    throw new Error('aiPriceSearch: materialName is required');
  }

  const ctx = req.context || {};

  if (!hasOpenRouterKey()) {
    logs.push('AI выключен/не настроен: использую обычный поиск цены.');
    const price = await searchPrice(materialName, {
      source: req.preferredSource,
      ...clampRange(req.minPriceHint, req.maxPriceHint),
      materialId: req.materialId,
      lastUpdated: req.lastUpdated,
      apiDailyLimit: req.apiDailyLimit,
      fallbackPrice: req.fallbackPrice,
    });
    return { price, logs, usedAi: false };
  }

  const cacheKey = aiCache.generateKey(
    'aiPriceSearch:decision',
    materialName.toLowerCase(),
    ctx.region || null,
    ctx.category || null,
    ctx.unit || null,
  );

  const SYSTEM = `Ты помощник по поиску цен строительных материалов.\n\nЗадача:\n1) Сформируй максимально точный поисковый запрос для Google (на русском).\n2) Опционально выбери источник (один из списка).\n3) Опционально задай диапазон цен (minPrice/maxPrice) в ₽ для валидации.\n4) Дай КОРОТКОЕ объяснение (не раскрывай пошаговые рассуждения).\n\nСписок источников (source):\n- JUKOV_LES (jukovles40.ru)\n- PETROVICH (kaluga.petrovich.ru)\n- LEMANO_PRO (kaluga.lemanapro.ru)\n- VSEINSTRUMENTI (vseinstrumenti.ru)\n- GRANDLINE (grandline.ru, каталог)\n\nПравила запроса:\n- НЕ добавляй в query site:-фильтры (это управляется полем source).\n- Добавляй характеристики из названия (размер/толщина/марка/класс/единица измерения), если они есть.\n- Учитывай регион/город из контекста (если есть) — добавь словами (например "Калуга" или "Московская область").\n- Избегай слишком общих слов ("стройматериалы", "дешево").\n\nФормат ответа: ТОЛЬКО JSON объекта:\n{\n  "query": string,\n  "source": "JUKOV_LES"|"PETROVICH"|"LEMANO_PRO"|"VSEINSTRUMENTI"|"GRANDLINE"|null,\n  "minPrice": number|null,\n  "maxPrice": number|null,\n  "explanation": string[],\n  "confidence": number\n}`;

  const user = {
    materialName,
    region: ctx.region || null,
    category: ctx.category || null,
    unit: ctx.unit || null,
    quantity: typeof ctx.quantity === 'number' && Number.isFinite(ctx.quantity) ? ctx.quantity : null,
    preferredSource: req.preferredSource || null,
    minPriceHint: req.minPriceHint ?? null,
    maxPriceHint: req.maxPriceHint ?? null,
  };

  logs.push(`AI: формирую поисковый запрос для "${materialName}"`);
  const data = await callOpenRouterForJson(
    [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: JSON.stringify(user) },
    ],
    { cacheKey, ttlMs: 12 * 60 * 60 * 1000, temperature: 0.2, maxTokens: 700 },
  );

  const content = String(data?.choices?.[0]?.message?.content || '');
  const parsed = extractJson(content);

  const decisionRaw = (parsed && typeof parsed === 'object') ? parsed : null;
  const query = String(decisionRaw?.query || '').trim();

  let source: MaterialSearchSource | undefined;
  const src = decisionRaw?.source;
  if (typeof src === 'string' && allowedSources.includes(src as any)) {
    source = src as MaterialSearchSource;
  }

  const minPrice = coerceFinite(decisionRaw?.minPrice);
  const maxPrice = coerceFinite(decisionRaw?.maxPrice);
  const range = clampRange(minPrice, maxPrice);

  const explanation: string[] = Array.isArray(decisionRaw?.explanation)
    ? decisionRaw.explanation.map((x: any) => String(x)).filter(Boolean).slice(0, 8)
    : [];

  const decision: AiPriceSearchDecision = {
    query: query || `цена ${materialName}`,
    source,
    minPrice: range.minPrice,
    maxPrice: range.maxPrice,
    explanation,
    confidence: coerceFinite(decisionRaw?.confidence),
  };

  logs.push(`AI: query = ${decision.query}`);
  if (decision.source) logs.push(`AI: source = ${decision.source}`);
  if (decision.minPrice != null || decision.maxPrice != null) {
    logs.push(`AI: диапазон = ${decision.minPrice ?? '—'}..${decision.maxPrice ?? '—'} ₽`);
  }
  if (decision.explanation.length) {
    logs.push('AI: объяснение:');
    for (const line of decision.explanation) logs.push(`- ${line}`);
  }

  const opts: SearchPriceOptions = {
    source: decision.source ?? req.preferredSource,
    minPrice: decision.minPrice ?? req.minPriceHint,
    maxPrice: decision.maxPrice ?? req.maxPriceHint,
    queryOverride: decision.query,
    materialId: req.materialId,
    lastUpdated: req.lastUpdated,
    apiDailyLimit: req.apiDailyLimit,
    fallbackPrice: req.fallbackPrice,
    allowStaleCacheOnQuotaExceeded: true,
  };

  const price = await searchPrice(materialName, opts);
  logs.push(`Итог: выбрана цена ${price.toLocaleString('ru-RU')} ₽`);

  return { price, decision, logs, usedAi: true };
}
