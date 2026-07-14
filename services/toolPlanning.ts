import {
    CrewToolPlan,
    CrewToolRequirement,
    EstimateCategory,
    EstimateItem,
    EstimateSubgroup,
    Work,
    WorkToolRequirement,
} from '../types';

export interface AggregatedToolRequirement {
    toolKey: string;
    name: string;
    quantity: number;
    requirementCount: number;
    estimateItemIds: string[];
}

export interface ToolPlanCoverage {
    totalWorkItems: number;
    mappedWorkItems: number;
    coveredWorkItems: number;
    missingWorkItemIds: string[];
}

export interface BuildCrewToolPlanInput {
    estimateItems: EstimateItem[];
    works: Work[];
    crewSize: number;
    manualRequirements?: WorkToolRequirement[];
    quantityOverrides?: Record<string, number>;
}

export interface ToolPlanningResult {
    plan: CrewToolPlan;
    aggregated: AggregatedToolRequirement[];
    coverage: ToolPlanCoverage;
}

export const normalizeToolKey = (value: string): string => value
    .trim()
    .toLocaleLowerCase('ru-RU')
    .replace(/\s+/g, ' ');

const workLookupKey = (name: string, category: EstimateCategory): string =>
    `${category}\u0000${normalizeToolKey(name)}`;

const normalizedQuantity = (quantity: number): number =>
    Number.isFinite(quantity) && quantity > 0 ? quantity : 0;

const toSnapshot = (
    requirement: WorkToolRequirement,
    source: CrewToolRequirement['source'],
    links: Pick<CrewToolRequirement, 'catalogWorkId' | 'estimateItemId'> = {},
): CrewToolRequirement => ({
    name: requirement.name.trim(),
    key: requirement.key,
    toolKey: normalizeToolKey(requirement.key || requirement.name),
    quantity: normalizedQuantity(requirement.quantity),
    quantityMode: requirement.quantityMode,
    note: requirement.note,
    source,
    ...links,
});

export const aggregateToolRequirements = (plan: CrewToolPlan): AggregatedToolRequirement[] => {
    const byKey = new Map<string, AggregatedToolRequirement>();
    const crewSize = Math.max(1, Math.floor(plan.crewSize));

    for (const requirement of plan.requirements) {
        if (!requirement.toolKey || requirement.quantity <= 0) continue;
        const calculated = requirement.quantityMode === 'person'
            ? requirement.quantity * crewSize
            : requirement.quantity;
        const current = byKey.get(requirement.toolKey);
        if (!current) {
            byKey.set(requirement.toolKey, {
                toolKey: requirement.toolKey,
                name: requirement.name,
                quantity: calculated,
                requirementCount: 1,
                estimateItemIds: requirement.estimateItemId ? [requirement.estimateItemId] : [],
            });
            continue;
        }
        current.quantity = Math.max(current.quantity, calculated);
        current.requirementCount += 1;
        if (requirement.estimateItemId && !current.estimateItemIds.includes(requirement.estimateItemId)) {
            current.estimateItemIds.push(requirement.estimateItemId);
        }
    }

    for (const tool of byKey.values()) {
        const override = plan.quantityOverrides?.[tool.toolKey];
        if (override !== undefined && Number.isFinite(override) && override >= 0) {
            tool.quantity = override;
        }
    }

    return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
};

export const buildCrewToolPlan = ({
    estimateItems,
    works,
    crewSize,
    manualRequirements = [],
    quantityOverrides,
}: BuildCrewToolPlanInput): ToolPlanningResult => {
    const byId = new Map(works.map((work) => [work.id, work]));
    const byLegacyKey = new Map(works.map((work) => [workLookupKey(work.name, work.category), work]));
    const workItems = estimateItems.filter((item) => (item.subgroup ?? EstimateSubgroup.WORKS) === EstimateSubgroup.WORKS);
    const requirements: CrewToolRequirement[] = [];
    const missingWorkItemIds: string[] = [];
    let mappedWorkItems = 0;
    let coveredWorkItems = 0;

    for (const item of workItems) {
        const work = (item.catalogWorkId ? byId.get(item.catalogWorkId) : undefined)
            ?? byLegacyKey.get(workLookupKey(item.name, item.category));
        if (!work) {
            missingWorkItemIds.push(item.id);
            continue;
        }
        mappedWorkItems += 1;
        if (work.toolRequirements?.length) coveredWorkItems += 1;
        for (const requirement of work.toolRequirements ?? []) {
            requirements.push(toSnapshot(requirement, 'work', {
                catalogWorkId: work.id,
                estimateItemId: item.id,
            }));
        }
    }

    requirements.push(...manualRequirements.map((requirement) => toSnapshot(requirement, 'manual')));
    const plan: CrewToolPlan = {
        crewSize: Math.max(1, Math.floor(crewSize)),
        requirements,
        ...(quantityOverrides ? { quantityOverrides } : {}),
    };

    return {
        plan,
        aggregated: aggregateToolRequirements(plan),
        coverage: {
            totalWorkItems: workItems.length,
            mappedWorkItems,
            coveredWorkItems,
            missingWorkItemIds,
        },
    };
};
