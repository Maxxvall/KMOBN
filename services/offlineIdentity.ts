import type { User } from '@supabase/supabase-js';

const OFFLINE_IDENTITY_KEY = 'kmobn:offlineIdentity';
const OFFLINE_IDENTITY_CLEARED_KEY = 'kmobn:offlineIdentityCleared';

type StoredOfflineIdentity = {
  user: User;
  rememberedAt: string;
};

const readSupabaseCachedUser = (): User | null => {
  if (typeof localStorage === 'undefined') return null;
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith('sb-') || !key.endsWith('-auth-token')) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        const session = parsed?.current_session || parsed?.session || parsed;
        if (session?.user?.id) return session.user as User;
      } catch {
        // A malformed unrelated auth entry must not hide a valid later entry.
      }
    }
  } catch {
    return null;
  }
  return null;
};

export const getOfflineUser = (): User | null => {
  if (typeof localStorage === 'undefined') return null;
  try {
    if (localStorage.getItem(OFFLINE_IDENTITY_CLEARED_KEY) === 'true') return null;
    const raw = localStorage.getItem(OFFLINE_IDENTITY_KEY);
    if (raw) {
      const stored = JSON.parse(raw) as Partial<StoredOfflineIdentity>;
      if (stored.user?.id) return stored.user;
    }
  } catch {
    // Fall through to the Supabase session format used by older versions.
  }
  return readSupabaseCachedUser();
};

export const getOfflineUserId = (): string | null => getOfflineUser()?.id ?? null;

export const rememberOfflineUser = (user: User): void => {
  if (!user?.id || typeof localStorage === 'undefined') return;
  const stored: StoredOfflineIdentity = {
    user,
    rememberedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(OFFLINE_IDENTITY_KEY, JSON.stringify(stored));
    localStorage.removeItem(OFFLINE_IDENTITY_CLEARED_KEY);
  } catch {
    // The active online session still owns the current write; persistence will
    // be retried on the next auth/session read.
  }
};

export const clearOfflineUser = (): void => {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(OFFLINE_IDENTITY_KEY);
    localStorage.setItem(OFFLINE_IDENTITY_CLEARED_KEY, 'true');
  } catch {
    // The caller still clears in-memory auth state.
  }
};
