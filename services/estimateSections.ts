import {
    ESTIMATE_SECTION_DEFINITIONS,
    EstimateCategory,
    EstimateItem,
    EstimateSectionSnapshot,
    EstimateSectionsDocument,
    EstimateSubgroup,
    SectionId,
    UserEstimateSectionDefinition,
    type CustomSectionId,
} from '../types';

export const ESTIMATE_SECTIONS_SCHEMA_VERSION = 1 as const;
export const MAX_USER_ESTIMATE_SECTIONS = 100;
export const MAX_SECTION_LABEL_LENGTH = 80;

export interface ResolvedEstimateSection {
    id: SectionId;
    label: string;
    description: string;
    icon: string;
    order: number;
    subgroups: readonly EstimateSubgroup[];
    aliases: readonly string[];
    builtIn: boolean;
    archived: boolean;
    catalogGlobal: boolean;
}

const builtInById = new Map<SectionId, typeof ESTIMATE_SECTION_DEFINITIONS[number]>(
    ESTIMATE_SECTION_DEFINITIONS.map(section => [section.id, section]),
);

export const normalizeSectionName = (value: unknown): string => String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е');

export const isCustomSectionId = (value: unknown): value is CustomSectionId => (
    typeof value === 'string' && /^custom:[0-9a-f-]{8,}$/i.test(value)
);

const createUuid = (): string => {
    if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, token => {
        const random = Math.floor(Math.random() * 16);
        return (token === 'x' ? random : (random & 0x3) | 0x8).toString(16);
    });
};

export const createEstimateSectionsDocument = (userId: string): EstimateSectionsDocument => ({
    id: userId,
    schemaVersion: ESTIMATE_SECTIONS_SCHEMA_VERSION,
    definitions: [],
    order: ESTIMATE_SECTION_DEFINITIONS
        .filter(section => !section.catalogGlobal)
        .sort((left, right) => left.order - right.order)
        .map(section => section.id),
    serverRevision: 0,
});

export const normalizeEstimateSectionsDocument = (
    value: Partial<EstimateSectionsDocument> | null | undefined,
    userId: string,
): EstimateSectionsDocument => {
    const fallback = createEstimateSectionsDocument(userId);
    const seenIds = new Set<string>();
    const seenNames = new Set<string>();
    const definitions = (Array.isArray(value?.definitions) ? value.definitions : [])
        .filter((section): section is UserEstimateSectionDefinition => {
            if (!isCustomSectionId(section?.id) || typeof section.label !== 'string') return false;
            const normalizedName = normalizeSectionName(section.label);
            if (!normalizedName || seenIds.has(section.id) || seenNames.has(normalizedName)) return false;
            seenIds.add(section.id);
            seenNames.add(normalizedName);
            return true;
        })
        .slice(0, MAX_USER_ESTIMATE_SECTIONS)
        .map(section => ({
            ...section,
            label: section.label.trim().replace(/\s+/g, ' ').slice(0, MAX_SECTION_LABEL_LENGTH),
            archived: Boolean(section.archived),
            createdAt: section.createdAt || new Date(0).toISOString(),
            updatedAt: section.updatedAt || section.createdAt || new Date(0).toISOString(),
        }));

    const validIds = new Set<SectionId>([
        ...ESTIMATE_SECTION_DEFINITIONS.filter(section => !section.catalogGlobal).map(section => section.id),
        ...definitions.map(section => section.id),
    ]);
    const order: SectionId[] = [];
    for (const id of Array.isArray(value?.order) ? value.order : []) {
        if (validIds.has(id) && !order.includes(id)) order.push(id);
    }
    for (const id of fallback.order) if (!order.includes(id)) order.push(id);
    for (const section of definitions) if (!order.includes(section.id)) order.push(section.id);

    return {
        id: typeof value?.id === 'string' && value.id ? value.id : userId,
        schemaVersion: ESTIMATE_SECTIONS_SCHEMA_VERSION,
        definitions,
        order,
        serverRevision: Number.isInteger(value?.serverRevision) && Number(value?.serverRevision) >= 0
            ? Number(value?.serverRevision)
            : 0,
        baseDocument: value?.baseDocument,
        operationId: value?.operationId,
        syncConflict: value?.syncConflict,
    };
};

