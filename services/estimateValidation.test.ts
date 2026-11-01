import { describe, expect, it } from 'vitest';
import { EstimateCategory, EstimateStatus } from '../types';
import type { Estimate, EstimateItem } from '../types';
import { validateEstimate } from './estimateValidation';

const item = (overrides: Partial<EstimateItem> = {}): EstimateItem => ({
    id: 'item-1',
    name: 'Монтаж каркаса',
    unit: 'м²',
    quantity: 2,
    price: 500,
    total: 1000,
    category: EstimateCategory.WALLS,
    ...overrides,
});

const estimate = (items: EstimateItem[]): Estimate => ({
    id: 'estimate-1',
    estimateNumber: 'SM-2026-001',
    client: 'Клиент',
    date: '2026-07-13',
    status: EstimateStatus.DRAFT,
    version: 1,
    items,
    total: items.reduce((sum, current) => sum + current.total, 0),
    buildingType: 'Каркасный дом',
    area: 100,
});

describe('validateEstimate', () => {
    it('accepts a fully valid estimate', () => {
        const result = validateEstimate(estimate([item()]));

        expect(result.issues).toEqual([]);
        expect(result.invalidItemIds.size).toBe(0);
    });

    it('flags an empty name', () => {
        const result = validateEstimate(estimate([item({ name: '   ' })]));

        expect(result.issues[0]).toMatchObject({ code: 'EMPTY_NAME', field: 'name' });
        expect(result.invalidFieldsByItemId['item-1']).toEqual({ name: true });
    });

    it.each([0, -1, NaN, Infinity])('flags a non-positive or non-finite quantity: %s', quantity => {
        const result = validateEstimate(estimate([item({ quantity })]));

        expect(result.issues[0]).toMatchObject({ code: 'ZERO_OR_NEGATIVE_QTY', field: 'quantity' });
        expect(result.invalidItemIds.has('item-1')).toBe(true);
    });

    it.each([-0.01, NaN, Infinity])('flags a negative or non-finite price: %s', price => {
        const result = validateEstimate(estimate([item({ price })]));

        expect(result.issues[0]).toMatchObject({ code: 'NEGATIVE_PRICE', field: 'price' });
    });

    it('collects issues for every invalid item independently', () => {
        const result = validateEstimate(estimate([
            item({ id: 'a', name: '' }),
            item({ id: 'b', price: -5 }),
            item({ id: 'c' }),
        ]));

        expect(result.invalidItemIds).toEqual(new Set(['a', 'b']));
        expect(result.issues).toHaveLength(2);
        expect(result.invalidItemIds.has('c')).toBe(false);
    });
});
