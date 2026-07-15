import { Estimate, EstimateStatus } from '../types';

const LEGACY_ARCHIVED_STATUS = 'В архиве';

export const normalizeEstimateChains = (raw: Estimate[]): { normalized: Estimate[]; changed: boolean } => {
    const byNumber = new Map<string, Estimate[]>();
    raw.forEach(estimate => {
        const key = estimate.estimateNumber || estimate.id;
        byNumber.set(key, [...(byNumber.get(key) ?? []), estimate]);
    });

    let changed = false;
    const normalized: Estimate[] = [];

    byNumber.forEach(list => {
        const byNewestVersion = [...list].sort((left, right) => {
            if (right.version !== left.version) return right.version - left.version;
            const leftLegacyArchive = (left.status as string) === LEGACY_ARCHIVED_STATUS;
            const rightLegacyArchive = (right.status as string) === LEGACY_ARCHIVED_STATUS;
            if (leftLegacyArchive !== rightLegacyArchive) return leftLegacyArchive ? 1 : -1;
            return new Date(right.updated_at || right.date).getTime() - new Date(left.updated_at || left.date).getTime();
        });
        const latestRaw = byNewestVersion[0];
        // Older releases marked historical versions as archived automatically.
        // Only the latest version is authoritative for the chain lifecycle.
        const chainArchived = (latestRaw?.status as string) === LEGACY_ARCHIVED_STATUS || Boolean(latestRaw?.isArchived);
        const recoveredStatus = byNewestVersion.find(item => (item.status as string) !== LEGACY_ARCHIVED_STATUS)?.status ?? EstimateStatus.DRAFT;
        const migrated = list.map(item => {
            const hadLegacyStatus = (item.status as string) === LEGACY_ARCHIVED_STATUS;
            const next: Estimate = {
                ...item,
                status: hadLegacyStatus ? recoveredStatus : item.status,
                isArchived: chainArchived,
            };
            if (hadLegacyStatus || next.isArchived !== item.isArchived) changed = true;
            return next;
        });

        const sorted = [...migrated].sort((left, right) => {
            if (right.version !== left.version) return right.version - left.version;
            return new Date(right.date).getTime() - new Date(left.date).getTime();
        });
        const latest = sorted[0];
        sorted.forEach(item => {
            const parentId = item.id === latest.id ? undefined : latest.id;
            if (item.parentId !== parentId) changed = true;
            normalized.push({ ...item, parentId });
        });
    });

    return { normalized, changed };
};

export type EstimateSaveMode = 'overwrite' | 'new';

type ApplyEstimateSaveInput = {
    estimates: Estimate[];
    draft: Estimate;
    saveMode: EstimateSaveMode;
    now: string;
    newId: string;
    restoreFromArchive?: boolean;
};

export const applyEstimateSave = ({
    estimates,
    draft,
    saveMode,
    now,
    newId,
    restoreFromArchive = true,
}: ApplyEstimateSaveInput): Estimate[] => {
    const chain = estimates.filter(item => item.estimateNumber === draft.estimateNumber);
    const latest = chain.reduce<Estimate | null>((best, item) => !best || item.version > best.version ? item : best, null);
    const maxVersion = chain.reduce((max, item) => Math.max(max, item.version), 0);
    const nextArchived = Boolean(latest?.isArchived) && !restoreFromArchive;
    const effectiveMode: EstimateSaveMode = saveMode === 'overwrite' && latest && draft.id !== latest.id ? 'new' : saveMode;

    if (effectiveMode === 'overwrite') {
        if (!latest) return [...estimates, { ...draft, date: now }];
        const updated: Estimate = {
            ...draft,
            id: latest.id,
            version: latest.version,
            parentId: latest.parentId,
            date: now,
            sortOrder: latest.sortOrder,
            isArchived: nextArchived,
        };
        return estimates.map(item => item.estimateNumber !== draft.estimateNumber
            ? item
            : item.id === latest.id ? updated : { ...item, isArchived: nextArchived });
    }

    if (!latest) return [...estimates, { ...draft, version: 1, date: now }];
    const newVersion: Estimate = {
        ...draft,
        id: newId,
        version: maxVersion + 1,
        date: now,
        parentId: latest.parentId || latest.id,
        isArchived: nextArchived,
        sortOrder: latest.sortOrder,
    };
    return [
        ...estimates.map(item => item.estimateNumber === draft.estimateNumber ? { ...item, isArchived: nextArchived } : item),
        newVersion,
    ];
};

export const setEstimateChainArchived = (estimates: Estimate[], estimateNumber: string, archived: boolean): Estimate[] => {
    const chainKey = String(estimateNumber);
    return estimates.map(item => String(item.estimateNumber) === chainKey ? { ...item, isArchived: archived } : item);
};