export const getResolvedEstimateSections = (
    document?: EstimateSectionsDocument | null,
    options: { includeArchived?: boolean; includeGeneral?: boolean } = {},
): ResolvedEstimateSection[] => {
    const customById = new Map((document?.definitions ?? []).map(section => [section.id, section]));
    const ids: SectionId[] = document?.order?.length
        ? [...document.order]
        : ESTIMATE_SECTION_DEFINITIONS
            .filter(section => !section.catalogGlobal)
            .sort((left, right) => left.order - right.order)
            .map(section => section.id);
    for (const section of ESTIMATE_SECTION_DEFINITIONS) {
        if (!section.catalogGlobal && !ids.includes(section.id)) ids.push(section.id);
    }
    for (const section of document?.definitions ?? []) if (!ids.includes(section.id)) ids.push(section.id);
    if (options.includeGeneral !== false && !ids.includes(EstimateCategory.GENERAL)) ids.push(EstimateCategory.GENERAL);

    const result: ResolvedEstimateSection[] = [];
    ids.forEach((id, index) => {
        const builtIn = builtInById.get(id);
        if (builtIn) {
            if (builtIn.catalogGlobal && options.includeGeneral === false) return;
            result.push({
                ...builtIn,
                order: index,
                builtIn: true,
                archived: false,
                catalogGlobal: Boolean(builtIn.catalogGlobal),
            });
            return;
        }
        const custom = customById.get(id as CustomSectionId);
        if (!custom || (custom.archived && !options.includeArchived)) return;
        result.push({
            id: custom.id,
            label: custom.label,
            description: 'Пользовательский раздел',
            icon: '📁',
            order: index,
            subgroups: [EstimateSubgroup.WORKS, EstimateSubgroup.MATERIALS],
            aliases: [custom.label],
            builtIn: false,
            archived: custom.archived,
            catalogGlobal: false,
        });
    });
    return result;
};

export const CATALOG_CATEGORIES: SectionId[] = getResolvedEstimateSections(null).map(section => section.id);

export const getSectionLabel = (
    category: SectionId,
    snapshot: readonly EstimateSectionSnapshot[] = [],
    document?: EstimateSectionsDocument | null,
): string => snapshot.find(section => section.id === category)?.label
    ?? document?.definitions.find(section => section.id === category)?.label
    ?? builtInById.get(category)?.label
    ?? category;

export const getSectionDescription = (category: SectionId, document?: EstimateSectionsDocument | null): string => (
    document?.definitions.some(section => section.id === category)
        ? 'Пользовательский раздел'
        : builtInById.get(category)?.description ?? category
);

export const getEstimateCategories = (
    items: readonly Pick<EstimateItem, 'category'>[],
    selectedSections: readonly SectionId[] = [],
    snapshot: readonly EstimateSectionSnapshot[] = [],
    document?: EstimateSectionsDocument | null,
): SectionId[] => {
    const present = new Set<SectionId>([...selectedSections, ...items.map(item => item.category)]);
    const preferredOrder = snapshot.length
        ? [...snapshot].sort((left, right) => left.order - right.order).map(section => section.id)
        : getResolvedEstimateSections(document, { includeArchived: true }).map(section => section.id);
    return [
        ...preferredOrder.filter(category => present.has(category)),
        ...[...present].filter(category => !preferredOrder.includes(category)),
    ];
};

export const getSectionSubgroups = (
    category: SectionId,
    items: readonly Pick<EstimateItem, 'subgroup'>[] = [],
): EstimateSubgroup[] => [...new Set([
    ...(builtInById.get(category)?.subgroups ?? [EstimateSubgroup.WORKS, EstimateSubgroup.MATERIALS]),
    ...items.map(item => item.subgroup ?? EstimateSubgroup.WORKS),
])];

export const normalizeEstimateCategory = (
    raw: unknown,
    document?: EstimateSectionsDocument | null,
): SectionId | null => {
    const value = String(raw ?? '').trim().toLowerCase();
    if (!value) return null;
    if (isCustomSectionId(value)) return value;
    const exact = ESTIMATE_SECTION_DEFINITIONS.find(section => section.id.toLowerCase() === value);
    if (exact) return exact.id;
    const custom = document?.definitions.find(section => normalizeSectionName(section.label) === normalizeSectionName(value));
    if (custom) return custom.id;
    return ESTIMATE_SECTION_DEFINITIONS.find(
        section => section.aliases.some(alias => value.includes(alias)),
    )?.id ?? null;
};

