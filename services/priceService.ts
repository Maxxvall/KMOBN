import type { MaterialSearchSource } from '../types';
import {
    DEFAULT_API_DAILY_LIMIT,
    getAvailableQuota,
    getCachedPriceEntry,
    getCachedPriceEntryAllowExpired,
    getPriceCacheKey,
    incrementApiUsageToday,
    isApiQuotaExceeded,
    isEntryFresh,
    setCachedPriceEntry,
} from './priceCache';

const getEnv = (key: string): string | undefined => {
    try {
        return (import.meta as any)?.env?.[key] as string | undefined;
    } catch {
        return undefined;
    }
};

// Google Custom Search API constants
const GOOGLE_API_KEY = getEnv('VITE_GOOGLE_API_KEY') || '';
const SEARCH_ENGINE_ID = getEnv('VITE_GOOGLE_CSE_ID') || '';

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

const SOURCE_QUERY: Record<MaterialSearchSource, string> = {
    JUKOV_LES: 'site:jukovles40.ru',
    PETROVICH: 'site:kaluga.petrovich.ru',
    LEMANO_PRO: 'site:kaluga.lemanapro.ru',
    VSEINSTRUMENTI: 'site:vseinstrumenti.ru',
    GRANDLINE: 'site:grandline.ru inurl:katalog',
};

export interface SearchResult {
    title: string;
    link: string;
    snippet: string;
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

        // 2) Если квота исчерпана — возвращаем старое значение (если есть), либо ошибку
        if (isApiQuotaExceeded(apiDailyLimit)) {
            const cachedAny = allowStaleCacheOnQuotaExceeded ? getCachedPriceEntryAllowExpired(cacheKey) : null;
            const fallback = typeof options.fallbackPrice === 'number' && isFinite(options.fallbackPrice) ? options.fallbackPrice : null;
            if (cachedAny) {
                console.warn('[priceService] API quota exceeded, returning cached (stale) price', {
                    materialName,
                    cacheKey,
                    price: cachedAny.price,
                    timestamp: cachedAny.timestamp,
                });
                return cachedAny.price;
            }
            if (fallback != null) {
                console.warn('[priceService] API quota exceeded, returning fallback price', { materialName, fallback });
                return fallback;
            }
            throw new Error('API quota exceeded');
        }

        if (!GOOGLE_API_KEY || !SEARCH_ENGINE_ID) {
            const cachedAny = allowStaleCacheOnQuotaExceeded ? getCachedPriceEntryAllowExpired(cacheKey) : null;
            const fallback = typeof options.fallbackPrice === 'number' && isFinite(options.fallbackPrice) ? options.fallbackPrice : null;
            if (cachedAny) return cachedAny.price;
            if (fallback != null) return fallback;
            throw new Error('Google Custom Search is not configured (VITE_GOOGLE_API_KEY, VITE_GOOGLE_CSE_ID)');
        }

        // Query for price search, focusing on Russian sites
        const override = typeof options.queryOverride === 'string' ? options.queryOverride.trim() : '';
        let query = override ? override : `цена ${materialName}`;
        if (options.source) {
            query += ` ${SOURCE_QUERY[options.source]}`;
        }

        let minAllowed = typeof options.minPrice === 'number' && isFinite(options.minPrice) ? options.minPrice : undefined;
        let maxAllowed = typeof options.maxPrice === 'number' && isFinite(options.maxPrice) ? options.maxPrice : undefined;
        if (minAllowed != null && maxAllowed != null && minAllowed > maxAllowed) {
            [minAllowed, maxAllowed] = [maxAllowed, minAllowed];
        }

        const isInAllowedRange = (p: number) => {
            if (!isFinite(p)) return false;
            if (p <= 50 || p >= 1000000) return false;
            if (minAllowed != null && p < minAllowed) return false;
            if (maxAllowed != null && p > maxAllowed) return false;
            return true;
        };
        const NUM_PER_PAGE = 10;
        // Важно для лимита API: 1 вызов Google API на 1 материал.
        const MAX_PAGES = 1;
        const PER_PAGE_DELAY_MS = 350; // небольшой интервал между страницами (если MAX_PAGES увеличат)

        const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

