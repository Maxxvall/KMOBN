export type PriceCacheSource = string;

export interface PriceCacheEntry {
    price: number;
    timestamp: string; // ISO
    expiresAt: string; // ISO
    source?: PriceCacheSource;
}

export interface ApiUsageEntry {
    count: number;
    date: string; // YYYY-MM-DD
}

let currentUserId: string | null = null;

export function setCurrentUserId(userId: string | null): void {
    currentUserId = userId;
}

const getPriceCachePrefix = (): string => `price_cache_${currentUserId ?? 'anon'}_`;
const getApiUsagePrefix = (): string => `price_api_usage_${currentUserId ?? 'anon'}_`;

// Freshness: если цена моложе этого времени — считаем актуальной и не дёргаем API.
export const PRICE_FRESH_MS = 1000 * 60 * 60 * 24; // 24 часа
// TTL кэша: даже если цена «устарела», можем вернуть её при исчерпанной квоте.
export const PRICE_TTL_MS = 1000 * 60 * 60 * 48; // 48 часов

export const DEFAULT_API_DAILY_LIMIT = 100;

function isBrowser(): boolean {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function safeGetItem(key: string): string | null {
    if (!isBrowser()) return null;
    try {
        return window.localStorage.getItem(key);
    } catch {
        return null;
    }
}

function safeSetItem(key: string, value: string): void {
    if (!isBrowser()) return;
    try {
        window.localStorage.setItem(key, value);
    } catch {
        // ignore quota/security errors
    }
}

function safeRemoveItem(key: string): void {
    if (!isBrowser()) return;
    try {
        window.localStorage.removeItem(key);
    } catch {
        // ignore
    }
}

function safeJsonParse<T>(raw: string | null): T | null {
    if (!raw) return null;
    try {
        return JSON.parse(raw) as T;
    } catch {
        return null;
    }
}

export function formatTodayKey(date = new Date()): string {
    // YYYY-MM-DD
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function fnv1aHash(input: string): string {
    // короткий детерминированный хэш для ключей localStorage
    let hash = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i);
        hash = (hash * 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
}

export function getPriceCacheKey(params: {
    materialId?: string;
    materialName?: string;
    source?: string;
    minPrice?: number;
    maxPrice?: number;
}): string {
    const prefix = getPriceCachePrefix();
    if (params.materialId) return `${prefix}${params.materialId}`;

    const name = (params.materialName || '').trim().toLowerCase();
    const src = params.source || 'any';
    const min = params.minPrice == null ? '' : String(params.minPrice);
    const max = params.maxPrice == null ? '' : String(params.maxPrice);
    const raw = `${name}|${src}|${min}|${max}`;
    return `${prefix}q_${fnv1aHash(raw)}`;
}

export function getCachedPriceEntry(cacheKey: string): PriceCacheEntry | null {
    const entry = safeJsonParse<PriceCacheEntry>(safeGetItem(cacheKey));
    if (!entry) return null;

    if (!entry.timestamp || !entry.expiresAt || typeof entry.price !== 'number') {
        return null;
    }

    // Если TTL истёк — удаляем (чтобы не раздувать localStorage), но вернуть можно через allowExpired
    const expiresAtMs = Date.parse(entry.expiresAt);
    if (Number.isFinite(expiresAtMs) && Date.now() > expiresAtMs) {
        safeRemoveItem(cacheKey);
        return null;
    }

    return entry;
}

export function getCachedPriceEntryAllowExpired(cacheKey: string): PriceCacheEntry | null {
    const entry = safeJsonParse<PriceCacheEntry>(safeGetItem(cacheKey));
    if (!entry) return null;
    if (!entry.timestamp || !entry.expiresAt || typeof entry.price !== 'number') return null;
    return entry;
}

export function isEntryFresh(entry: PriceCacheEntry, nowMs = Date.now()): boolean {
    const ts = Date.parse(entry.timestamp);
    if (!Number.isFinite(ts)) return false;
    return nowMs - ts < PRICE_FRESH_MS;
}

export function setCachedPriceEntry(cacheKey: string, entry: Omit<PriceCacheEntry, 'timestamp' | 'expiresAt'> & { timestamp?: string; expiresAt?: string; ttlMs?: number }): void {
    const now = new Date();
    const ttlMs = typeof entry.ttlMs === 'number' && entry.ttlMs > 0 ? entry.ttlMs : PRICE_TTL_MS;
    const payload: PriceCacheEntry = {
        price: entry.price,
        source: entry.source,
        timestamp: entry.timestamp || now.toISOString(),
        expiresAt: entry.expiresAt || new Date(now.getTime() + ttlMs).toISOString(),
    };
    safeSetItem(cacheKey, JSON.stringify(payload));
}

export function getApiUsageKeyForDate(dateKey: string): string {
    return `${getApiUsagePrefix()}${dateKey}`;
}

export function getApiUsageToday(): ApiUsageEntry {
    const today = formatTodayKey();
    const key = getApiUsageKeyForDate(today);
    const entry = safeJsonParse<ApiUsageEntry>(safeGetItem(key));
    if (!entry || entry.date !== today || typeof entry.count !== 'number') {
        return { count: 0, date: today };
    }
    return entry;
}

export function setApiUsageToday(count: number): void {
    const today = formatTodayKey();
    const key = getApiUsageKeyForDate(today);
    const payload: ApiUsageEntry = { count: Math.max(0, Math.floor(count)), date: today };
    safeSetItem(key, JSON.stringify(payload));
}

export function incrementApiUsageToday(by = 1): number {
    const current = getApiUsageToday();
    const next = current.count + Math.max(0, Math.floor(by));
    setApiUsageToday(next);
    return next;
}

export function isApiQuotaExceeded(limit = DEFAULT_API_DAILY_LIMIT): boolean {
    const usage = getApiUsageToday();
    return usage.count >= limit;
}

export function getAvailableQuota(limit = DEFAULT_API_DAILY_LIMIT): number {
    const usage = getApiUsageToday();
    return Math.max(0, limit - usage.count);
}

export function shouldUpdatePrice(params: {
    materialId?: string;
    lastUpdated?: string | null;
    limit?: number;
    cacheKey?: string;
}): boolean {
    const limit = params.limit ?? DEFAULT_API_DAILY_LIMIT;
    if (isApiQuotaExceeded(limit)) return false;

    // 1) Если в localStorage есть свежая цена — обновлять не надо
    if (params.cacheKey) {
        const cached = getCachedPriceEntry(params.cacheKey);
        if (cached && isEntryFresh(cached)) return false;
    }

    // 2) Иначе ориентируемся по lastUpdated
    if (!params.lastUpdated) return true;
    const last = Date.parse(params.lastUpdated);
    if (!Number.isFinite(last)) return true;

    return Date.now() - last > PRICE_FRESH_MS;
}
