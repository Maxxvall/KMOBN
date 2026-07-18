import { describe, expect, it } from 'vitest';
import { parseCuttingText } from './importCsv';

const HEADERS = [
    'Использование в конструкции',
    'Размеры сечения',
    'Фактическая длина, мм',
    'Число',
    'Объем позиции, м3',
].map(value => `"${value}"`).join(';');

const csvRow = (...values: string[]): string => values.map(value => `"${value}"`).join(';');

describe('parseCuttingText', () => {
    it('imports the semicolon report format after its explanatory first line', () => {
        const text = [
            '"Служебное описание отчета"',
            HEADERS,
            csvRow('Ростверк', '45х145', '590', '2', '0,008'),
        ].join('\n');

        const result = parseCuttingText(text, 'хозблок.csv');

        expect(result.fileName).toBe('хозблок.csv');
        expect(result.skippedRows).toBe(0);
        expect(result.issues).toEqual([]);
        expect(result.items).toEqual([
            expect.objectContaining({
                sourceRow: 3,
                construction: 'Ростверк',
                section: '45х145',
                length: 590,
                quantity: 2,
                volumeM3: 0.008,
                isSheet: false,
                stage: 'rostverk',
            }),
        ]);
    });

    it('keeps a 7700 mm board part but reports it as an error above the 6000 mm limit', () => {
        const text = [
            HEADERS,
            csvRow('Ростверк', '45х145', '7700', '1', '0,05'),
        ].join('\n');

        const result = parseCuttingText(text);

        expect(result.items).toHaveLength(1);
        expect(result.items[0].length).toBe(7700);
        expect(result.issues).toEqual([
            expect.objectContaining({
                sourceRow: 2,
                itemId: result.items[0].id,
                severity: 'error',
                code: 'oversized-board-part',
            }),
        ]);
    });

    it('uses the fixed sheet width when OSB and plywood rows have only one size', () => {
        const text = [
            HEADERS,
            csvRow('OSB 12мм черновой пол', '', '1239', '1', '0'),
            csvRow('Фанера 18мм', 'Нет в каталоге', '495', '2', '0'),
        ].join('\n');

        const result = parseCuttingText(text);

        expect(result.items).toEqual([
            expect.objectContaining({
                construction: 'OSB 12мм черновой пол',
                width: 1250,
                thickness: 12,
                isSheet: true,
            }),
            expect.objectContaining({
                construction: 'Фанера 18мм',
                width: 1525,
                thickness: 18,
                isSheet: true,
            }),
        ]);
        expect(result.issues).toEqual([]);
    });

    it('reports non-positive lengths and fractional quantities as invalid source values', () => {
        const text = [
            HEADERS,
            csvRow('Лаги пола', '45х145', '0', '1', '0'),
            csvRow('Стойки стен', '45х95', '-250', '1', '0'),
            csvRow('Бриджи', '45х145', '590', '1,5', '0'),
        ].join('\n');

        const result = parseCuttingText(text);

        expect(result.items).toEqual([]);
        expect(result.skippedRows).toBe(3);
        expect(result.issues).toEqual([
            expect.objectContaining({ sourceRow: 2, severity: 'error', code: 'invalid-value' }),
            expect.objectContaining({ sourceRow: 3, severity: 'error', code: 'invalid-value' }),
            expect.objectContaining({ sourceRow: 4, severity: 'error', code: 'invalid-value' }),
        ]);
    });

    it('recognizes the Russian ОСБ spelling as sheet material', () => {
        const text = [
            HEADERS,
            csvRow('ОСБ 12мм черновой пол', '', '500', '1', '0'),
        ].join('\n');

        const result = parseCuttingText(text);

        expect(result.items).toEqual([
            expect.objectContaining({
                construction: 'ОСБ 12мм черновой пол',
                isSheet: true,
                thickness: 12,
                width: 1250,
            }),
        ]);
        expect(result.issues).toEqual([]);
    });

    it.each(['18×1525', '1525×18'])('reads %s as 18 mm thickness and 1525 mm part width', section => {
        const text = [
            HEADERS,
            csvRow('OSB деталь', section, '500', '1', '0'),
        ].join('\n');

        const result = parseCuttingText(text);

        expect(result.issues).toEqual([]);
        expect(result.items).toEqual([
            expect.objectContaining({
                width: 1525,
                thickness: 18,
                isSheet: true,
            }),
        ]);
    });
});
