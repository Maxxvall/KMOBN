const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
};

/**
 * FNV-1a 64-bit hash (emulated via two 32-bit passes with different seeds).
 * Produces a 16-char hex string, reducing collision probability from
 * ~1:77k (32-bit) to ~1:5 billion, sufficient for tens of thousands of records.
 */
export const fnv1aHash = (input: string): string => {
  // First pass — standard FNV-1a 32-bit
  let h1 = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h1 ^= input.charCodeAt(i);
    h1 = (h1 * 0x01000193) >>> 0;
  }
  // Second pass — offset seed for additional 32 bits
  let h2 = 0x050c5d1f;
  for (let i = 0; i < input.length; i += 1) {
    h2 ^= input.charCodeAt(i);
    h2 = (h2 * 0x01000193) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
};

export const hashData = (value: unknown): string => {
  try {
    return fnv1aHash(stableStringify(value));
  } catch {
    return '0000000000000000';
  }
};
