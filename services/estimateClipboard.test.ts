import { describe, expect, it } from 'vitest';
import { EstimateCategory } from '../types';
import {
  formatCatalogItemClipboard,
  formatEstimateItemsClipboard,
} from './estimateClipboard';

describe('formatEstimateItemsClipboard', () => {
  it('groups items by section in first-appearance order with "Имя — кол-во ед." lines', () => {
    const text = formatEstimateItemsClipboard([
      { name: 'Арматура', unit: 'м', quantity: 10, category: EstimateCategory.FOUNDATION },
      { name: 'Бетон', unit: 'м³', quantity: 2.5, category: EstimateCategory.FOUNDATION },
      { name: 'Профиль', unit: 'шт', quantity: 12, category: EstimateCategory.WALLS },
    ]);

    expect(text).toBe(
      'ФУНДАМЕНТ\nАрматура — 10 м\nБетон — 2.5 м³\n\nСТЕНЫ\nПрофиль — 12 шт',
    );
  });

  it('keeps repeating sections in one group instead of duplicating the heading', () => {
    const text = formatEstimateItemsClipboard([
      { name: 'Арматура', unit: 'м', quantity: 10, category: EstimateCategory.FOUNDATION },
      { name: 'Профиль', unit: 'шт', quantity: 3, category: EstimateCategory.WALLS },
      { name: 'Бетон', unit: 'м³', quantity: 2, category: EstimateCategory.FOUNDATION },
    ]);

    expect(text).toBe('ФУНДАМЕНТ\nАрматура — 10 м\nБетон — 2 м³\n\nСТЕНЫ\nПрофиль — 3 шт');
  });

  it('uses the provided section label resolver over the raw category', () => {
    const text = formatEstimateItemsClipboard(
      [{ name: 'Пена', unit: 'балл', quantity: 4, category: 'custom:abc' }],
      { resolveSectionLabel: (category) => (category === 'custom:abc' ? 'Утепление' : category) },
    );

    expect(text).toBe('Утепление\nПена — 4 балл');
  });

  it('omits the unit when it is empty and trims fractional quantity zeros', () => {
    const text = formatEstimateItemsClipboard([
      { name: 'Работа', unit: '', quantity: 2.5, category: EstimateCategory.GENERAL },
      { name: 'Число', unit: 'шт', quantity: 1.0, category: EstimateCategory.GENERAL },
    ]);

    expect(text).toBe('ОБЩАЯ\nРабота — 2.5\nЧисло — 1 шт');
  });

  it('returns an empty string for an empty list', () => {
    expect(formatEstimateItemsClipboard([])).toBe('');
  });
});

describe('formatCatalogItemClipboard', () => {
  it('formats a catalog position as "Имя — цена ₽" with ru-RU thousands grouping', () => {
    expect(formatCatalogItemClipboard({ name: 'Брус 100×100', price: 1250 })).toBe('Брус 100×100 — 1 250 ₽');
  });

  it('appends the unit after the price when known', () => {
    expect(formatCatalogItemClipboard({ name: 'Бетон', price: 5400.5, unit: 'м³' })).toBe('Бетон — 5 400,5 ₽/м³');
  });
});