        // Fetch with retry/backoff and respect Retry-After header
        async function fetchWithRetry(url: string, options: RequestInit = {}, maxAttempts = 4) {
            let attempt = 0;
            while (attempt < maxAttempts) {
                attempt++;
                try {
                    const res = await fetch(url, options);
                    if (res.ok) return res;
                    if (res.status === 429) {
                        const retryAfter = res.headers.get('Retry-After');
                        const waitSec = retryAfter ? Number(retryAfter) : Math.min(2 ** attempt, 30);
                        const jitter = Math.random() * 0.5;
                        const waitMs = Math.max(500, (waitSec + jitter) * 1000);
                        console.warn('[priceService] 429 received, retrying after', waitMs, 'ms (attempt', attempt, ')');
                        await sleep(waitMs);
                        attempt++; // count extra for backoff
                        continue;
                    }
                    throw new Error(`Search API error: ${res.status}`);
                } catch (err) {
                    // network or other fetch error
                    if (attempt >= maxAttempts) throw err;
                    const backoff = Math.min(1000 * 2 ** attempt, 30000);
                    console.warn('[priceService] fetch error, backing off', backoff, 'ms', err);
                    await sleep(backoff + Math.random() * 200);
                }
            }
            throw new Error('Search API: max retry attempts reached');
        }

        const apiSearchUrl = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${SEARCH_ENGINE_ID}&q=${encodeURIComponent(query)}&num=${NUM_PER_PAGE}&start=1`;
        const apiSearchUrlMasked = apiSearchUrl.replace(/(key=)[^&]+/, '$1***');
        console.info('[priceService] searchPrice start', {
            materialName,
            query,
            apiSearchUrlMasked,
            filters: { source: options.source, minPrice: minAllowed, maxPrice: maxAllowed },
        });

        // We'll aggregate prices across multiple pages to get reliable frequency counts
        // Use per-price sets of unique links (count unique URLs per price)
        const prices: number[] = [];
        const linkSets: Record<string, Set<string>> = {};

        // Helper to add a found price together with its source link
        const pushPrice = (p: number, link: string) => {
            const rounded = Math.round(p);
            if (!isInAllowedRange(rounded)) return;
            prices.push(rounded);
            const k = String(rounded);
            if (!linkSets[k]) linkSets[k] = new Set();
            if (link) linkSets[k].add(link);
        };

        const tryPagemapPrice = (it: any): number | null => {
            try {
                const pm = it.pagemap;
                if (!pm) return null;
                // offer.price
                if (pm.offer && pm.offer.length) {
                    for (const o of pm.offer) {
                        if (o.price) {
                            const p = Number(String(o.price).replace(/[^\d.]/g, ''));
                            if (!isNaN(p)) return p;
                        }
                        if (o.pricecurrency && o.pricecurrency !== 'RUB') continue;
                    }
                }
                // aggregateoffer low/high
                if (pm.aggregateoffer && pm.aggregateoffer.length) {
                    const a = pm.aggregateoffer[0];
                    const p = a.lowprice || a.highprice;
                    if (p) {
                        const num = Number(String(p).replace(/[^\d.]/g, ''));
                        if (!isNaN(num)) return num;
                    }
                }
                // metatags: product:price:amount or product:price
                if (pm.metatags && pm.metatags.length) {
                    for (const mt of pm.metatags) {
                        const candidates = ['product:price:amount', 'product:price', 'price', 'product:priceamount', 'product:price:currency', 'og:price:amount'];
                        for (const key of candidates) {
                            if (mt[key]) {
                                const num = Number(String(mt[key]).replace(/[^\d.]/g, ''));
                                if (!isNaN(num) && num > 0) return num;
                            }
                        }
                    }
                }
                // hproduct or product.price fields
                if (pm.product && pm.product.length) {
                    for (const pr of pm.product) {
                        if (pr.price) {
                            const num = Number(String(pr.price).replace(/[^\d.]/g, ''));
                            if (!isNaN(num) && num > 0) return num;
                        }
                    }
                }
            } catch (e) {
                console.debug('[priceService] pagemap parse error', e);
            }
            return null;
        };

        // Fetch pages (start=1,11,...) with backoff
        for (let page = 0; page < MAX_PAGES; page++) {
            const startIndex = page * NUM_PER_PAGE + 1;
            const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${SEARCH_ENGINE_ID}&q=${encodeURIComponent(query)}&num=${NUM_PER_PAGE}&start=${startIndex}`;
            const maskedUrl = url.replace(/(key=)[^&]+/, '$1***');
            console.debug('[priceService] fetching page', { page: page + 1, startIndex, apiUrl: url, apiUrlMasked: maskedUrl });

            // На всякий случай проверяем квоту перед реальным запросом
            if (getAvailableQuota(apiDailyLimit) <= 0) {
                console.warn('[priceService] Quota is exhausted mid-search; stopping fetch', { materialName, page: page + 1 });
                break;
            }

