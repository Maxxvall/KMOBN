import { describe, expect, it } from 'vitest';
import { coverageQuantitySqM, parsePackAreaSqM } from './aiMeasurements';

describe('AI measurement helpers', () => {
  it('recognizes common Russian pack-area spellings', () => {
    expect(parsePackAreaSqM('Мембрана 25м2')).toBe(25);
    expect(parsePackAreaSqM('Утеплитель 3 м²')).toBe(3);
    expect(parsePackAreaSqM('Пароизоляция 70 кв.м')).toBe(70);
  });

  it('converts packs to covered square metres', () => {
    expect(coverageQuantitySqM({ name: 'Мембрана 25 м2', unit: 'шт', quantity: 8 })).toBe(200);
  });
});
