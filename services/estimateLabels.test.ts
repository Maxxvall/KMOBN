import { describe, expect, it } from 'vitest';
import { getActiveEstimateLabelFilterIds, getEffectiveEstimateLabelIds, matchesEstimateLabels, normalizeEstimateLabelDefinitions, TYPICAL_PROJECT_LABEL_ID } from './estimateLabels';

describe('estimate labels', () => {
    it('protects the system label and uses active unique assignments with AND matching', () => {
        const bath = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
        const deleted = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
        const document = { labels: normalizeEstimateLabelDefinitions([
            { id: TYPICAL_PROJECT_LABEL_ID, name: 'Подмена', deleted: true },
            { id: bath, name: 'Баня' }, { id: deleted, name: 'Удалена', deleted: true },
        ]) };
        expect(document.labels[0]).toEqual({ id: TYPICAL_PROJECT_LABEL_ID, name: 'Типовые проекты' });
        const estimate = { labelIds: [deleted, bath, bath, TYPICAL_PROJECT_LABEL_ID, 'unknown'] };
        expect(getEffectiveEstimateLabelIds(estimate, document)).toEqual([bath, TYPICAL_PROJECT_LABEL_ID]);
        expect(matchesEstimateLabels(estimate, [TYPICAL_PROJECT_LABEL_ID, bath], document)).toBe(true);
        expect(matchesEstimateLabels({ labelIds: [TYPICAL_PROJECT_LABEL_ID] }, [TYPICAL_PROJECT_LABEL_ID, bath], document)).toBe(false);
        expect(getEffectiveEstimateLabelIds({}, document)).toEqual([]);
        expect(matchesEstimateLabels({}, [bath], document, false, 'archive')).toBe(true);
        expect(matchesEstimateLabels(estimate, [], document, true)).toBe(false);
        expect(matchesEstimateLabels({ labelIds: [deleted] }, [], document, true)).toBe(true);
        expect(getActiveEstimateLabelFilterIds([bath, deleted], document)).toEqual([bath]);
    });
});