            let data: any = null;
            try {
                const response = await fetchWithRetry(url);
                // Считаем 1 реальный успешный вызов Google API
                incrementApiUsageToday(1);
                data = await response.json();
                await sleep(PER_PAGE_DELAY_MS);
            } catch (err: any) {
                // On repeated 429s or fetch failures stop fetching more pages but continue with parsed results
                console.warn('[priceService] Stopping further pages due to fetch error', { page: page + 1, error: err && err.message ? err.message : err });
                break;
            }

            const items: SearchResult[] = (data && data.items) || [];
            console.debug('[priceService] page items count', { page: page + 1, count: items.length });

            if (!items || items.length === 0) {
                // No more results
                break;
            }

            for (const item of items) {
            const snippet = (item as any).snippet || (item as any).htmlSnippet || '';
            const title = item.title || (item as any).htmlTitle || '';
            const sourceLink = item.link || (item as any).formattedUrl || '';
            const cacheUrl = sourceLink ? `https://webcache.googleusercontent.com/search?q=cache:${encodeURIComponent(sourceLink)}` : '';
            console.debug('[priceService] inspecting item', { title, link: sourceLink, cacheUrl, snippet });

            // 1) Try to read structured price from pagemap (most reliable)
                const pagemapPrice = tryPagemapPrice(item as any);
                if (pagemapPrice) {
                    console.debug('[priceService] pagemap price found', { price: pagemapPrice, source: sourceLink, cacheUrl });
                    pushPrice(pagemapPrice, sourceLink || '');
                    continue;
                }

            // 2) Fallback: search for price patterns in title/snippet
            const text = (snippet + ' ' + title);
            const foundPricesForLink = new Set<number>();
            const priceRe = /(\d{1,3}(?:[\s\u00A0\u202F]\d{3})*(?:[.,]\d+)?|\d+(?:[.,]\d+)?)[^\d]{0,3}\s*(руб|₽|р\.|рублей)/gi;
            for (const m of text.matchAll(priceRe)) {
                const rawMatch = m[1];
                const normalized = String(rawMatch).replace(/[\s\u00A0\u202F]+/g, '').replace(',', '.');
                const price = parseFloat(normalized);
                if (!Number.isFinite(price)) continue;
                // Avoid overcounting repeated values in the same snippet/title for the same URL
                foundPricesForLink.add(Math.round(price));
            }

            if (foundPricesForLink.size > 0) {
                for (const p of foundPricesForLink) {
                    console.debug('[priceService] found price candidate in text', { price: p, source: sourceLink });
                    pushPrice(p, sourceLink || '');
                }
            } else {
                console.debug('[priceService] no price regex match in title/snippet for this item', { sourceLink, cacheUrl });
            }
            }
        }

        if (prices.length === 0) {
            console.warn('[priceService] No prices extracted for', materialName, { itemsSearched: 0 });
            throw new Error('No prices found');
        }

        // Compute counts as number of unique URLs per price
        const countsObj: Record<string, number> = {};
        for (const [k, s] of Object.entries(linkSets)) {
            countsObj[k] = s.size;
        }

        // Choose the price that appears on the most distinct URLs
        let chosenPrice: number | null = null;
        let maxCount = 0;
        for (const [strPrice, cntRaw] of Object.entries(countsObj)) {
            const cnt = Number(cntRaw);
            const num = Number(strPrice);
            if (cnt > maxCount) {
                chosenPrice = num;
                maxCount = cnt;
            } else if (cnt === maxCount && chosenPrice !== null) {
                // Tie-breaker: prefer the lower price (you can change this rule)
                if (num < chosenPrice) chosenPrice = num;
            }
        }

        if (chosenPrice === null) {
            chosenPrice = Math.max(...prices);
        }

        const chosenRounded = Math.round(chosenPrice);
        // find example source link(s) for chosen price
        const chosenLinks = linkSets[String(chosenRounded)] ? Array.from(linkSets[String(chosenRounded)]) : [];
        const chosenCacheLinks = chosenLinks.map(l => `https://webcache.googleusercontent.com/search?q=cache:${encodeURIComponent(l)}`);
        console.info('[priceService] selected price by frequency', { materialName, totalFound: prices.length, counts: countsObj, chosen: chosenRounded, chosenLinks, chosenCacheLinks });

        // Сохраняем результат в долговременный кэш
        setCachedPriceEntry(cacheKey, {
            price: chosenRounded,
            source: options.source,
        });
        return chosenRounded;
    } catch (error) {
        console.error('[priceService] Error searching price:', { materialName, error });
        throw error;
    }
}