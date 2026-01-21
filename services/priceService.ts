import type { MaterialSearchSource } from '../types';
import {
    DEFAULT_API_DAILY_LIMIT,
    getCachedPriceEntry,
    getCachedPriceEntryAllowExpired,
    getPriceCacheKey,
    isEntryFresh,
} from './priceCache';

export interface SearchPriceOptions {
    source?: MaterialSearchSource;
    minPrice?: number;
    maxPrice?: number;

    // Позволяет AI сформировать более точный поисковый запрос.
    // Если задано, будет использовано вместо дефолтного `цена <materialName>`.
    // ВАЖНО: сюда лучше не добавлять site:-фильтры, их контролирует `source`.
    queryOverride?: string;

    // Для долговременного кэша и контроля квоты
    materialId?: string;
    lastUpdated?: string;
    apiDailyLimit?: number;
    fallbackPrice?: number;
    allowStaleCacheOnQuotaExceeded?: boolean;
}

export async function searchPrice(materialName: string, options: SearchPriceOptions = {}): Promise<number> {
    try {
        const apiDailyLimit = options.apiDailyLimit ?? DEFAULT_API_DAILY_LIMIT;
        const allowStaleCacheOnQuotaExceeded = options.allowStaleCacheOnQuotaExceeded ?? true;

        const cacheKey = getPriceCacheKey({
            materialId: options.materialId,
            materialName,
            source: options.source,
            minPrice: options.minPrice,
            maxPrice: options.maxPrice,
        });

        // 1) Если в localStorage есть свежая цена — возвращаем и не тратим API
        const cachedFresh = getCachedPriceEntry(cacheKey);
        if (cachedFresh && isEntryFresh(cachedFresh)) {
            console.info('[priceService] returning fresh cached price', {
                materialName,
                cacheKey,
                price: cachedFresh.price,
                timestamp: cachedFresh.timestamp,
            });
            return cachedFresh.price;
        }

        const cachedAny = allowStaleCacheOnQuotaExceeded ? getCachedPriceEntryAllowExpired(cacheKey) : null;
        if (cachedAny) return cachedAny.price;

        const fallback = typeof options.fallbackPrice === 'number' && isFinite(options.fallbackPrice) ? options.fallbackPrice : null;
        if (fallback != null) return fallback;

        console.info('[priceService] Google API поиск отключён; цена задаётся вручную', { materialName, apiDailyLimit });
        return 0;
    } catch (error) {
        console.error('[priceService] Error searching price:', { materialName, error });
        throw error;
    }
}