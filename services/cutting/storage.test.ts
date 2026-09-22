import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearCuttingDraft,
  loadCuttingDraft,
  loadCuttingStageMappings,
  saveCuttingDraft,
  saveCuttingStageMapping,
} from './storage';
import { DEFAULT_CUTTING_SETTINGS } from './types';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

describe('cutting local storage ownership', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { localStorage: new MemoryStorage() });
  });

  it('keeps drafts and stage mappings isolated by user', () => {
    const draft = {
      fileName: 'house.csv',
      items: [],
      settings: DEFAULT_CUTTING_SETTINGS,
      updatedAt: '2026-09-22T00:00:00.000Z',
    };

    saveCuttingDraft('user-a', draft);
    saveCuttingStageMapping('user-a', 'Стены', 'walls');

    expect(loadCuttingDraft('user-a')).toEqual(draft);
    expect(loadCuttingDraft('user-b')).toBeNull();
    expect(loadCuttingStageMappings('user-a')).toEqual({ стены: 'walls' });
    expect(loadCuttingStageMappings('user-b')).toEqual({});

    clearCuttingDraft('user-b');
    expect(loadCuttingDraft('user-a')).toEqual(draft);
  });
});
