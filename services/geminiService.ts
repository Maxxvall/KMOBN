import { Estimate, EstimateItem, GenerationParams, Material, Work, SectionId } from '../types';
import { generateEstimateWithAI as generateWithOpenRouter } from './openRouterService';
import { hasOpenRouterKey } from './aiConfig';
import type { AIEstimateResult } from './openRouterService';

const createAbortError = () => new DOMException('The operation was aborted.', 'AbortError');

export const generateEstimateWithAI = async (
    params: GenerationParams,
    historicalEstimates?: Estimate[],
    materials?: Material[],
    works?: Work[],
    existingItems?: EstimateItem[],
    options?: {
        buildingType?: string;
        signal?: AbortSignal;
        projectTemplateId?: string;
        projectTemplateName?: string;
        templateItems?: EstimateItem[];
        scopeDescription?: string;
        enableAiPriceSearch?: boolean;
        referenceEstimateId?: string;
        selectedSections?: SectionId[];
        windowCount?: number;
        doorCount?: number;
    },
): Promise<AIEstimateResult> => {
    if (options?.signal?.aborted) throw createAbortError();
    if (!hasOpenRouterKey()) {
        throw new Error('AI не настроен: отсутствует подключение к OpenRouter.');
    }
    if (!materials || !works) {
        throw new Error('Для AI-генерации нужны актуальные справочники материалов и работ.');
    }

    return generateWithOpenRouter({
        area: params.area,
        region: params.region,
        buildingType: options?.buildingType || '',
        signal: options?.signal,
        projectTemplateId: options?.projectTemplateId || params.projectTemplateId,
        projectTemplateName: options?.projectTemplateName,
        templateItems: options?.templateItems,
        scopeDescription: options?.scopeDescription,
        enableAiPriceSearch: options?.enableAiPriceSearch,
        referenceEstimateId: options?.referenceEstimateId,
        selectedSections: options?.selectedSections,
        windowCount: options?.windowCount,
        doorCount: options?.doorCount,
        historicalEstimates: historicalEstimates || [],
        existingItems,
        materials,
        works,
    });
};
