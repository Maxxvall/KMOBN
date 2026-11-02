import { describe, expect, it } from 'vitest';
import { Estimate, EstimateCategory, EstimateStatus } from '../types';
import { applyEstimateSave, normalizeEstimateChains, setEstimateChainArchived } from './estimateLifecycle';
import { getEstimateCategories, preserveEstimateSectionSnapshot, setEstimateSectionOrder } from './estimateSections';

const estimate = (overrides: Partial<Estimate> & Pick<Estimate, 'id' | 'version'>): Estimate => ({
    estimateNumber: 'SM-1',
    client: 'Клиент',
    date: `2026-07-${String(overrides.version).padStart(2, '0')}`,
    status: EstimateStatus.DRAFT,
    items: [{ id: 'item', name: 'Работа', unit: 'шт', quantity: 1, price: 1, total: 1, category: EstimateCategory.GENERAL }],
    total: 1,
    buildingType: 'Дом',
    area: 10,
    ...overrides,
});

describe('normalizeEstimateChains', () => {
    it.each(['overwrite', 'new'] as const)('retains individual section order after %s and reopen without touching the old version', saveMode => {
        const old = estimate({ id: 'ordered-v1', version: 1, selectedSections: [EstimateCategory.ROOF, EstimateCategory.WALLS] });
        const order = [EstimateCategory.ROOF, EstimateCategory.GENERAL, EstimateCategory.WALLS];
        const draft = setEstimateSectionOrder(old, order);
        const saved = applyEstimateSave({ estimates: [old], draft: { ...draft, sectionSnapshot: preserveEstimateSectionSnapshot(draft) }, saveMode, now: '2026-11-02', newId: 'ordered-v2' });
        const reopened = JSON.parse(JSON.stringify(saved.at(-1))) as Estimate;
        expect(getEstimateCategories(reopened.items, reopened.selectedSections, reopened.sectionSnapshot)).toEqual(order);
        expect(reopened.items).toEqual(old.items);
        expect(reopened.total).toBe(old.total);
        if (saveMode === 'new') expect(saved[0].sectionSnapshot).toBeUndefined();
    });
    it('does not archive a chain because an old version was auto-archived', () => {
        const old = estimate({ id: 'v1', version: 1, isArchived: true, status: 'В архиве' as EstimateStatus });
        const latest = estimate({ id: 'v2', version: 2, status: EstimateStatus.APPROVED });

        const result = normalizeEstimateChains([old, latest]).normalized;

        expect(result.every(item => item.isArchived === false)).toBe(true);
        expect(result.find(item => item.id === 'v1')?.status).toBe(EstimateStatus.APPROVED);
    });

    it('migrates a latest legacy archive status to a chain-level flag', () => {
        const old = estimate({ id: 'v1', version: 1, status: EstimateStatus.SENT });
        const latest = estimate({ id: 'v2', version: 2, status: 'В архиве' as EstimateStatus });

        const result = normalizeEstimateChains([old, latest]).normalized;

        expect(result.every(item => item.isArchived)).toBe(true);
        expect(result.find(item => item.id === 'v2')?.status).toBe(EstimateStatus.SENT);
    });

    it('keeps the status selected by the user when overwriting latest', () => {
        const latest = estimate({ id: 'v1', version: 1, status: EstimateStatus.DRAFT });
        const draft = { ...latest, status: EstimateStatus.APPROVED };

        const result = applyEstimateSave({ estimates: [latest], draft, saveMode: 'overwrite', now: '2026-07-14', newId: 'unused' });

        expect(result[0].status).toBe(EstimateStatus.APPROVED);
        expect(result[0].version).toBe(1);
    });

    it('restores an archived chain on save by default', () => {
        const old = estimate({ id: 'v1', version: 1, isArchived: true });
        const latest = estimate({ id: 'v2', version: 2, isArchived: true });

        const result = applyEstimateSave({ estimates: [old, latest], draft: latest, saveMode: 'overwrite', now: '2026-07-14', newId: 'unused' });

        expect(result.every(item => item.isArchived === false)).toBe(true);
    });

    it('can update an archived estimate without restoring it', () => {
        const latest = estimate({ id: 'v1', version: 1, isArchived: true });

        const result = applyEstimateSave({ estimates: [latest], draft: latest, saveMode: 'overwrite', now: '2026-07-14', newId: 'unused', restoreFromArchive: false });

        expect(result[0].isArchived).toBe(true);
    });

    it('creates a new version inside an archived chain when restore is disabled', () => {
        const old = estimate({ id: 'v1', version: 1, isArchived: true });
        const latest = estimate({ id: 'v2', version: 2, isArchived: true, status: EstimateStatus.SENT });
        const draft = { ...latest, status: EstimateStatus.APPROVED };

        const result = applyEstimateSave({
            estimates: [old, latest],
            draft,
            saveMode: 'new',
            now: '2026-07-14',
            newId: 'v3',
            restoreFromArchive: false,
        });

        expect(result).toHaveLength(3);
        expect(result.every(item => item.isArchived)).toBe(true);
        expect(result.find(item => item.id === 'v3')).toMatchObject({
            version: 3,
            status: EstimateStatus.APPROVED,
            isArchived: true,
        });
    });

    it('propagates the latest archive flag to every historical version', () => {
        const old = estimate({ id: 'v1', version: 1, isArchived: false });
        const latest = estimate({ id: 'v2', version: 2, isArchived: true, status: EstimateStatus.APPROVED });

        const { normalized, changed } = normalizeEstimateChains([old, latest]);

        expect(changed).toBe(true);
        expect(normalized.every(item => item.isArchived)).toBe(true);
        expect(normalized.every(item => item.status !== ('В архиве' as EstimateStatus))).toBe(true);
    });

    it('prefers a business-status duplicate over a legacy auto-archived duplicate of the same version', () => {
        const current = estimate({ id: 'current', version: 2, status: EstimateStatus.APPROVED, date: '2026-07-01' });
        const legacyDuplicate = estimate({ id: 'legacy', version: 2, status: 'В архиве' as EstimateStatus, isArchived: true, date: '2026-07-14' });

        const { normalized } = normalizeEstimateChains([current, legacyDuplicate]);

        expect(normalized.every(item => item.isArchived === false)).toBe(true);
        expect(normalized.every(item => item.status === EstimateStatus.APPROVED)).toBe(true);
    });

    it('creates a new latest version instead of overwriting a historical snapshot', () => {
        const old = estimate({ id: 'v1', version: 1, status: EstimateStatus.DRAFT });
        const latest = estimate({ id: 'v2', version: 2, status: EstimateStatus.SENT });
        const draft = { ...old, status: EstimateStatus.APPROVED };

        const result = applyEstimateSave({ estimates: [old, latest], draft, saveMode: 'overwrite', now: '2026-07-14', newId: 'v3' });

        expect(result).toHaveLength(3);
        expect(result.find(item => item.id === 'v2')?.status).toBe(EstimateStatus.SENT);
        expect(result.find(item => item.id === 'v3')).toMatchObject({ version: 3, status: EstimateStatus.APPROVED });
    });

    it('archives and restores every version in a chain', () => {
        const first = estimate({ id: 'v1', version: 1 });
        const second = estimate({ id: 'v2', version: 2 });

        const archived = setEstimateChainArchived([first, second], 'SM-1', true);
        const restored = setEstimateChainArchived(archived, 'SM-1', false);

        expect(archived.every(item => item.isArchived)).toBe(true);
        expect(restored.every(item => item.isArchived === false)).toBe(true);
    });

    it('archives legacy versions whose estimate number has a different runtime type', () => {
        const numericLegacy = estimate({ id: 'v1', version: 1, estimateNumber: 123 as unknown as string });
        const stringCurrent = estimate({ id: 'v2', version: 2, estimateNumber: '123' });

        const archived = setEstimateChainArchived([numericLegacy, stringCurrent], '123', true);

        expect(archived.every(item => item.isArchived)).toBe(true);
    });
});
