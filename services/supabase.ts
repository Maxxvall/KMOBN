import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string) || '';
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || '';

let supabase: SupabaseClient | null = null;

if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
  });
} else {
  console.warn('Supabase not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env');
}

export const isSupabaseConfigured = (): boolean => !!supabase;

const UPSERT_BATCH_SIZE = 100;

export const upsertTable = async (table: string, records: any[], userId?: string) => {
  if (!supabase) return { error: new Error('Supabase not configured') };
  if (!userId) return { error: new Error('User is not authenticated') };

  const recordsWithUserId = records.map(record => {
    const payload = record && typeof record === 'object' ? record : { value: record };
    const base: Record<string, unknown> = { user_id: userId, payload };
    if (payload && (payload as any).id != null) {
      base.id = (payload as any).id;
    }
    return base;
  });

  // Batch upserts to avoid exceeding PostgREST body size limits
  if (recordsWithUserId.length <= UPSERT_BATCH_SIZE) {
    const { data, error } = await supabase.from(table).upsert(recordsWithUserId).select();
    return { data, error };
  }

  const allData: any[] = [];
  for (let i = 0; i < recordsWithUserId.length; i += UPSERT_BATCH_SIZE) {
    const batch = recordsWithUserId.slice(i, i + UPSERT_BATCH_SIZE);
    const { data, error } = await supabase.from(table).upsert(batch).select();
    if (error) return { data: null, error };
    if (data) allData.push(...data);
  }
  return { data: allData, error: null };
};

export const fetchTable = async (table: string, userId?: string) => {
  if (!supabase) return { data: null, error: new Error('Supabase not configured') };
  if (!userId) return { data: null, error: new Error('User is not authenticated') };

  // Select all columns with a safety limit to prevent unbounded payloads.
  // Some rows may store the object under `payload` (jsonb),
  // older rows may store object fields as top-level columns. Handle both.
  const FETCH_SAFETY_LIMIT = 2000;
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq('user_id', userId)
    .limit(FETCH_SAFETY_LIMIT);
  if (error) return { data: null, error };

  const parsed = ((data ?? []) as Record<string, unknown>[]).map(row => {
    if (row && Object.prototype.hasOwnProperty.call(row, 'payload') && row.payload != null) {
      return row.payload as Record<string, unknown>;
    }
    const { user_id: _userId, payload: _payload, ...rest } = row;
    void _userId;
    void _payload;
    return rest;
  });

  return { data: parsed, error: null };
};

export const upsertEstimates = async (estimates: any[], userId: string) => upsertTable('estimates', estimates, userId);
export const fetchEstimates = async (userId: string) => fetchTable('estimates', userId);

export const upsertTemplates = async (templates: any[], userId: string) => upsertTable('templates', templates, userId);
export const fetchTemplates = async (userId: string) => fetchTable('templates', userId);

export const upsertMaterials = async (materials: any[], userId: string) => upsertTable('materials', materials, userId);
export const fetchMaterials = async (userId: string) => fetchTable('materials', userId);

export const upsertWorks = async (works: any[], userId: string) => upsertTable('works', works, userId);
export const fetchWorks = async (userId: string) => fetchTable('works', userId);

export const upsertBundles = async (bundles: any[], userId: string) => upsertTable('bundles', bundles, userId);
export const fetchBundles = async (userId: string) => fetchTable('bundles', userId);

export const upsertSalaryCalculations = async (calculations: any[], userId: string) => upsertTable('salary_calculations', calculations, userId);
export const fetchSalaryCalculations = async (userId: string) => fetchTable('salary_calculations', userId);

export default supabase;
