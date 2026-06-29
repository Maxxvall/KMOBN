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

type FetchTableOptions = {
  limit?: number;
};

const FETCH_SAFETY_LIMIT = 2000;

const normalizeLimit = (limit?: number): number => {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) return FETCH_SAFETY_LIMIT;
  return Math.max(1, Math.min(FETCH_SAFETY_LIMIT, Math.floor(limit)));
};

const parseTimestamp = (value: unknown): number | null => {
  if (typeof value !== 'string' || !value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const inferSortOrder = (record: Record<string, unknown>, fallbackIndex: number): number => {
  const explicitSortOrder = record.sortOrder;
  if (typeof explicitSortOrder === 'number' && Number.isFinite(explicitSortOrder)) {
    return explicitSortOrder;
  }

  const createdAtTs = parseTimestamp(record.created_at);
  if (createdAtTs != null) return createdAtTs;

  const updatedAtTs = parseTimestamp(record.updated_at);
  if (updatedAtTs != null) return updatedAtTs;

  const lastUpdatedTs = parseTimestamp(record.lastUpdated);
  if (lastUpdatedTs != null) return lastUpdatedTs;

  const dateTs = parseTimestamp(record.date);
  if (dateTs != null) return dateTs;

  const idText = typeof record.id === 'string' ? record.id : '';
  const numericIdPart = Number((idText.match(/(\d{8,})/) || [])[1]);
  if (Number.isFinite(numericIdPart)) return numericIdPart;

  return fallbackIndex;
};

const compareByStableOrder = (left: Record<string, unknown>, right: Record<string, unknown>): number => {
  const leftSort = inferSortOrder(left, 0);
  const rightSort = inferSortOrder(right, 0);
  if (leftSort !== rightSort) return leftSort - rightSort;

  const leftCreatedAt = parseTimestamp(left.created_at) ?? 0;
  const rightCreatedAt = parseTimestamp(right.created_at) ?? 0;
  if (leftCreatedAt !== rightCreatedAt) return leftCreatedAt - rightCreatedAt;

  const leftId = String(left.id ?? '');
  const rightId = String(right.id ?? '');
  return leftId.localeCompare(rightId);
};

const normalizeFetchedRows = (rows: Record<string, unknown>[]): Record<string, unknown>[] => {
  const normalized = rows.map((row, index) => {
    const payload = row && Object.prototype.hasOwnProperty.call(row, 'payload') && row.payload != null
      ? { ...(row.payload as Record<string, unknown>) }
      : (() => {
          const { user_id: _userId, payload: _payload, ...rest } = row;
          void _userId;
          void _payload;
          return { ...rest };
        })();

    if (!Object.prototype.hasOwnProperty.call(payload, 'created_at') && row.created_at != null) {
      payload.created_at = row.created_at;
    }
    if (!Object.prototype.hasOwnProperty.call(payload, 'updated_at') && row.updated_at != null) {
      payload.updated_at = row.updated_at;
    }
    if (!Object.prototype.hasOwnProperty.call(payload, 'sortOrder')) {
      payload.sortOrder = inferSortOrder({ ...payload, created_at: payload.created_at ?? row.created_at, updated_at: payload.updated_at ?? row.updated_at }, index);
    }

    return payload;
  });

  normalized.sort(compareByStableOrder);
  return normalized;
};

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

export const fetchTable = async (table: string, userId?: string, options?: FetchTableOptions) => {
  if (!supabase) return { data: null, error: new Error('Supabase not configured') };
  if (!userId) return { data: null, error: new Error('User is not authenticated') };

  const requestLimit = normalizeLimit(options?.limit);
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq('user_id', userId)
    .order('id', { ascending: true })
    .limit(requestLimit);
  if (error) return { data: null, error };

  const parsed = normalizeFetchedRows((data ?? []) as Record<string, unknown>[]);

  return { data: parsed, error: null };
};

export const upsertEstimates = async (estimates: any[], userId: string) => upsertTable('estimates', estimates, userId);
export const fetchEstimates = async (userId: string, options?: FetchTableOptions) => fetchTable('estimates', userId, options);

export const upsertTemplates = async (templates: any[], userId: string) => upsertTable('templates', templates, userId);
export const fetchTemplates = async (userId: string, options?: FetchTableOptions) => fetchTable('templates', userId, options);

export const upsertMaterials = async (materials: any[], userId: string) => upsertTable('materials', materials, userId);
export const fetchMaterials = async (userId: string, options?: FetchTableOptions) => fetchTable('materials', userId, options);

export const upsertWorks = async (works: any[], userId: string) => upsertTable('works', works, userId);
export const fetchWorks = async (userId: string, options?: FetchTableOptions) => fetchTable('works', userId, options);

export const upsertBundles = async (bundles: any[], userId: string) => upsertTable('bundles', bundles, userId);
export const fetchBundles = async (userId: string, options?: FetchTableOptions) => fetchTable('bundles', userId, options);

export const upsertSalaryCalculations = async (calculations: any[], userId: string) => upsertTable('salary_calculations', calculations, userId);
export const fetchSalaryCalculations = async (userId: string, options?: FetchTableOptions) => fetchTable('salary_calculations', userId, options);

export default supabase;
