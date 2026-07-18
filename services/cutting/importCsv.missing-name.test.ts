import { describe, expect, it } from 'vitest';
import { parseCuttingText } from './importCsv';

describe('parseCuttingText missing construction validation', () => {
    it('reports a populated row without a construction name instead of silently skipping it', () => {
        const text = [
            'Использование в конструкции;Размеры сечения;Фактическая длина, мм;Число',
            ';45x145;1000;1',
        ].join('\n');

        const result = parseCuttingText(text);

        expect(result.items).toEqual([]);
        expect(result.skippedRows).toBe(1);
        expect(result.issues).toEqual([
            expect.objectContaining({
                sourceRow: 2,
                severity: 'error',
                code: 'invalid-value',
            }),
        ]);
    });
});
