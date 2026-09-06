import { describe, expect, it } from 'vitest';
import {
    ESTIMATE_CATEGORIES,
    EstimateCategory,
    EstimateSubgroup,
    type CustomSectionId,
    type SectionId,
    type EstimateItem,
} from '../types';
import {
    CATALOG_CATEGORIES,
    getEstimateCategories,
    getSectionLabel,
    getSectionSubgroups,
    normalizeEstimateCategory,
    addUserEstimateSection,
    createEstimateSectionsDocument,
    preserveEstimateSectionSnapshot,
    renameUserEstimateSection,
    reorderEstimateSections,
    resolveEstimateSectionsConflict,
    setUserEstimateSectionArchived,
    tryMergeEstimateSectionsDocuments,
} from './estimateSections';

const item = (category: SectionId, subgroup?: EstimateSubgroup): EstimateItem => ({
    id: `item-${category}-${subgroup ?? 'default'}`,
    name: 'Позиция',
    unit: 'шт',
    quantity: 1,
    price: 100,
    total: 100,
    category,
    subgroup,
});

describe('estimate section registry', () => {
    it('offers engineering sections in estimate order and keeps GENERAL catalog-only', () => {
        expect(ESTIMATE_CATEGORIES).toContain(EstimateCategory.WATER_SUPPLY);
        expect(ESTIMATE_CATEGORIES).toContain(EstimateCategory.SEWERAGE);
        expect(ESTIMATE_CATEGORIES).not.toContain(EstimateCategory.GENERAL);
        expect(CATALOG_CATEGORIES).toContain(EstimateCategory.GENERAL);
        expect(ESTIMATE_CATEGORIES.indexOf(EstimateCategory.WATER_SUPPLY))
            .toBeLessThan(ESTIMATE_CATEGORIES.indexOf(EstimateCategory.SEWERAGE));
    });

    it('normalizes water and sewer AI aliases through the shared registry', () => {
        expect(normalizeEstimateCategory('Монтаж ХВС и ГВС')).toBe(EstimateCategory.WATER_SUPPLY);
        expect(normalizeEstimateCategory('Наружная канализация и септик')).toBe(EstimateCategory.SEWERAGE);
        expect(normalizeEstimateCategory('Отведение сточных вод')).toBe(EstimateCategory.SEWERAGE);
        expect(normalizeEstimateCategory('Монтаж водосточной системы')).toBe(EstimateCategory.ROOF);
        expect(normalizeEstimateCategory(EstimateCategory.SEWERAGE)).toBe(EstimateCategory.SEWERAGE);
        expect(normalizeEstimateCategory('неизвестная категория')).toBeNull();
    });

    it('keeps empty selected, legacy GENERAL, and unknown persisted sections visible', () => {
        const futureSection = 'БУДУЩИЙ РАЗДЕЛ' as EstimateCategory;
        const categories = getEstimateCategories(
            [item(EstimateCategory.GENERAL), item(futureSection)],
            [EstimateCategory.SEWERAGE],
        );

        expect(categories).toEqual([
            EstimateCategory.SEWERAGE,
            EstimateCategory.GENERAL,
            futureSection,
        ]);
        expect(getSectionLabel(futureSection)).toBe(futureSection);
    });

    it('shows persisted subgroups in addition to registry defaults', () => {
        expect(getSectionSubgroups(EstimateCategory.LOGISTICS, [item(EstimateCategory.LOGISTICS, EstimateSubgroup.MATERIALS)]))
            .toEqual([EstimateSubgroup.WORKS, EstimateSubgroup.DELIVERY, EstimateSubgroup.MATERIALS]);
    });

    it('adds, renames, reorders, archives and restores a stable custom section id', () => {
        const id = 'custom:11111111-1111-4111-8111-111111111111' as CustomSectionId;
        const base = createEstimateSectionsDocument('user-1');
        const added = addUserEstimateSection(base, '  Отделочные   работы  ', new Date('2026-09-05T10:00:00Z'), id);
        expect(added.definitions[0]).toMatchObject({ id, label: 'Отделочные работы', archived: false });

        const renamed = renameUserEstimateSection(added, id, 'Чистовая отделка', new Date('2026-09-05T11:00:00Z'));
        const reordered = reorderEstimateSections(renamed, [id, ...renamed.order.filter(value => value !== id)]);
        expect(reordered.order[0]).toBe(id);

        const archived = setUserEstimateSectionArchived(reordered, id, true);
        expect(archived.definitions[0].archived).toBe(true);
        expect(archived.order).not.toContain(id);

        const restored = setUserEstimateSectionArchived(archived, id, false);
        expect(restored.definitions[0]).toMatchObject({ id, label: 'Чистовая отделка', archived: false });
        expect(restored.order.at(-1)).toBe(id);
    });

    it('rejects duplicate names with whitespace, case and ё normalization', () => {
        const id = 'custom:22222222-2222-4222-8222-222222222222' as CustomSectionId;
        const document = addUserEstimateSection(createEstimateSectionsDocument('user-1'), 'Тёплый контур', new Date(), id);
        expect(() => addUserEstimateSection(document, '  ТЕПЛЫЙ   КОНТУР ')).toThrow('уже существует');
    });

    it('preserves a saved estimate label after the account section is renamed', () => {
        const id = 'custom:33333333-3333-4333-8333-333333333333' as CustomSectionId;
        const original = addUserEstimateSection(createEstimateSectionsDocument('user-1'), 'Авторский надзор', new Date(), id);
        const firstSnapshot = preserveEstimateSectionSnapshot({ items: [item(id)], selectedSections: [id] }, original);
        const renamed = renameUserEstimateSection(original, id, 'Технический надзор');
        const savedAgain = preserveEstimateSectionSnapshot({ items: [item(id)], selectedSections: [id], sectionSnapshot: firstSnapshot }, renamed);

        expect(savedAgain).toEqual([{ id, label: 'Авторский надзор', order: 0 }]);
        expect(getSectionLabel(id, savedAgain, renamed)).toBe('Авторский надзор');
    });

    it('resolves a concurrent edit against the latest server revision', () => {
        const localId = 'custom:55555555-5555-4555-8555-555555555555' as CustomSectionId;
        const remoteId = 'custom:66666666-6666-4666-8666-666666666666' as CustomSectionId;
        const local = addUserEstimateSection(createEstimateSectionsDocument('user-1'), 'Локальный раздел', new Date(), localId);
        const remote = addUserEstimateSection(createEstimateSectionsDocument('user-1'), 'Удалённый раздел', new Date(), remoteId);
        const conflicted = {
            ...local,
            syncConflict: {
                local: { definitions: local.definitions, order: local.order, serverRevision: 1 },
                remote: { definitions: remote.definitions, order: remote.order, serverRevision: 4 },
                detectedAt: '2026-09-06T12:00:00.000Z',
            },
        };

        const resolved = resolveEstimateSectionsConflict(conflicted, 'remote');

        expect(resolved.definitions).toEqual(remote.definitions);
        expect(resolved.serverRevision).toBe(4);
        expect(resolved.syncConflict).toBeUndefined();
        expect(resolved.operationId).toBeTruthy();
    });

    it('automatically merges independent additions from two devices', () => {
        const localId = 'custom:77777777-7777-4777-8777-777777777777' as CustomSectionId;
        const remoteId = 'custom:88888888-8888-4888-8888-888888888888' as CustomSectionId;
        const base = { ...createEstimateSectionsDocument('user-1'), serverRevision: 2 };
        const local = addUserEstimateSection(base, 'Локальный', new Date('2026-09-06T10:00:00Z'), localId);
        const remote = {
            ...addUserEstimateSection(base, 'Серверный', new Date('2026-09-06T10:01:00Z'), remoteId),
            serverRevision: 3,
            baseDocument: undefined,
        };

        const merged = tryMergeEstimateSectionsDocuments(local, remote);

        expect(merged?.definitions.map(section => section.id)).toEqual([localId, remoteId]);
        expect(merged?.order).toContain(localId);
        expect(merged?.order).toContain(remoteId);
        expect(merged?.serverRevision).toBe(3);
        expect(merged?.operationId).toBeTruthy();
    });

    it('requires a choice when the same section is renamed differently', () => {
        const id = 'custom:99999999-9999-4999-8999-999999999999' as CustomSectionId;
        const original = { ...addUserEstimateSection(createEstimateSectionsDocument('user-1'), 'Исходное имя', new Date(), id), serverRevision: 1 };
        const local = renameUserEstimateSection(original, id, 'Локальное имя');
        const remote = {
            ...renameUserEstimateSection(original, id, 'Серверное имя'),
            serverRevision: 2,
            baseDocument: undefined,
        };

        expect(tryMergeEstimateSectionsDocuments(local, remote)).toBeNull();
    });
});
