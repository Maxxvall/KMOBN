import { Estimate, SectionId } from '../types';
import { calculateActualItemTotal } from './estimateActuals';

export interface HouseAccuracySection {
    category: SectionId;
    sampleCount: number;
    medianRatio: number;
    medianDifferencePercent: number;
    recommendationPercent: number | null;
}

export interface HouseAccuracyOverall {
    sampleCount: number;
    medianDifferencePercent: number;
    lowDifferencePercent: number | null;
    highDifferencePercent: number | null;
}

export interface HouseAccuracyReport {
    verifiedProjectCount: number;
    eligibleProjectCount: number;
    excluded: {
        unfinishedOrUnverified: number;
        incompatibleBasis: number;
        incompleteActuals: number;
        missingSnapshot: number;
    };
    sections: HouseAccuracySection[];
    overall: HouseAccuracyOverall | null;
}

const round = (value: number): number => Math.round(value * 100) / 100;

const median = (values: number[]): number => {
    const sorted = [...values].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

const quantile = (values: number[], percentile: number): number => {
    const sorted = [...values].sort((left, right) => left - right);
    const position = (sorted.length - 1) * percentile;
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    if (lower === upper) return sorted[lower];
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
};

const latestHouseProjects = (estimates: Estimate[]): Estimate[] => {
    const projects = new Map<string, Estimate>();
    for (const estimate of estimates) {
        if (!estimate.houseProjectId) continue;
        const current = projects.get(estimate.houseProjectId);
        if (!current || estimate.version > current.version
            || estimate.version === current.version && Date.parse(estimate.updated_at || estimate.date) > Date.parse(current.updated_at || current.date)) {
            projects.set(estimate.houseProjectId, estimate);
        }
    }
    return [...projects.values()];
};

export function buildHouseAccuracyReport(estimates: Estimate[]): HouseAccuracyReport {
    const projects = latestHouseProjects(estimates);
    const excluded = { unfinishedOrUnverified: 0, incompatibleBasis: 0, incompleteActuals: 0, missingSnapshot: 0 };
    const sectionRatios = new Map<SectionId, number[]>();
    const overallRatios: number[] = [];
    let verifiedProjectCount = 0;
    let eligibleProjectCount = 0;

    for (const estimate of projects) {
        if (estimate.houseExecutionStatus !== 'actual-verified') {
            excluded.unfinishedOrUnverified += 1;
            continue;
        }
        verifiedProjectCount += 1;
        if (estimate.houseActualBasis !== 'client-price') {
            excluded.incompatibleBasis += 1;
            continue;
        }
        const snapshot = estimate.houseCalculationSnapshots?.[0];
        if (!snapshot) {
            excluded.missingSnapshot += 1;
            continue;
        }

        const currentById = new Map(estimate.items.map(item => [item.id, item]));
        const categories = [...new Set(snapshot.result.items.map(item => item.category))];
        const projectSections: Array<{ category: SectionId; plan: number; actual: number }> = [];
        let complete = true;
        for (const category of categories) {
            const plannedItems = snapshot.result.items.filter(item => item.category === category);
            const plan = plannedItems.reduce((sum, item) => sum + item.total, 0);
            if (!(plan > 0)) continue;
            let actual = 0;
            for (const plannedItem of plannedItems) {
                const current = currentById.get(plannedItem.id);
                const currentActual = current ? calculateActualItemTotal(current) : null;
                if (currentActual === null || current?.actual?.source !== 'verified') {
                    complete = false;
                    break;
                }
                actual += currentActual;
            }
            if (!complete) break;
            actual += estimate.items
                .filter(item => item.isActualOnly && item.category === category && item.actual?.source === 'verified')
                .reduce((sum, item) => sum + (calculateActualItemTotal(item) || 0), 0);
            projectSections.push({ category, plan, actual });
        }

        if (!complete || !projectSections.length) {
            excluded.incompleteActuals += 1;
            continue;
        }

        eligibleProjectCount += 1;
        let projectPlan = 0;
        let projectActual = 0;
        for (const section of projectSections) {
            const ratio = section.actual / section.plan;
            sectionRatios.set(section.category, [...(sectionRatios.get(section.category) || []), ratio]);
            projectPlan += section.plan;
            projectActual += section.actual;
        }
        if (projectPlan > 0) overallRatios.push(projectActual / projectPlan);
    }

    const sections = [...sectionRatios.entries()]
        .map(([category, ratios]) => {
            const medianRatio = median(ratios);
            return {
                category,
                sampleCount: ratios.length,
                medianRatio: round(medianRatio),
                medianDifferencePercent: round((medianRatio - 1) * 100),
                recommendationPercent: ratios.length >= 10 ? round((medianRatio - 1) * 100) : null,
            };
        })
        .sort((left, right) => right.sampleCount - left.sampleCount || String(left.category).localeCompare(String(right.category), 'ru-RU'));

    const overall = overallRatios.length ? {
        sampleCount: overallRatios.length,
        medianDifferencePercent: round((median(overallRatios) - 1) * 100),
        lowDifferencePercent: overallRatios.length >= 20 ? round((quantile(overallRatios, 0.1) - 1) * 100) : null,
        highDifferencePercent: overallRatios.length >= 20 ? round((quantile(overallRatios, 0.9) - 1) * 100) : null,
    } : null;

    return { verifiedProjectCount, eligibleProjectCount, excluded, sections, overall };
}
