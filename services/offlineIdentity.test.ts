import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';
import {
  clearOfflineUser,
  getOfflineUser,
  getOfflineUserId,
  rememberOfflineUser,
} from './offlineIdentity';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, String(value));
  }
}

const user = (id: string): User => ({
  id,
  aud: 'authenticated',
  role: 'authenticated',
  email: `${id}@example.test`,
  app_metadata: {},
  user_metadata: { name: `User ${id}` },
  created_at: '2026-07-13T10:00:00.000Z',
});

describe('offline identity', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('restores the remembered user after a module restart', async () => {
    const remembered = user('user-a');
    rememberOfflineUser(remembered);

    vi.resetModules();
    const restartedIdentity = await import('./offlineIdentity');

    expect(restartedIdentity.getOfflineUser()).toEqual(remembered);
    expect(restartedIdentity.getOfflineUserId()).toBe(remembered.id);
  });

  it('clears the remembered user on explicit logout', () => {
    const remembered = user('user-a');
    rememberOfflineUser(remembered);
    localStorage.setItem('sb-stale-auth-token', JSON.stringify({ user: remembered }));

    clearOfflineUser();

    expect(getOfflineUser()).toBeNull();
    expect(getOfflineUserId()).toBeNull();
  });

  it('falls back to the root Supabase session format used before offline identity existed', () => {
    const legacyUser = user('legacy-user');
    localStorage.setItem(
      'sb-legacy-project-auth-token',
      JSON.stringify({ user: legacyUser }),
    );

    expect(getOfflineUser()).toEqual(legacyUser);
    expect(getOfflineUserId()).toBe(legacyUser.id);
  });
});
