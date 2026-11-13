import { describe, expect, it } from 'vitest';
import { formatBytes, formatDuration, sanitizeFileName } from './format';

describe('formatBytes', () => {
    it('picks the unit by magnitude', () => {
        expect(formatBytes(512)).toBe('512 Б');
        expect(formatBytes(2048)).toBe('2.0 КБ');
        expect(formatBytes(1_572_864)).toBe('1.5 МБ');
    });
});

describe('formatDuration', () => {
    it('renders minutes and hours without declension', () => {
        expect(formatDuration(4 * 60_000)).toBe('4 мин');
        expect(formatDuration(90 * 60_000)).toBe('1 ч 30 мин');
        expect(formatDuration(120 * 60_000)).toBe('2 ч 0 мин');
    });
});

describe('sanitizeFileName', () => {
    it('replaces forbidden characters and collapses whitespace', () => {
        expect(sanitizeFileName('Иванов: дом / этап 1')).toBe('Иванов_ дом _ этап 1');
        expect(sanitizeFileName('  смета   2026  ')).toBe('смета 2026');
        expect(sanitizeFileName('a<>b|c"d')).toBe('a_b_c_d');
        // Фолбэк остаётся у вызывающего сайта (premium: «Без_названия», cutting: «Раскрой»).
        expect(sanitizeFileName('///')).toBe('_');
    });
});
