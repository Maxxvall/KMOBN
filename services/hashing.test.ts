import { describe, expect, it } from 'vitest';
import { hashData } from './hashing';

describe('hashData', () => {
  it('returns different hash for different content with same json length', () => {
    const a = { a: 11 };
    const b = { b: 22 };

    expect(JSON.stringify(a).length).toBe(JSON.stringify(b).length);
    expect(hashData(a)).not.toBe(hashData(b));
  });

  it('is stable for objects with different key order', () => {
    const first = { b: 2, a: 1, nested: { z: 1, y: 2 } };
    const second = { nested: { y: 2, z: 1 }, a: 1, b: 2 };

    expect(hashData(first)).toBe(hashData(second));
  });
});
