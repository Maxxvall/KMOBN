import { describe, expect, it } from 'vitest';
import { numberToWordsRu, sumInWordsRu } from './pdfContractGenerator';

// Контрактные суммы из требований этапа 7: числовая строка документа и
// прописная строка обязаны описывать одну и ту же сумму в рублях и копейках.
const cases: Array<{ total: number; rubles: string; kopecks: string }> = [
    { total: 0, rubles: 'ноль', kopecks: 'ноль копеек' },
    { total: 1.01, rubles: 'один рубль', kopecks: 'одна копейка' },
    { total: 2.02, rubles: 'два рубля', kopecks: 'две копейки' },
    { total: 5.05, rubles: 'пять рублей', kopecks: 'пять копеек' },
    { total: 11.11, rubles: 'одиннадцать рублей', kopecks: 'одиннадцать копеек' },
    { total: 21.21, rubles: 'двадцать один рубль', kopecks: 'двадцать одна копейка' },
    { total: 100.5, rubles: 'сто рублей', kopecks: 'пятьдесят копеек' },
    { total: 1234.56, rubles: 'одна тысяча двести тридцать четыре рубля', kopecks: 'пятьдесят шесть копеек' },
    { total: 123456.79, rubles: 'сто двадцать три тысячи четыреста пятьдесят шесть рублей', kopecks: 'семьдесят девять копеек' },
    { total: 1000000, rubles: 'один миллион рублей', kopecks: 'ноль копеек' },
];

describe('sumInWordsRu (contract total in words with kopecks)', () => {
    it.each(cases)('spells out $total ₽ including kopecks', ({ total, rubles, kopecks }) => {
        const words = sumInWordsRu(total);
        expect(words).toContain(rubles);
        expect(words).toContain(kopecks);
    });

    it('keeps kopecks that the old Math.round(total) silently dropped', () => {
        // Старое поведение: Math.round(123456.79) = 123457 → «…пятьдесят семь рублей»,
        // числовая строка — 123 456,79 ₽. Теперь копейки совпадают.
        expect(sumInWordsRu(123456.79)).toContain('семьдесят девять копеек');
        expect(sumInWordsRu(123456.79)).not.toContain('пятьдесят семь');
    });

    it('rounds float artifacts to the nearest kopeck instead of corrupting words', () => {
        // Итог сметы приходит без roundMoney и может содержать float-хвост.
        const words = sumInWordsRu(1234.56100000002);
        expect(words).toContain('пятьдесят шесть копеек');
        expect(words).not.toContain('сто');
    });

    it('handles zero and keeps the absolute value for words', () => {
        expect(sumInWordsRu(0)).toBe('ноль рублей ноль копеек');
    });

    it('returns an empty string for non-finite totals', () => {
        expect(sumInWordsRu(NaN)).toBe('');
        expect(sumInWordsRu(Infinity)).toBe('');
    });

    it('keeps ruble declensions for 1/2/5/11/21', () => {
        expect(numberToWordsRu(1)).toBe('один рубль');
        expect(numberToWordsRu(2)).toBe('два рубля');
        expect(numberToWordsRu(5)).toBe('пять рублей');
        expect(numberToWordsRu(11)).toBe('одиннадцать рублей');
        expect(numberToWordsRu(21)).toBe('двадцать один рубль');
    });
});
