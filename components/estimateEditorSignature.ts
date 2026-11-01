import type { Estimate, EstimateItem } from '../types';

// Pure dirty-signature hashing for the estimate editor. Extracted verbatim
// from EstimateEditor so benchmarks and future callers share one definition.

const hashText = (seed: number, value: string): number => {
    let next = seed;
    for (let index = 0; index < value.length; index += 1) {
        next = (next * 31 + value.charCodeAt(index)) | 0;
    }
    return (next * 31 + 124) | 0;
};

const hashNumber = (seed: number, value: number): number => {
    return (seed * 31 + Math.round(value * 1000)) | 0;
};

const hashBoolean = (seed: number, value: boolean): number => {
    return (seed * 31 + (value ? 1 : 0)) | 0;
};

export const buildEstimateDirtySignature = (value: Estimate): number => {
    let hash = 17;
    hash = hashText(hash, value.client);
    hash = hashText(hash, value.date);
    hash = hashText(hash, value.status);
    hash = hashText(hash, value.buildingType);
    hash = hashNumber(hash, value.area || 0);
    hash = hashText(hash, value.explanation || '');
    hash = hashNumber(hash, value.total || 0);
    hash = hashBoolean(hash, Boolean(value.needsPriceUpdate));
    hash = hashText(hash, value.houseExecutionStatus || '');
    hash = hashText(hash, value.houseActualBasis || '');
    hash = hashText(hash, value.houseActualVerifiedAt || '');
    for (const category of value.selectedSections ?? []) {
        hash = hashText(hash, category);
    }

    for (const item of value.items) {
        hash = hashText(hash, item.id);
        hash = hashText(hash, item.name);
        hash = hashText(hash, item.unit);
        hash = hashNumber(hash, item.quantity || 0);
        hash = hashNumber(hash, item.price || 0);
        hash = hashText(hash, item.category);
        hash = hashText(hash, item.subgroup || '');
    }
    return hash;
};

export const buildEstimateItemsSignature = (items: EstimateItem[]): number => {
    let hash = 17;
    for (const item of items) {
        hash = hashText(hash, item.id);
        hash = hashText(hash, item.name);
        hash = hashText(hash, item.unit);
        hash = hashNumber(hash, item.quantity || 0);
        hash = hashNumber(hash, item.price || 0);
        hash = hashText(hash, item.category);
        hash = hashText(hash, item.subgroup || '');
    }
    return hash;
};
