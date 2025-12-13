import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string) || '';
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || '';

let supabase: SupabaseClient | null = null;

if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
} else {
  console.warn('Supabase not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env');
}

export const isSupabaseConfigured = (): boolean => !!supabase;

export const upsertTable = async (table: string, records: any[]) => {
  if (!supabase) return { error: new Error('Supabase not configured') };

  // Store each record under `payload` jsonb column to avoid strict schema requirements.
  const payloads = records.map(r => ({ id: r.id, payload: r }));
  const { data, error } = await supabase.from(table).upsert(payloads).select();
  return { data, error };
};

export const fetchTable = async (table: string) => {
  if (!supabase) return { data: null, error: new Error('Supabase not configured') };

  // Select all columns. Some rows may store the object under `payload` (jsonb),
  // older rows may store object fields as top-level columns. Handle both.
  const { data, error } = await supabase.from(table).select('*');
  if (error) return { data: null, error };

  const parsed = (data as any[]).map(row => {
    // If row has payload column, prefer it
    if (row && Object.prototype.hasOwnProperty.call(row, 'payload') && row.payload != null) {
      return row.payload;
    }
    // Otherwise return the row as-is (remove any metadata if needed)
    return row;
  });

  return { data: parsed, error: null };
};

export const upsertEstimates = async (estimates: any[]) => upsertTable('estimates', estimates);
export const fetchEstimates = async () => fetchTable('estimates');

export const upsertTemplates = async (templates: any[]) => upsertTable('templates', templates);
export const fetchTemplates = async () => fetchTable('templates');

export const upsertMaterials = async (materials: any[]) => upsertTable('materials', materials);
export const fetchMaterials = async () => fetchTable('materials');

export const upsertWorks = async (works: any[]) => upsertTable('works', works);
export const fetchWorks = async () => fetchTable('works');

export const upsertBundles = async (bundles: any[]) => upsertTable('bundles', bundles);
export const fetchBundles = async () => fetchTable('bundles');

export default supabase;
