export interface CacheEntry<T> {
  key: string;
  result: T;
  timestamp: number;
  expiresIn: number;
  qualityScore?: number;
  meta?: any;
}

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

  get<T>(key: string): T | null {
    if (this.isBad(key)) return null;
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > entry.expiresIn) {
      this.cache.delete(key);
      return null;
    }

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