const validateNewLabel = (document: EstimateSectionsDocument, label: string, exceptId?: SectionId): string => {
    const clean = label.trim().replace(/\s+/g, ' ');
    if (!clean) throw new Error('Введите название раздела.');
    if (clean.length > MAX_SECTION_LABEL_LENGTH) throw new Error(`Название должно быть не длиннее ${MAX_SECTION_LABEL_LENGTH} символов.`);
    const normalized = normalizeSectionName(clean);
    const duplicate = getResolvedEstimateSections(document, { includeArchived: true })
        .find(section => section.id !== exceptId && normalizeSectionName(section.label) === normalized);
    if (duplicate) throw new Error(duplicate.archived ? 'Раздел с таким названием находится в архиве.' : 'Раздел с таким названием уже существует.');
    return clean;
};

const touchDocument = (document: EstimateSectionsDocument): EstimateSectionsDocument => ({
    ...document,
    baseDocument: document.baseDocument ?? {
        definitions: document.definitions,
        order: document.order,
        serverRevision: document.serverRevision,
    },
    operationId: createUuid(),
    syncConflict: undefined,
});

export const prepareEstimateSectionsDocumentForSave = (
    document: EstimateSectionsDocument,
): EstimateSectionsDocument => document.operationId ? document : touchDocument(document);

export const addUserEstimateSection = (
    document: EstimateSectionsDocument,
    label: string,
    now = new Date(),
    id: CustomSectionId = `custom:${createUuid()}`,
): EstimateSectionsDocument => {
    if (document.definitions.length >= MAX_USER_ESTIMATE_SECTIONS) throw new Error(`Можно создать не более ${MAX_USER_ESTIMATE_SECTIONS} разделов.`);
    const clean = validateNewLabel(document, label);
    const timestamp = now.toISOString();
    return touchDocument({
        ...document,
        definitions: [...document.definitions, { id, label: clean, archived: false, createdAt: timestamp, updatedAt: timestamp }],
        order: [...document.order, id],
    });
};

export const renameUserEstimateSection = (
    document: EstimateSectionsDocument,
    id: CustomSectionId,
    label: string,
    now = new Date(),
): EstimateSectionsDocument => {
    if (!document.definitions.some(section => section.id === id)) throw new Error('Раздел не найден.');
    const clean = validateNewLabel(document, label, id);
    return touchDocument({
        ...document,
        definitions: document.definitions.map(section => section.id === id
            ? { ...section, label: clean, updatedAt: now.toISOString() }
            : section),
    });
};

export const setUserEstimateSectionArchived = (
    document: EstimateSectionsDocument,
    id: CustomSectionId,
    archived: boolean,
    now = new Date(),
): EstimateSectionsDocument => {
    if (!document.definitions.some(section => section.id === id)) throw new Error('Раздел не найден.');
    return touchDocument({
        ...document,
        definitions: document.definitions.map(section => section.id === id
            ? { ...section, archived, updatedAt: now.toISOString() }
            : section),
        order: archived ? document.order.filter(sectionId => sectionId !== id) : [...document.order.filter(sectionId => sectionId !== id), id],
    });
};

export const reorderEstimateSections = (
    document: EstimateSectionsDocument,
    order: readonly SectionId[],
): EstimateSectionsDocument => {
    const activeIds = getResolvedEstimateSections(document, { includeGeneral: false }).map(section => section.id);
    if (order.length !== activeIds.length || new Set(order).size !== activeIds.length || order.some(id => !activeIds.includes(id))) {
        throw new Error('Порядок разделов содержит пропущенные или неизвестные значения.');
    }
    return touchDocument({ ...document, order: [...order] });
};

export const captureEstimateSectionSnapshot = (
    sectionIds: readonly SectionId[],
    document?: EstimateSectionsDocument | null,
): EstimateSectionSnapshot[] => {
    const resolved = getResolvedEstimateSections(document, { includeArchived: true });
    return [...new Set(sectionIds)].map((id, index) => ({
        id,
        label: resolved.find(section => section.id === id)?.label ?? String(id),
        order: index,
    }));
};

export const resolveEstimateSectionsConflict = (
    document: EstimateSectionsDocument,
    choice: 'local' | 'remote',
): EstimateSectionsDocument => {
    if (!document.syncConflict) return document;
    const { local, remote } = document.syncConflict;
    const selected = choice === 'local' ? local : remote;
    return touchDocument({
        ...document,
        definitions: selected.definitions,
        order: selected.order,
        serverRevision: remote.serverRevision,
        baseDocument: remote,
        operationId: undefined,
        syncConflict: undefined,
    });
};

type EstimateSectionsState = Pick<EstimateSectionsDocument, 'definitions' | 'order' | 'serverRevision'>;

const sameDefinition = (
    left?: UserEstimateSectionDefinition,
    right?: UserEstimateSectionDefinition,
): boolean => left?.id === right?.id
    && left?.label === right?.label
    && left?.archived === right?.archived;

