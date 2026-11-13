import { describe, expect, it } from 'vitest';
import { normalizeKey, normalizeRussianLower } from './types';

describe('russian text normalization', () => {
    it('normalizeKey replaces ё→е and keeps trim/collapse', () => {
        expect(normalizeKey('Ёлка   ЁЖИК')).toBe('елка ежик');
        expect(normalizeKey('  А  б ')).toBe('а б');
        expect(normalizeKey(null)).toBe('');
    });

    it('normalizeRussianLower is locale lowercase plus ё→е, without trim/collapse', () => {
        expect(normalizeRussianLower('ЁЛКА Ёж')).toBe('елка еж');
        expect(normalizeRussianLower('  А ')).toBe('  а ');
    });
});
