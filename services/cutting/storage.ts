import { CuttingItem, CuttingSettings, CuttingSkippedRow, CuttingStageId } from './types';

const STORAGE_KEY = 'kmobn:cutting-draft:v1';
const STAGE_MAPPINGS_KEY = 'kmobn:cutting-stage-mappings:v1';

const scopedKey = (base: string, userId: string): string => {
  if (!userId) throw new Error('Для локального черновика требуется пользователь.');
  return `${base}:${encodeURIComponent(userId)}`;
};

export interface CuttingDraft {
    fileName: string;
    items: CuttingItem[];
    settings: CuttingSettings;
    skippedRows?: number;
    skippedDetails?: CuttingSkippedRow[];
    updatedAt: string;
}

export const loadCuttingDraft = (userId: string): CuttingDraft | null => {
    if (typeof window === 'undefined') return null;
    try {
        const value = window.localStorage.getItem(scopedKey(STORAGE_KEY, userId));
        return value ? JSON.parse(value) as CuttingDraft : null;
    } catch {
        return null;
    }
};

export const saveCuttingDraft = (userId: string, draft: CuttingDraft): void => {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(scopedKey(STORAGE_KEY, userId), JSON.stringify(draft));
    } catch (error) {
        console.error('Не удалось сохранить черновик раскроя:', error);
    }
};

export const clearCuttingDraft = (userId: string): void => {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(scopedKey(STORAGE_KEY, userId));
};

export const loadCuttingStageMappings = (userId: string): Record<string, CuttingStageId> => {
    if (typeof window === 'undefined') return {};
    try {
        return JSON.parse(window.localStorage.getItem(scopedKey(STAGE_MAPPINGS_KEY, userId)) ?? '{}') as Record<string, CuttingStageId>;
    } catch {
        return {};
    }
};

export const saveCuttingStageMapping = (userId: string, construction: string, stage: CuttingStageId): void => {
    if (typeof window === 'undefined') return;
    const mappings = loadCuttingStageMappings(userId);
    mappings[construction.toLocaleLowerCase('ru-RU').trim()] = stage;
    window.localStorage.setItem(scopedKey(STAGE_MAPPINGS_KEY, userId), JSON.stringify(mappings));
};
