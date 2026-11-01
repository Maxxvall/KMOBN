const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    // Canonical form matches the JSON wire shape: JSON.stringify drops keys
    // whose value is undefined, so the hash must drop them too or records that
    // only differ by explicit undefined keys (e.g. `parentId` after
    // normalizeEstimateChains) hash apart from their cached server form.
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
};

export const hashData = (value: unknown): string => {
  try {
    return stableStringify(value);
  } catch {
    return '0000000000000000';
  }
};

export const fingerprintData = (value: unknown): string => {
  const source = hashData(value);
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < source.length; index += 1) {
    const code = source.charCodeAt(index);
    first ^= code;
    first = Math.imul(first, 0x01000193);
    second ^= code + index;
    second = Math.imul(second, 0x85ebca6b);
  }
  return `${source.length}:${(first >>> 0).toString(36)}:${(second >>> 0).toString(36)}`;
};
