import { describe, expect, it, vi } from 'vitest';
import { generateEstimateNumber } from './estimateNumber';

describe('generateEstimateNumber', () => {
  it('increments serial from current year', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.123456);
    const now = new Date('2026-02-26T10:00:00.000Z');

    const result = generateEstimateNumber([
      'SM-2026-001-AAAA',
      'SM-2026-014-BBBB',
      'SM-2025-999-ZZZZ',
    ], now);

    expect(result.startsWith('SM-2026-015-')).toBe(true);
  });
});
