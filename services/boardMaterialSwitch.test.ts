import { describe, expect, it } from 'vitest';
import {
  Estimate,
  EstimateCategory,
  EstimateItem,
  EstimateStatus,
  EstimateSubgroup,
  Material,
} from '../types';
import {
  applyBoardMaterialSwitch,
  buildTargetBoardSpec,
  getEstimateBoardState,
  planBoardMaterialSwitch,
  suggestBoardSpecFromName,
} from './boardMaterialSwitch';

const material = (patch: Partial<Material> & Pick<Material, 'id' | 'name'>): Material => ({
  price: 100,
  lastUpdated: '2026-08-03',
  category: EstimateCategory.WALLS,
  ...patch,
});

const item = (patch: Partial<EstimateItem> & Pick<EstimateItem, 'id' | 'name'>): EstimateItem => ({
  unit: 'шт',
  quantity: 1,
  price: 100,
  total: 100,
  category: EstimateCategory.WALLS,
  subgroup: EstimateSubgroup.MATERIALS,
  ...patch,
});

const estimate = (items: EstimateItem[]): Estimate => ({
  id: 'estimate-1',
  estimateNumber: 'СМ-1',
  client: 'Клиент',
  date: '2026-08-03',
  status: EstimateStatus.DRAFT,
  version: 1,
  items,
  total: items.reduce((sum, current) => sum + current.total, 0),
  buildingType: 'Каркасный дом',
  area: 100,
});

const dry95 = material({
  id: 'dry-95',
  name: 'Доска СС 95×45×6000',
  price: 820,
  boardSpec: { moisture: 'dry-planed', widthMm: 95, thicknessMm: 45, lengthMm: 6000 },
});

const wet100 = material({
  id: 'wet-100',
  name: 'Доска ЕВ 100×50×6000',
  price: 690,
  boardSpec: { moisture: 'natural-moisture', widthMm: 100, thicknessMm: 50, lengthMm: 6000 },
});

