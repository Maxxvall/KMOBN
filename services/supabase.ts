import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createOperationId } from './operationId';

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

const FETCH_PAGE_SIZE = 1000;

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
    if (typeof row.revision === 'number') payload.serverRevision = row.revision;

    return payload;
  });

  normalized.sort(compareByStableOrder);
  return normalized;
};

export const saveOfflineRecord = async (
  table: string,
  record: Record<string, unknown>,
  userId: string,
  operationId: string,
) => {
  if (!supabase) return { data: null, error: new Error('Supabase not configured') };
  if (!userId) return { data: null, error: new Error('User is not authenticated') };
  const payload = { ...record };
  const expectedRevision = Number(payload.serverRevision ?? 0);
  delete payload.serverRevision;
  const { data, error } = await supabase.rpc('save_offline_record', {
    p_table: table,
    p_record_id: String(record.id ?? ''),
    p_payload: payload,
    p_expected_revision: Number.isInteger(expectedRevision) && expectedRevision >= 0 ? expectedRevision : 0,
    p_operation_id: operationId,
  });
  if (error || !data || typeof data !== 'object') return { data: null, error: error ?? new Error('Invalid save response') };
  return { data: normalizeFetchedRows([data as Record<string, unknown>])[0], error: null };
};

export const deleteOfflineRecord = async (
  table: string,
  recordId: string,
  userId: string,
  expectedRevision: number,
  operationId: string,
) => {
  if (!supabase) return { data: null, error: new Error('Supabase not configured') };
  if (!userId) return { data: null, error: new Error('User is not authenticated') };
  return supabase.rpc('delete_offline_record', {
    p_table: table,
    p_record_id: recordId,
    p_expected_revision: Number.isInteger(expectedRevision) && expectedRevision >= 0 ? expectedRevision : 0,
    p_operation_id: operationId,
  });
};

export const fetchTable = async (table: string, userId?: string) => {
  if (!supabase) return { data: null, error: new Error('Supabase not configured') };
  if (!userId) return { data: null, error: new Error('User is not authenticated') };

  const rows: Record<string, unknown>[] = [];

  for (let from = 0; ; from += FETCH_PAGE_SIZE) {
    const to = from + FETCH_PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('user_id', userId)
      .order('id', { ascending: true })
      .range(from, to);
    if (error) return { data: null, error };

    const page = (data ?? []) as Record<string, unknown>[];
    rows.push(...page);
    if (page.length === 0) break;
  }

  const parsed = normalizeFetchedRows(rows);

  return { data: parsed, error: null };
};

const OFFLINE_RECORD_TABLES = new Set([
  'estimates',
  'templates',
  'materials',
  'works',
  'bundles',
  'estimate_sections',
]);

/** Reads one current server row only when the user explicitly asks to compare a queued change. */
export const fetchOfflineRecord = async (table: string, recordId: string, userId: string) => {
  if (!supabase) return { data: null, error: new Error('Supabase not configured') };
  if (!userId) return { data: null, error: new Error('User is not authenticated') };
  if (!OFFLINE_RECORD_TABLES.has(table)) return { data: null, error: new Error('Unsupported offline table') };

  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq('user_id', userId)
    .eq('id', recordId)
    .maybeSingle();
  if (error || !data) return { data: null, error };
  return { data: normalizeFetchedRows([data as Record<string, unknown>])[0] ?? null, error: null };
};

export const fetchEstimates = async (userId: string) => fetchTable('estimates', userId);

export const fetchTemplates = async (userId: string) => fetchTable('templates', userId);

export const fetchMaterials = async (userId: string) => fetchTable('materials', userId);

export const fetchWorks = async (userId: string) => fetchTable('works', userId);

export const fetchBundles = async (userId: string) => fetchTable('bundles', userId);

export const fetchEstimateSections = async (userId: string) => fetchTable('estimate_sections', userId);


export const saveEstimateSectionsRemote = async (document: any, userId: string) => {
  if (!supabase) return { data: null, error: new Error('Supabase not configured') };
  if (!userId) return { data: null, error: new Error('User is not authenticated') };
  const payload = { ...document };
  delete payload.serverRevision;
  delete payload.baseDocument;
  delete payload.operationId;
  delete payload.syncConflict;
  const operationId = document.operationId || createOperationId();
  const { data, error } = await supabase.rpc('save_estimate_sections', {
    p_payload: payload,
    p_expected_revision: document.serverRevision || 0,
    p_operation_id: operationId,
  });
  if (error) return { data: null, error };
  const rows = Array.isArray(data) ? data : [];
  return {
    data: rows.map(row => ({ ...(row.payload || {}), id: row.id, serverRevision: row.revision })),
    error: null,
  };
};

export default supabase;
