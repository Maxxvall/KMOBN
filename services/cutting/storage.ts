import { CuttingItem, CuttingSettings, CuttingSkippedRow, CuttingStageId } from './types';

const STORAGE_KEY = 'kmobn:cutting-draft:v1';
const STAGE_MAPPINGS_KEY = 'kmobn:cutting-stage-mappings:v1';

export interface CuttingDraft {
    fileName: string;
    items: CuttingItem[];
    settings: CuttingSettings;
    skippedRows?: number;
    skippedDetails?: CuttingSkippedRow[];
    updatedAt: string;
}

export const loadCuttingDraft = (): CuttingDraft | null => {
    if (typeof window === 'undefined') return null;
    try {
        const value = window.localStorage.getItem(STORAGE_KEY);
        return value ? JSON.parse(value) as CuttingDraft : null;
    } catch {
        return null;
    }
};

export const saveCuttingDraft = (draft: CuttingDraft): void => {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    } catch (error) {
        console.error('Не удалось сохранить черновик раскроя:', error);
    }
};

export const clearCuttingDraft = (): void => {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(STORAGE_KEY);
};

export const loadCuttingStageMappings = (): Record<string, CuttingStageId> => {
    if (typeof window === 'undefined') return {};
    try {
        return JSON.parse(window.localStorage.getItem(STAGE_MAPPINGS_KEY) ?? '{}') as Record<string, CuttingStageId>;
    } catch {
        return {};
    }
};

export const saveCuttingStageMapping = (construction: string, stage: CuttingStageId): void => {
    if (typeof window === 'undefined') return;
    const mappings = loadCuttingStageMappings();
    mappings[construction.toLocaleLowerCase('ru-RU').trim()] = stage;
    window.localStorage.setItem(STAGE_MAPPINGS_KEY, JSON.stringify(mappings));
};