const threeWayMergeSectionOrder = (
    activeIds: readonly SectionId[],
    baseOrder: readonly SectionId[],
    localOrder: readonly SectionId[],
    remoteOrder: readonly SectionId[],
): SectionId[] | null => {
    const active = new Set(activeIds);
    const baseIds = new Set(baseOrder);
    const baseRelative = baseOrder.filter(id => active.has(id));
    const relative = (order: readonly SectionId[]) => order.filter(id => active.has(id) && baseIds.has(id));
    const sameOrder = (left: readonly SectionId[], right: readonly SectionId[]) => (
        left.length === right.length && left.every((id, index) => id === right[index])
    );
    const localRelative = relative(localOrder);
    const remoteRelative = relative(remoteOrder);
    const localReordered = !sameOrder(localRelative, baseRelative);
    const remoteReordered = !sameOrder(remoteRelative, baseRelative);
    if (localReordered && remoteReordered && !sameOrder(localRelative, remoteRelative)) return null;

    const primary = localReordered ? localOrder : remoteOrder;
    const result: SectionId[] = [];
    for (const id of [...primary, ...remoteOrder, ...localOrder, ...activeIds]) {
        if (active.has(id) && !result.includes(id)) result.push(id);
    }
    return result;
};

/** Merges independent section edits and returns null only for a genuine conflict. */
export const tryMergeEstimateSectionsDocuments = (
    local: EstimateSectionsDocument,
    remote: EstimateSectionsDocument,
): EstimateSectionsDocument | null => {
    const base = local.baseDocument;
    if (!base) return null;
    const baseById = new Map(base.definitions.map(section => [section.id, section]));
    const localById = new Map(local.definitions.map(section => [section.id, section]));
    const remoteById = new Map(remote.definitions.map(section => [section.id, section]));
    const ids = new Set<CustomSectionId>([...baseById.keys(), ...localById.keys(), ...remoteById.keys()]);
    const definitions: UserEstimateSectionDefinition[] = [];

    for (const id of ids) {
        const baseDefinition = baseById.get(id);
        const localDefinition = localById.get(id);
        const remoteDefinition = remoteById.get(id);
        const localChanged = !sameDefinition(localDefinition, baseDefinition);
        const remoteChanged = !sameDefinition(remoteDefinition, baseDefinition);
        if (localChanged && remoteChanged && !sameDefinition(localDefinition, remoteDefinition)) return null;
        const selected = localChanged ? localDefinition : remoteDefinition ?? localDefinition;
        if (selected) definitions.push(selected);
    }
    if (definitions.length > MAX_USER_ESTIMATE_SECTIONS) return null;

    const normalizedNames = new Set<string>();
    for (const section of getResolvedEstimateSections({ ...local, definitions, order: [...local.order] }, { includeArchived: true })) {
        const normalized = normalizeSectionName(section.label);
        if (normalizedNames.has(normalized)) return null;
        normalizedNames.add(normalized);
    }

    const activeIds: SectionId[] = [
        ...ESTIMATE_SECTION_DEFINITIONS.filter(section => !section.catalogGlobal).map(section => section.id),
        ...definitions.filter(section => !section.archived).map(section => section.id),
    ];
    const order = threeWayMergeSectionOrder(activeIds, base.order, local.order, remote.order);
    if (!order) return null;

    const remoteState: EstimateSectionsState = {
        definitions: remote.definitions,
        order: remote.order,
        serverRevision: remote.serverRevision,
    };
    return touchDocument({
        ...local,
        definitions,
        order,
        serverRevision: remote.serverRevision,
        baseDocument: remoteState,
        operationId: undefined,
        syncConflict: undefined,
    });
};

export const preserveEstimateSectionSnapshot = (
    estimate: { items: readonly Pick<EstimateItem, 'category'>[]; selectedSections?: readonly SectionId[]; sectionSnapshot?: readonly EstimateSectionSnapshot[] },
    document?: EstimateSectionsDocument | null,
): EstimateSectionSnapshot[] => {
    const ids = [...new Set<SectionId>([
        ...[...(estimate.sectionSnapshot ?? [])].sort((left, right) => left.order - right.order).map(section => section.id),
        ...(estimate.selectedSections ?? []),
        ...estimate.items.map(item => item.category),
    ])];
    const existing = new Map((estimate.sectionSnapshot ?? []).map(section => [section.id, section]));
    return ids.map((id, order) => ({
        id,
        label: existing.get(id)?.label ?? getSectionLabel(id, [], document),
        order,
    }));
};
