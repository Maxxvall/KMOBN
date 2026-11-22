import { describe, expect, it } from 'vitest';
import { fingerprintData, hashData, memoizedFingerprint } from './hashing';

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

describe('memoizedFingerprint', () => {
  it('computes once per object reference: the same reference returns the same string without recomputing', () => {
    let reads = 0;
    const data = {
      get expensive() {
        reads += 1;
        return 42;
      },
    };

    const first = memoizedFingerprint(data);
    const second = memoizedFingerprint(data);

    expect(second).toBe(first);
    expect(second).toBe(fingerprintData({ expensive: 42 }));
    // Without memoization the getter would be evaluated on every call.
    expect(reads).toBe(1);
  });

  it('recomputes for a new reference with the same data and yields the same string', () => {
    expect(memoizedFingerprint({ a: 1, b: [1, 2] })).toBe(memoizedFingerprint({ a: 1, b: [1, 2] }));
    expect(memoizedFingerprint({ a: 1 })).toBe(fingerprintData({ a: 1 }));
  });

  it('yields a new fingerprint when data changes behind a new reference', () => {
    const before = memoizedFingerprint({ a: 1, status: 'draft' });
    const after = memoizedFingerprint({ a: 1, status: 'saved' });

    expect(after).not.toBe(before);
    // The stale memo must not leak across references.
    expect(memoizedFingerprint({ a: 1, status: 'draft' })).toBe(before);
  });

  it('accepts arrays and passes primitive values through without memoization', () => {
    const list = [1, 2, 3];

    expect(memoizedFingerprint(list)).toBe(fingerprintData(list));
    expect(memoizedFingerprint(list)).toBe(fingerprintData(list));
    expect(memoizedFingerprint('plain')).toBe(fingerprintData('plain'));
  });
});
