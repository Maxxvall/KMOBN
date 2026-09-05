import {
    ESTIMATE_SECTION_DEFINITIONS,
    EstimateCategory,
    EstimateItem,
    EstimateSubgroup,
} from '../types';

const sectionById = new Map(ESTIMATE_SECTION_DEFINITIONS.map(section => [section.id, section]));

export const CATALOG_CATEGORIES: EstimateCategory[] = [...ESTIMATE_SECTION_DEFINITIONS]
    .sort((left, right) => left.order - right.order)
    .map(section => section.id);

export const getSectionLabel = (category: EstimateCategory): string => (
    sectionById.get(category)?.label ?? category
);

export const getSectionDescription = (category: EstimateCategory): string => (
    sectionById.get(category)?.description ?? category
);

/** Includes persisted categories even when this application version does not know them. */
export const getEstimateCategories = (
    items: readonly Pick<EstimateItem, 'category'>[],
    selectedSections: readonly EstimateCategory[] = [],
): EstimateCategory[] => {
    const present = new Set([...selectedSections, ...items.map(item => item.category)]);
    return [
        ...CATALOG_CATEGORIES.filter(category => present.has(category)),
        ...[...present].filter(category => !sectionById.has(category)),
    ];
};

/** Defaults drive adding rows; existing persisted subgroups must always remain visible. */
export const getSectionSubgroups = (
    category: EstimateCategory,
    items: readonly Pick<EstimateItem, 'subgroup'>[] = [],
): EstimateSubgroup[] => [...new Set([
    ...(sectionById.get(category)?.subgroups ?? [EstimateSubgroup.WORKS, EstimateSubgroup.MATERIALS]),
    ...items.map(item => item.subgroup ?? EstimateSubgroup.WORKS),
])];

export const normalizeEstimateCategory = (raw: unknown): EstimateCategory | null => {
    const value = String(raw ?? '').trim().toLowerCase();
    if (!value) return null;

    const exact = ESTIMATE_SECTION_DEFINITIONS.find(section => section.id.toLowerCase() === value);
    if (exact) return exact.id;

    return ESTIMATE_SECTION_DEFINITIONS.find(
        section => section.aliases.some(alias => value.includes(alias)),
    )?.id ?? null;
};
