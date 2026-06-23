import supabase, { isSupabaseConfigured } from './supabase';

export interface ServiceStatus {
  supabase: boolean;
  googleAuth: boolean;
  lastCheck: string;
}

const HEALTH_CHECK_INTERVAL = 5 * 60 * 1000;

let checkTimer: ReturnType<typeof setInterval> | null = null;

const checkSupabase = async (): Promise<boolean> => {
  if (!isSupabaseConfigured() || !supabase) return false;
  try {
    const { error } = await supabase.from('estimates').select('id').limit(1);
    return !error;
  } catch {
    return false;
  }
};

const checkGoogleAuth = async (): Promise<boolean> => {
  if (!supabase) return false;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return !!session;
  } catch {
    return false;
  }
};

export const healthMonitor = {
  async check(): Promise<ServiceStatus> {
    const [supabaseOk, authOk] = await Promise.all([
      navigator.onLine ? checkSupabase() : Promise.resolve(false),
      navigator.onLine ? checkGoogleAuth() : Promise.resolve(false),
    ]);

    return {
      supabase: supabaseOk,
      googleAuth: authOk,
      lastCheck: new Date().toISOString(),
    };
  },

  startPeriodicCheck(callback: (status: ServiceStatus) => void): void {
    healthMonitor.stopPeriodicCheck();
    checkTimer = setInterval(async () => {
      const status = await healthMonitor.check();
      callback(status);
    }, HEALTH_CHECK_INTERVAL);
  },

  stopPeriodicCheck(): void {
    if (checkTimer) {
      clearInterval(checkTimer);
      checkTimer = null;
    }
  },
};
