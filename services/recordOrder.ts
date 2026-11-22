// Shared stable ordering for records fetched from Supabase or the local
// cache: explicit sortOrder first, then creation/update timestamps, then a
// numeric tail of the id. Both database.ts and supabase.ts read through
// these helpers; they import nothing from either module (no cycles).

export const parseTimestamp = (value: unknown): number | null => {
  if (typeof value !== 'string' || !value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const inferSortOrder = (record: Record<string, unknown>, fallbackIndex: number): number => {
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

export const compareByStableOrder = (left: Record<string, unknown>, right: Record<string, unknown>): number => {
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

export const normalizeStableOrder = <T extends { id: string }>(records: T[]): T[] => {
  if (records.length <= 1) return records;
  return [...records].sort(
    (left, right) => compareByStableOrder(
      left as unknown as Record<string, unknown>,
      right as unknown as Record<string, unknown>,
    ),
  );
};
