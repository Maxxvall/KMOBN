export interface CacheEntry<T> {
  key: string;
  result: T;
  timestamp: number;
  expiresIn: number;
  qualityScore?: number;
  meta?: any;
}

const MAX_CACHE_SIZE = 500;
const MAX_BAD_KEYS_SIZE = 200;

class AICache {
  private cache = new Map<string, CacheEntry<any>>();
  private badKeys = new Map<string, { until: number; count: number; reason?: string }>();

  private isBad(key: string): boolean {
    const info = this.badKeys.get(key);
    if (!info) return false;
    if (Date.now() >= info.until) {
      this.badKeys.delete(key);
      return false;
    }
    return true;
  }

  /** Remove expired entries and evict oldest if cache exceeds maxSize */
  private evict(): void {
    const now = Date.now();
    // First pass: remove expired entries
    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > entry.expiresIn) {
        this.cache.delete(key);
      }
    }

    // Second pass: if still over limit, remove oldest entries by timestamp
    if (this.cache.size > MAX_CACHE_SIZE) {
      const sorted = [...this.cache.entries()].sort(
        ([, a], [, b]) => a.timestamp - b.timestamp,
      );
      const toRemove = sorted.slice(0, this.cache.size - MAX_CACHE_SIZE);
      for (const [key] of toRemove) {
        this.cache.delete(key);
      }
    }

    // Clean up expired bad keys
    if (this.badKeys.size > MAX_BAD_KEYS_SIZE) {
      for (const [key, info] of this.badKeys) {
        if (now >= info.until) {
          this.badKeys.delete(key);
        }
      }
    }
  }

  get<T>(key: string): T | null {
    if (this.isBad(key)) return null;
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > entry.expiresIn) {
      this.cache.delete(key);
      return null;
    }

    // Move to end for LRU ordering (Map preserves insertion order)
    this.cache.delete(key);
    this.cache.set(key, { ...entry, timestamp: Date.now() });

    return entry.result as T;
  }

  set<T>(key: string, result: T, expiresIn: number = 60 * 60 * 1000, opts?: { qualityScore?: number; meta?: any }) {
    if (this.isBad(key)) return;
    this.cache.set(key, {
      key,
      result,
      timestamp: Date.now(),
      expiresIn,
      qualityScore: opts?.qualityScore,
      meta: opts?.meta,
    });
    // Evict if exceeded max size
    if (this.cache.size > MAX_CACHE_SIZE) {
      this.evict();
    }
  }

  setIfGood<T>(
    key: string,
    result: T,
    expiresIn: number,
    opts: { qualityScore: number; minQuality: number; meta?: any },
  ) {
    if (this.isBad(key)) return;
    if (!Number.isFinite(opts.qualityScore) || opts.qualityScore < opts.minQuality) return;
    this.set(key, result, expiresIn, { qualityScore: opts.qualityScore, meta: opts.meta });
  }

  generateKey(...parts: any[]): string {
    return JSON.stringify(parts);
  }

  markBad(key: string, ttlMs: number = 7 * 24 * 60 * 60 * 1000, reason?: string) {
    const now = Date.now();
    const until = now + ttlMs;
    const existing = this.badKeys.get(key);
    this.badKeys.set(key, {
      until: Math.max(until, existing?.until || 0),
      count: (existing?.count || 0) + 1,
      reason: reason || existing?.reason,
    });
    this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
    this.badKeys.clear();
  }
}

export const aiCache = new AICache();
