import { describe, expect, it } from 'vitest';
import type { Estimate } from '../types';
import { EstimateCategory, EstimateStatus } from '../types';
import {
  createEstimateTransfer,
  mergeImportedEstimate,
  parseEstimateTransfer,
  pickChangedRecordsByIds,
  prepareEstimatesForExport,
  prepareSharedEstimateImport,
} from './database';

const createEstimate = (id: string): Estimate => ({
  id,
  estimateNumber: `SM-2026-001-${id}`,
  client: 'Client',
  date: '2026-02-26',
  status: EstimateStatus.DRAFT,
  version: 1,
  items: [],
  total: 0,
  buildingType: 'Каркасный дом',
  area: 100,
});

describe('pickChangedRecordsByIds', () => {
  it('returns only records with changed ids', () => {
    const records = [createEstimate('a'), createEstimate('b'), createEstimate('c')];

    const result = pickChangedRecordsByIds(records, ['b']);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('b');
  });

  it('returns empty when changed list is empty', () => {
    const records = [createEstimate('a')];

    const result = pickChangedRecordsByIds(records, []);

    expect(result).toEqual([]);
  });
});

describe('prepareEstimatesForExport', () => {
  it('omits the internal explanation from backup data without mutating the estimate', () => {
    const estimate = { ...createEstimate('internal'), explanation: 'дом под ключ' };

    const [exported] = prepareEstimatesForExport([estimate]);

    expect(exported).not.toHaveProperty('explanation');
    expect(estimate.explanation).toBe('дом под ключ');
  });

  it('preserves an existing internal explanation when importing a sanitized backup', () => {
    const existing = { ...createEstimate('internal'), explanation: 'дом под ключ' };
    const [sanitized] = prepareEstimatesForExport([existing]);

    expect(mergeImportedEstimate(sanitized, existing).explanation).toBe('дом под ключ');
    expect(mergeImportedEstimate({ ...sanitized, explanation: '' }, existing).explanation).toBe('');
  });
});

describe('estimate transfer', () => {
  it('exports and reads exactly one sanitized estimate', () => {
    const futureSection = 'БУДУЩИЙ РАЗДЕЛ' as EstimateCategory;
    const source: Estimate = {
      ...createEstimate('shared'),
      explanation: 'internal note',
      selectedSections: [EstimateCategory.SEWERAGE],
      items: [
        { id: 'water', name: 'Коллектор', unit: 'шт', quantity: 1, price: 10, total: 10, category: EstimateCategory.WATER_SUPPLY },
        { id: 'general', name: 'Общая работа', unit: 'шт', quantity: 1, price: 20, total: 20, category: EstimateCategory.GENERAL },
        { id: 'future', name: 'Будущая работа', unit: 'шт', quantity: 1, price: 30, total: 30, category: futureSection },
      ],
      total: 60,
    };

    const received = parseEstimateTransfer(createEstimateTransfer(source));

    expect(received).toMatchObject({ id: 'shared', estimateNumber: source.estimateNumber });
    expect(received.selectedSections).toEqual([EstimateCategory.SEWERAGE]);
    expect(received.items.map(item => item.category)).toEqual([
      EstimateCategory.WATER_SUPPLY,
      EstimateCategory.GENERAL,
      futureSection,
    ]);
    expect(received).not.toHaveProperty('explanation');
  });

  it('creates an independent estimate with new ids when importing a shared estimate', () => {
    const source: Estimate = {
      ...createEstimate('source'),
      items: [{ id: 'original-item', name: 'Work', unit: 'pcs', quantity: 1, price: 10, total: 10, category: EstimateCategory.GENERAL }],
    };

    const result = prepareSharedEstimateImport(source, [], new Date('2026-08-16T10:00:00.000Z'), 'imported-id');

    expect(result.numberChanged).toBe(false);
    expect(result.estimate).toMatchObject({
      id: 'imported-id',
      estimateNumber: source.estimateNumber,
      version: 1,
      parentId: undefined,
      isArchived: false,
    });
    expect(result.estimate.items[0].id).toBe('imported-id-item-1');
  });

  it('assigns a new estimate number instead of replacing an existing estimate', () => {
    const source = createEstimate('source');

    const result = prepareSharedEstimateImport(
      source,
      [source.estimateNumber],
      new Date('2026-08-16T10:00:00.000Z'),
      'imported-id',
    );

    expect(result.numberChanged).toBe(true);
    expect(result.estimate.estimateNumber).not.toBe(source.estimateNumber);
  });

  it('rejects a full backup in the single-estimate flow', () => {
    expect(() => parseEstimateTransfer(JSON.stringify({ estimates: [createEstimate('backup')] }))).toThrow('не файл обмена');
  });
});