describe('boardMaterialSwitch', () => {
  describe('buildTargetBoardSpec', () => {
    it.each([
      [95, 45, 100, 50],
      [145, 45, 150, 50],
    ])('преобразует СС %d×%d в ЕВ %d×%d', (width, thickness, targetWidth, targetThickness) => {
      expect(buildTargetBoardSpec({
        moisture: 'dry-planed',
        widthMm: width,
        thicknessMm: thickness,
        lengthMm: 6000,
      }, 'natural-moisture')).toEqual({
        moisture: 'natural-moisture',
        widthMm: targetWidth,
        thicknessMm: targetThickness,
        lengthMm: 6000,
        pairGroupId: undefined,
      });
    });

    it.each([
      [100, 50, 95, 45],
      [150, 50, 145, 45],
    ])('преобразует ЕВ %d×%d в СС %d×%d', (width, thickness, targetWidth, targetThickness) => {
      expect(buildTargetBoardSpec({
        moisture: 'natural-moisture',
        widthMm: width,
        thicknessMm: thickness,
        lengthMm: 6000,
      }, 'dry-planed')).toEqual({
        moisture: 'dry-planed',
        widthMm: targetWidth,
        thicknessMm: targetThickness,
        lengthMm: 6000,
        pairGroupId: undefined,
      });
    });

    it('сохраняет длину доски без изменений', () => {
      const result = buildTargetBoardSpec({
        moisture: 'dry-planed',
        widthMm: 95,
        thicknessMm: 45,
        lengthMm: 3000,
      }, 'natural-moisture');

      expect(result?.lengthMm).toBe(3000);
    });
  });

  describe('suggestBoardSpecFromName', () => {
    it.each([
      ['Доска СС 95x45x6000', 'dry-planed', 95, 45, 6000],
      ['Доска сухая строганая 95х45х6000', 'dry-planed', 95, 45, 6000],
      ['Доска строганая сухая 95×45×6', 'dry-planed', 95, 45, 6000],
      ['Доска ЕВ 100*50*6000', 'natural-moisture', 100, 50, 6000],
      ['Доска ЕС 100×50, 6м', 'natural-moisture', 100, 50, 6000],
      ['Пиломатериал естественной влажности 150х50х6000', 'natural-moisture', 150, 50, 6000],
    ] as const)('парсит алиасы, разделители и длину: %s', (name, moisture, widthMm, thicknessMm, lengthMm) => {
      expect(suggestBoardSpecFromName(name)).toEqual({ moisture, widthMm, thicknessMm, lengthMm });
    });
  });

  describe('planBoardMaterialSwitch', () => {
    it('строит план для смешанной сметы и отмечает доску целевого типа', () => {
      const sourceEstimate = estimate([
        item({ id: 'dry-item', name: dry95.name, catalogMaterialId: dry95.id }),
        item({ id: 'wet-item', name: wet100.name, catalogMaterialId: wet100.id }),
      ]);

      expect(getEstimateBoardState(sourceEstimate, [dry95, wet100])).toBe('mixed');
      const plan = planBoardMaterialSwitch(sourceEstimate, [dry95, wet100], 'natural-moisture');
      expect(plan.replacements.map(replacement => replacement.itemId)).toEqual(['dry-item']);
      expect(plan.alreadyTarget).toEqual(['wet-item']);
    });

    it('сообщает об отсутствующей целевой доске', () => {
      const plan = planBoardMaterialSwitch(estimate([
        item({ id: 'i1', name: dry95.name, catalogMaterialId: dry95.id }),
      ]), [dry95], 'natural-moisture');

      expect(plan.missing).toHaveLength(1);
      expect(plan.missing[0]).toMatchObject({
        sourceMaterial: dry95,
        targetSpec: { moisture: 'natural-moisture', widthMm: 100, thicknessMm: 50, lengthMm: 6000 },
        affectedItemIds: ['i1'],
      });
      expect(plan.replacements).toEqual([]);
    });

    it('группирует одинаковую отсутствующую доску из разных категорий', () => {
      const dryRoof = { ...dry95, id: 'dry-95-roof', category: EstimateCategory.ROOF };
      const plan = planBoardMaterialSwitch(estimate([
        item({ id: 'walls-board', name: dry95.name, catalogMaterialId: dry95.id }),
        item({ id: 'roof-board', name: dryRoof.name, catalogMaterialId: dryRoof.id, category: EstimateCategory.ROOF }),
      ]), [dry95, dryRoof], 'natural-moisture');

      expect(plan.missing).toHaveLength(1);
      expect(plan.missing[0].affectedItemIds).toEqual(['walls-board', 'roof-board']);
    });

    it('сообщает о целевой доске без цены', () => {
      const unpriced = { ...wet100, price: 0 };
      const plan = planBoardMaterialSwitch(estimate([
        item({ id: 'i1', name: dry95.name, catalogMaterialId: dry95.id }),
      ]), [dry95, unpriced], 'natural-moisture');

      expect(plan.unpriced).toEqual([{ sourceMaterial: dry95, targetMaterial: unpriced, affectedItemIds: ['i1'] }]);
      expect(plan.replacements).toEqual([]);
    });

    it('сообщает о неоднозначном выборе между дублями', () => {
      const duplicate = { ...wet100, id: 'wet-100-duplicate', name: 'Доска ЕВ 100×50×6000, другой поставщик' };
      const plan = planBoardMaterialSwitch(estimate([
        item({ id: 'i1', name: dry95.name, catalogMaterialId: dry95.id }),
      ]), [dry95, wet100, duplicate], 'natural-moisture');

      expect(plan.ambiguous).toHaveLength(1);
      expect(plan.ambiguous[0].candidates.map(candidate => candidate.id)).toEqual(['wet-100', 'wet-100-duplicate']);
      expect(plan.ambiguous[0].affectedItemIds).toEqual(['i1']);
      expect(plan.replacements).toEqual([]);
    });

    it('предпочитает целевую доску из категории исходного материала', () => {
      const otherCategory = { ...wet100, id: 'wet-roof', category: EstimateCategory.ROOF };
      const plan = planBoardMaterialSwitch(estimate([
        item({ id: 'i1', name: dry95.name, catalogMaterialId: dry95.id }),
      ]), [dry95, otherCategory, wet100], 'natural-moisture');

      expect(plan.replacements).toHaveLength(1);
      expect(plan.replacements[0].targetMaterial.id).toBe(wet100.id);
      expect(plan.ambiguous).toEqual([]);
    });

    it('находит source material для legacy-строки по точному normalized name', () => {
      const plan = planBoardMaterialSwitch(estimate([
        item({ id: 'legacy', name: '  ДОСКА   СС 95×45×6000  ' }),
      ]), [dry95, wet100], 'natural-moisture');

      expect(plan.replacements).toHaveLength(1);
      expect(plan.replacements[0]).toMatchObject({ itemId: 'legacy', sourceMaterial: dry95, targetMaterial: wet100 });
    });

    it('не включает в план работы, доставку и actual-only строки', () => {
      const sourceEstimate = estimate([
        item({ id: 'work', name: dry95.name, subgroup: EstimateSubgroup.WORKS, catalogMaterialId: dry95.id }),
        item({ id: 'delivery', name: dry95.name, subgroup: EstimateSubgroup.DELIVERY, catalogMaterialId: dry95.id }),
        item({ id: 'actual-only', name: dry95.name, catalogMaterialId: dry95.id, isActualOnly: true }),
      ]);

      const plan = planBoardMaterialSwitch(sourceEstimate, [dry95, wet100], 'natural-moisture');
      expect(plan.replacements).toEqual([]);
      expect(plan.alreadyTarget).toEqual([]);
      expect(plan.ignored).toEqual([]);
    });
  });

  describe('applyBoardMaterialSwitch', () => {
    it('меняет только материал, цену и плановый итог строки', () => {
      const actual = { unit: 'м3', quantity: 2, price: 777, total: 1554, note: 'Факт' };
      const sourceItem = item({
        id: 'i1',
        name: dry95.name,
        catalogMaterialId: dry95.id,
        catalogWorkId: 'legacy-work-link',
        unit: 'м3',
        quantity: 3,
        price: dry95.price,
        total: dry95.price * 3,
        category: EstimateCategory.GRILLAGE,
        note: 'На лаги',
        actual,
      });
      const sourceEstimate = estimate([sourceItem]);
      const plan = planBoardMaterialSwitch(sourceEstimate, [dry95, wet100], 'natural-moisture');

      const result = applyBoardMaterialSwitch(sourceEstimate, plan);

      expect(result.items[0]).toEqual({
        ...sourceItem,
        name: wet100.name,
        price: wet100.price,
        total: sourceItem.quantity * wet100.price,
        catalogMaterialId: wet100.id,
        catalogWorkId: undefined,
      });
      expect(result.items[0]).toMatchObject({
        quantity: 3,
        unit: 'м3',
        category: EstimateCategory.GRILLAGE,
        note: 'На лаги',
        actual,
      });
    });

    it('пересчитывает общий итог сметы после замены', () => {
      const board = item({
        id: 'board',
        name: dry95.name,
        catalogMaterialId: dry95.id,
        quantity: 2,
        price: dry95.price,
        total: dry95.price * 2,
      });
      const unchanged = item({ id: 'work', name: 'Монтаж', subgroup: EstimateSubgroup.WORKS, total: 500 });
      const sourceEstimate = estimate([board, unchanged]);
      const plan = planBoardMaterialSwitch(sourceEstimate, [dry95, wet100], 'natural-moisture');

      const result = applyBoardMaterialSwitch(sourceEstimate, plan);

      expect(result.items[0].total).toBe(1380);
      expect(result.total).toBe(1880);
    });

    it('оставляет работы, доставку и actual-only строки без изменений', () => {
      const protectedItems = [
        item({ id: 'work', name: dry95.name, subgroup: EstimateSubgroup.WORKS, catalogMaterialId: dry95.id }),
        item({ id: 'delivery', name: dry95.name, subgroup: EstimateSubgroup.DELIVERY, catalogMaterialId: dry95.id }),
        item({ id: 'actual-only', name: dry95.name, catalogMaterialId: dry95.id, isActualOnly: true }),
      ];
      const sourceEstimate = estimate(protectedItems);
      const plan = planBoardMaterialSwitch(sourceEstimate, [dry95, wet100], 'natural-moisture');

      const result = applyBoardMaterialSwitch(sourceEstimate, plan);

      expect(result).toBe(sourceEstimate);
      expect(result.items).toEqual(protectedItems);
    });

    it('повторное переключение на тот же тип idempotent', () => {
      const sourceEstimate = estimate([
        item({ id: 'i1', name: dry95.name, catalogMaterialId: dry95.id, quantity: 2, total: dry95.price * 2 }),
      ]);
      const firstPlan = planBoardMaterialSwitch(sourceEstimate, [dry95, wet100], 'natural-moisture');
      const firstResult = applyBoardMaterialSwitch(sourceEstimate, firstPlan);
      const secondPlan = planBoardMaterialSwitch(firstResult, [dry95, wet100], 'natural-moisture');

      const secondResult = applyBoardMaterialSwitch(firstResult, secondPlan);

      expect(secondPlan.replacements).toEqual([]);
      expect(secondPlan.alreadyTarget).toEqual(['i1']);
      expect(secondResult).toBe(firstResult);
    });
  });
});
