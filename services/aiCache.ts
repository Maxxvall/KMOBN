export interface CacheEntry<T> {
  key: string;
  result: T;
  timestamp: number;
  expiresIn: number;
}

class AICache {
  private cache = new Map<string, CacheEntry<any>>();

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > entry.expiresIn) {
      this.cache.delete(key);
      return null;
    }

    return entry.result as T;
  }

  set<T>(key: string, result: T, expiresIn: number = 60 * 60 * 1000) {
    this.cache.set(key, {
      key,
      result,
      timestamp: Date.now(),
      expiresIn,
    });
  }

  generateKey(...parts: any[]): string {
    return JSON.stringify(parts);
  }

  clear() {
    this.cache.clear();
  }
}

export const aiCache = new AICache();
