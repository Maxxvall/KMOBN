import { CUTTING_STAGE_LABELS, CUTTING_STAGE_ORDER, CuttingStageId } from './types';

const normalize = (value: string): string => value.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').trim();

export const classifyCuttingStage = (construction: string): CuttingStageId => {
    const value = normalize(construction);

    if (value.includes('ростверк')) return 'rostverk';
    if (value.includes('кров') || value.includes('строп') || value.includes('обреш')) return 'roof';
    if (value.includes('стен') || value.includes('столб') || value.includes('обвяз')) return 'walls';
    if (value.includes('лаг') || value.includes('бридж') || value.includes('балк')) return 'joists';
    if (value.includes('черн') || value.includes('osb') || value.includes('осп') || value.includes('фанер')) return 'subfloor';
    if (value.includes('фасад') || value.includes('террас') || value.includes('цокол')) return 'exterior';
    return 'other';
};

export const getCuttingStageLabel = (stage: CuttingStageId): string => CUTTING_STAGE_LABELS[stage];

export const compareCuttingStages = (left: CuttingStageId, right: CuttingStageId): number => (
    CUTTING_STAGE_ORDER.indexOf(left) - CUTTING_STAGE_ORDER.indexOf(right)
);
