import { Estimate, EstimateItem, GenerationParams, EstimateStatus, EstimateCategory, EstimateSubgroup, Material, Work } from '../types';
import { generateEstimateWithAI as generateWithOpenRouter } from './openRouterService';
import { hasOpenRouterKey } from './aiConfig';

const MATERIAL_KEYWORDS = [
    'пиломат', 'утепл', 'фанер', 'линоли', 'террас', 'паро', 'пароизоля', 'гвозд', 'саморез', 'крепеж', 'доска', 'плит', 'брус', 'грунт', 'песк', 'цемент', 'керамзит', 'щебень', 'пена'];

const classifySubgroup = (name: string, unit?: string): EstimateSubgroup => {
    if (!name) return EstimateSubgroup.WORKS;
    const lower = name.toLowerCase();
    // Detect delivery-related items
    const deliveryKeywords = ['достав', 'доставка', 'транспорт', 'перевоз', 'курьер'];
    for (const kw of deliveryKeywords) {
        if (lower.includes(kw)) return EstimateSubgroup.DELIVERY;
    }
    for (const kw of MATERIAL_KEYWORDS) {
        if (lower.includes(kw)) return EstimateSubgroup.MATERIALS;
    }
    // If unit indicates material (шт, м.п., м3) — still usually materials, but leave heuristic conservative
    const materialUnits = ['шт', 'пог', 'пог.м', 'м.п.', 'м.п', 'куб', 'куб.', 'м3', 'м²', 'м2'];
    if (unit && materialUnits.some(u => unit.toLowerCase().includes(u))) {
        // don't force m² to materials (many works measured in m²), so only mark units like 'шт', 'куб'
        if (unit.toLowerCase().includes('шт') || unit.toLowerCase().includes('куб') || unit.toLowerCase().includes('м3') ) {
            return EstimateSubgroup.MATERIALS;
        }
    }
    return EstimateSubgroup.WORKS;
}

const MOCK_WORK_ITEMS_DB = [
    { name: 'Разметка свайного поля, монтаж свай', unit: 'шт', price: 1500, qtyPerSqM: 0.25, category: EstimateCategory.FOUNDATION },
    { name: 'Монтаж оголовков', unit: 'шт', price: 500, qtyPerSqM: 0.25, category: EstimateCategory.FOUNDATION },
    { name: 'Монтаж ростверка из пакета досок', unit: 'м.п.', price: 400, qtyPerSqM: 1.5, category: EstimateCategory.GRILLAGE },
    { name: 'Монтаж силового каркаса стен', unit: 'м²', price: 1800, qtyPerSqM: 1.2, category: EstimateCategory.WALLS },
    { name: 'Монтаж ветровлагозащитной мембраны', unit: 'м²', price: 150, qtyPerSqM: 2.5, category: EstimateCategory.WALLS },
    { name: 'Монтаж контробрешетки', unit: 'м.п.', price: 100, qtyPerSqM: 4, category: EstimateCategory.ROOF },
    { name: 'Монтаж кровли (металлочерепица)', unit: 'м²', price: 1200, qtyPerSqM: 1.1, category: EstimateCategory.ROOF },
    { name: 'Утепление стен (150мм)', unit: 'м²', price: 600, qtyPerSqM: 1.2, category: EstimateCategory.WALLS },
    { name: 'Утепление кровли (200мм)', unit: 'м²', price: 800, qtyPerSqM: 1.1, category: EstimateCategory.ROOF },
];

const MOCK_LARGE_AREA_ADDITION = {
    name: 'Усиление фундамента (доп. сваи)',
    unit: 'компл.',
    price: 50000,
    quantity: 1,
    category: EstimateCategory.FOUNDATION,
};

export const generateEstimateWithAI = async (
    params: GenerationParams,
    historicalEstimates?: Estimate[],
    materials?: Material[],
    works?: Work[],
    existingItems?: EstimateItem[],
    options?: { buildingType?: string; projectTemplateId?: string; projectTemplateName?: string; templateItems?: EstimateItem[]; scopeDescription?: string; enableAiPriceSearch?: boolean },
): Promise<{ items: EstimateItem[]; total: number; suggestions?: string[]; warnings?: string[] }> => {
    console.log("AI Generation triggered with params:", params);

    // If OpenRouter is configured, prefer real AI. Otherwise keep legacy mock behavior.
    if (hasOpenRouterKey() && materials && works) {
        try {
            const result = await generateWithOpenRouter({
                area: params.area,
                region: params.region,
                buildingType: options?.buildingType || '',
                projectTemplateId: options?.projectTemplateId || params.projectTemplateId,
                projectTemplateName: options?.projectTemplateName,
                templateItems: options?.templateItems,
                scopeDescription: options?.scopeDescription,
                enableAiPriceSearch: options?.enableAiPriceSearch,
                historicalEstimates: historicalEstimates || [],
                existingItems,
                materials,
                works,
            });

            // Keep backward-compatible return shape
            return {
                items: result.items,
                total: result.total,
                suggestions: result.suggestions,
                warnings: result.warnings,
            };
        } catch (e) {
            console.warn('[geminiService] OpenRouter generation failed; falling back to mock', e);
        }
    }

    // Legacy mock generation (safe fallback)
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    let items: EstimateItem[] = MOCK_WORK_ITEMS_DB.map((item, index) => {
        const quantity = parseFloat((item.qtyPerSqM * params.area).toFixed(2));
        const total = quantity * item.price;
        return {
            id: `item-${Date.now()}-${index}`,
            name: item.name,
            unit: item.unit,
            quantity: quantity,
            price: item.price,
            total: total,
            category: item.category,
            subgroup: classifySubgroup(item.name, item.unit),
        };
    });

    if (params.area > 100) {
        items.push({
            id: `item-${Date.now()}-large`,
            name: MOCK_LARGE_AREA_ADDITION.name,
            unit: MOCK_LARGE_AREA_ADDITION.unit,
            quantity: MOCK_LARGE_AREA_ADDITION.quantity,
            price: MOCK_LARGE_AREA_ADDITION.price,
            total: MOCK_LARGE_AREA_ADDITION.price * MOCK_LARGE_AREA_ADDITION.quantity,
            category: MOCK_LARGE_AREA_ADDITION.category,
            subgroup: classifySubgroup(MOCK_LARGE_AREA_ADDITION.name, MOCK_LARGE_AREA_ADDITION.unit),
        });
    }
    
    if (params.area < 10) {
        alert("Внимание: Площадь дома слишком мала. Проверьте корректность работ по фундаменту.");
    }
    
    const total = items.reduce((acc, item) => acc + item.total, 0);

    return { items, total };
};