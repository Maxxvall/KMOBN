import type { EstimateLabelDefinition } from '../types';

export const TYPICAL_PROJECT_LABEL_ID = 'system:typical-projects';
export const MAX_ESTIMATE_LABELS = 2;
export const MAX_ESTIMATE_LABEL_NAME_LENGTH = 64;
const systemLabel: EstimateLabelDefinition = { id: TYPICAL_PROJECT_LABEL_ID, name: 'Типовые проекты' };
type LabelDocument = { labels?: EstimateLabelDefinition[] };
type LabelAssignment = { labelIds?: unknown };
const isLabelId = (value: unknown): value is string => typeof value === 'string'
    && (value === TYPICAL_PROJECT_LABEL_ID || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value));
export const normalizeEstimateLabelName = (value: string): string => value.trim().replace(/\s+/g, ' ');
const nameKey = (value: string) => normalizeEstimateLabelName(value).toLocaleLowerCase('ru-RU');

export const normalizeEstimateLabelDefinitions = (value: unknown): EstimateLabelDefinition[] => {
    const byId = new Map<string, EstimateLabelDefinition>();
    for (const entry of Array.isArray(value) ? value : []) {
        if (!entry || typeof entry !== 'object' || !('id' in entry) || !('name' in entry)) continue;
        if (!isLabelId(entry.id) || entry.id === TYPICAL_PROJECT_LABEL_ID || typeof entry.name !== 'string') continue;
        const name = normalizeEstimateLabelName(entry.name);
        if (!name || name.length > MAX_ESTIMATE_LABEL_NAME_LENGTH) continue;
        if (!byId.has(entry.id) || entry.deleted === true) byId.set(entry.id, { id: entry.id, name, ...(entry.deleted === true ? { deleted: true } : {}) });
    }
    return [{ ...systemLabel }, ...byId.values()];
};

export const normalizeEstimateLabelIds = (value: unknown): string[] => Array.isArray(value)
    ? [...new Set(value.filter(isLabelId))].slice(0, MAX_ESTIMATE_LABELS) : [];
export const getActiveEstimateLabels = (document?: LabelDocument | null): EstimateLabelDefinition[] => (
    normalizeEstimateLabelDefinitions(document?.labels).filter(label => !label.deleted)
);
export const getEffectiveEstimateLabelIds = (estimate: LabelAssignment, document?: LabelDocument | null): string[] => {
    const active = new Set(getActiveEstimateLabels(document).map(label => label.id));
    return Array.isArray(estimate.labelIds)
        ? [...new Set(estimate.labelIds.filter((id): id is string => isLabelId(id) && active.has(id)))].slice(0, MAX_ESTIMATE_LABELS) : [];
};
export const getActiveEstimateLabelFilterIds = (selected: readonly string[], document?: LabelDocument | null): string[] => {
    const active = new Set(getActiveEstimateLabels(document).map(label => label.id));
    return [...new Set(selected)].filter(id => active.has(id));
};
export const matchesEstimateLabels = (estimate: LabelAssignment, selected: readonly string[], document?: LabelDocument | null, withoutLabels = false, archiveView: 'current' | 'archive' = 'current'): boolean => {
    if (archiveView === 'archive') return true;
    const ids = getEffectiveEstimateLabelIds(estimate, document);
    return withoutLabels ? ids.length === 0 : getActiveEstimateLabelFilterIds(selected, document).every(id => ids.includes(id));
};
export const isTypicalProject = (estimate: LabelAssignment): boolean => getEffectiveEstimateLabelIds(estimate).includes(TYPICAL_PROJECT_LABEL_ID);

export const validateEstimateLabelName = (document: LabelDocument, value: string, exceptId?: string): string => {
    const name = normalizeEstimateLabelName(value);
    if (!name) throw new Error('Введите название метки.');
    if (name.length > MAX_ESTIMATE_LABEL_NAME_LENGTH) throw new Error(`Название метки должно быть не длиннее ${MAX_ESTIMATE_LABEL_NAME_LENGTH} символов.`);
    if (getActiveEstimateLabels(document).some(label => label.id !== exceptId && nameKey(label.name) === nameKey(name))) throw new Error('Метка с таким названием уже существует.');
    return name;
};

/** Existing definitions are canonical; only new IDs may arrive from a backup. */
export const mergeImportedEstimateLabels = (existing: unknown, incoming: unknown): EstimateLabelDefinition[] => {
    const current = normalizeEstimateLabelDefinitions(existing);
    const ids = new Set(current.map(label => label.id));
    for (const label of normalizeEstimateLabelDefinitions(incoming)) {
        if (ids.has(label.id)) continue;
        if (!label.deleted) validateEstimateLabelName({ labels: current }, label.name);
        current.push(label);
        ids.add(label.id);
    }
    return current;
};
