import {
    Estimate,
    EstimateCategory,
    EstimateItem,
    EstimateStatus,
    EstimateSubgroup,
    Material,
    SmartWizardParams,
    SmartWizardResult,
    AutoAddedSummary,
    SmartWizardWarning,
    Work,
} from '../types';

const normalizeKey = (s: string): string =>
    String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

const safeNumber = (v: unknown, fallback = 0): number => {
    const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : fallback;
};

const median = (arr: number[]): number => {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2;
};

type ItemStats = {
    name: string;
    unit: string;
    category: EstimateCategory;
    subgroup: EstimateSubgroup;
    frequency: number;
    medianQuantity: number;
    quantityPerM2: number;
    medianPrice: number;
};

const BUILDING_TYPES = [
    'Каркасный дом',
    'Кирпичный дом',
    'Баня',
    'Гараж',
    'Пристройка',
];

const FOUNDATION_OPTIONS = [
    'Свайный',
    'Ленточный',
    'Монолитная плита',
];

const ROOF_OPTIONS = [
    'Металлочерепица',
    'Мягкая кровля',
    'Шифер',
];

const INSULATION_OPTIONS = [
    'Без',
    'Минвата 150мм',
    'Минвата 200мм',
    'Пенополистирол',
];

const WINDOWS_DOORS_OPTIONS = [
    'Стандарт',
    'Эконом',
    'Премиум',
];

const FINISH_OPTIONS = [
    'Черновая',
    'Чистовая',
    'Премиум',
];

export const WIZARD_OPTIONS = {
    buildingTypes: BUILDING_TYPES,
    foundations: FOUNDATION_OPTIONS,
    roofs: ROOF_OPTIONS,
    insulations: INSULATION_OPTIONS,
    windowsDoors: WINDOWS_DOORS_OPTIONS,
    finishLevels: FINISH_OPTIONS,
};

function filterApprovedEstimates(estimates: Estimate[]): Estimate[] {
    return estimates.filter(
        e =>
            e.status === EstimateStatus.APPROVED &&
            !e.isArchived &&
            Array.isArray(e.items) &&
            e.items.length > 0,
    );
}

function findSimilarEstimates(
    approved: Estimate[],
    params: SmartWizardParams,
): Estimate[] {
    const buildingType = normalizeKey(params.buildingType);
    const area = params.area;

    const similar = approved.filter(e => {
        const typeMatch = buildingType
            ? normalizeKey(e.buildingType) === buildingType
            : true;
        const areaMatch = area > 0 && e.area > 0
            ? Math.abs(e.area - area) / area < 0.3
            : true;
        return typeMatch && areaMatch;
    });

    if (similar.length >= 3) return similar;
    return approved;
}

function buildItemStats(
    estimates: Estimate[],
): Map<string, ItemStats> {
    const n = estimates.length;
    const byKey = new Map<
        string,
        {
            name: string;
            unit: string;
            category: EstimateCategory;
            subgroup: EstimateSubgroup;
            count: number;
            quantities: number[];
            prices: number[];
            areas: number[];
        }
    >();

    for (const est of estimates) {
        const area = safeNumber(est.area, 0);
        for (const item of est.items) {
            const key = normalizeKey(item.name);
            if (!key) continue;
            const existing = byKey.get(key);
            if (existing) {
                existing.count++;
                existing.quantities.push(safeNumber(item.quantity, 0));
                existing.prices.push(safeNumber(item.price, 0));
                if (area > 0) existing.areas.push(area);
            } else {
                byKey.set(key, {
                    name: item.name,
                    unit: item.unit,
                    category: item.category,
                    subgroup: item.subgroup || EstimateSubgroup.WORKS,
                    count: 1,
                    quantities: [safeNumber(item.quantity, 0)],
                    prices: [safeNumber(item.price, 0)],
                    areas: area > 0 ? [area] : [],
                });
            }
        }
    }

    const stats = new Map<string, ItemStats>();
    for (const [key, data] of byKey) {
        const frequency = data.count / n;
        const medQty = median(data.quantities);
        const medPrice = median(data.prices);
        let qtyPerM2 = 0;
        if (data.areas.length > 0 && medQty > 0) {
            const avgArea = data.areas.reduce((a, b) => a + b, 0) / data.areas.length;
            qtyPerM2 = avgArea > 0 ? medQty / avgArea : 0;
        }
        stats.set(key, {
            name: data.name,
            unit: data.unit,
            category: data.category,
            subgroup: data.subgroup,
            frequency,
            medianQuantity: medQty,
            quantityPerM2: qtyPerM2,
            medianPrice: medPrice,
        });
    }
    return stats;
}

function getMaterialPrice(
    materialName: string,
    materials: Material[],
    fallback: number,
): number {
    const key = normalizeKey(materialName);
    const found = materials.find(m => normalizeKey(m.name) === key);
    return found ? safeNumber(found.price, fallback) : fallback;
}

function getWorkPrice(
    workName: string,
    works: Work[],
    fallback: number,
): number {
    const key = normalizeKey(workName);
    const found = works.find(w => normalizeKey(w.name) === key);
    return found ? safeNumber(found.price, fallback) : fallback;
}

function getRequiredItems(
    params: SmartWizardParams,
): Array<{ name: string; unit: string; category: EstimateCategory; subgroup: EstimateSubgroup; quantity: number }> {
    const items: Array<{ name: string; unit: string; category: EstimateCategory; subgroup: EstimateSubgroup; quantity: number }> = [];
    const area = params.area;
    const floors = params.floors || 1;

    const perimeter = area > 0 ? Math.sqrt(area) * 4 : 0;
    const wallArea = perimeter * 2.8 * floors;

    if (params.foundation === 'Свайный') {
        const pileCount = Math.max(4, Math.ceil(perimeter / 2.5));
        items.push(
            { name: 'Сваи винтовые', unit: 'шт', category: EstimateCategory.FOUNDATION, subgroup: EstimateSubgroup.MATERIALS, quantity: pileCount },
            { name: 'Ростверк', unit: 'м.п.', category: EstimateCategory.FOUNDATION, subgroup: EstimateSubgroup.WORKS, quantity: perimeter },
            { name: 'Обвязка нижняя', unit: 'м.п.', category: EstimateCategory.FOUNDATION, subgroup: EstimateSubgroup.MATERIALS, quantity: perimeter },
        );
    } else if (params.foundation === 'Ленточный') {
        items.push(
            { name: 'Бетон', unit: 'м³', category: EstimateCategory.FOUNDATION, subgroup: EstimateSubgroup.MATERIALS, quantity: perimeter * 0.3 * 0.4 },
            { name: 'Арматура', unit: 'кг', category: EstimateCategory.FOUNDATION, subgroup: EstimateSubgroup.MATERIALS, quantity: perimeter * 8 },
            { name: 'Опалубка', unit: 'м²', category: EstimateCategory.FOUNDATION, subgroup: EstimateSubgroup.MATERIALS, quantity: perimeter * 0.4 * 2 },
            { name: 'Земляные работы', unit: 'м³', category: EstimateCategory.FOUNDATION, subgroup: EstimateSubgroup.WORKS, quantity: perimeter * 0.3 * 0.5 },
        );
    } else if (params.foundation === 'Монолитная плита') {
        items.push(
            { name: 'Бетон', unit: 'м³', category: EstimateCategory.FOUNDATION, subgroup: EstimateSubgroup.MATERIALS, quantity: area * 0.2 },
            { name: 'Арматура', unit: 'кг', category: EstimateCategory.FOUNDATION, subgroup: EstimateSubgroup.MATERIALS, quantity: area * 12 },
            { name: 'Подготовка основания', unit: 'м²', category: EstimateCategory.FOUNDATION, subgroup: EstimateSubgroup.WORKS, quantity: area },
        );
    }

    if (params.roof === 'Металлочерепица') {
        const roofArea = area * 1.15;
        items.push(
            { name: 'Металлочерепица', unit: 'м²', category: EstimateCategory.ROOF, subgroup: EstimateSubgroup.MATERIALS, quantity: roofArea },
            { name: 'Подкладочный ковер', unit: 'м²', category: EstimateCategory.ROOF, subgroup: EstimateSubgroup.MATERIALS, quantity: roofArea },
            { name: 'Контробрешетка', unit: 'м.п.', category: EstimateCategory.ROOF, subgroup: EstimateSubgroup.MATERIALS, quantity: roofArea * 0.3 },
            { name: 'Монтаж кровли', unit: 'м²', category: EstimateCategory.ROOF, subgroup: EstimateSubgroup.WORKS, quantity: roofArea },
        );
    } else if (params.roof === 'Мягкая кровля') {
        const roofArea = area * 1.15;
        items.push(
            { name: 'Гибкая черепица', unit: 'м²', category: EstimateCategory.ROOF, subgroup: EstimateSubgroup.MATERIALS, quantity: roofArea },
            { name: 'Подкладочный ковёр', unit: 'м²', category: EstimateCategory.ROOF, subgroup: EstimateSubgroup.MATERIALS, quantity: roofArea },
            { name: 'Монтаж мягкой кровли', unit: 'м²', category: EstimateCategory.ROOF, subgroup: EstimateSubgroup.WORKS, quantity: roofArea },
        );
    }

    if (params.insulation === 'Минвата 150мм') {
        items.push(
            { name: 'Утеплитель минвата 150мм', unit: 'м²', category: EstimateCategory.WALLS, subgroup: EstimateSubgroup.MATERIALS, quantity: wallArea },
            { name: 'Пароизоляция', unit: 'м²', category: EstimateCategory.WALLS, subgroup: EstimateSubgroup.MATERIALS, quantity: wallArea },
            { name: 'Ветровлагозащитная мембрана', unit: 'м²', category: EstimateCategory.WALLS, subgroup: EstimateSubgroup.MATERIALS, quantity: wallArea },
            { name: 'Утепление стен', unit: 'м²', category: EstimateCategory.WALLS, subgroup: EstimateSubgroup.WORKS, quantity: wallArea },
        );
    } else if (params.insulation === 'Минвата 200мм') {
        items.push(
            { name: 'Утеплитель минвата 200мм', unit: 'м²', category: EstimateCategory.WALLS, subgroup: EstimateSubgroup.MATERIALS, quantity: wallArea },
            { name: 'Пароизоляция', unit: 'м²', category: EstimateCategory.WALLS, subgroup: EstimateSubgroup.MATERIALS, quantity: wallArea },
            { name: 'Ветровлагозащитная мембрана', unit: 'м²', category: EstimateCategory.WALLS, subgroup: EstimateSubgroup.MATERIALS, quantity: wallArea },
            { name: 'Утепление стен', unit: 'м²', category: EstimateCategory.WALLS, subgroup: EstimateSubgroup.WORKS, quantity: wallArea },
        );
    }

    if (params.windowsDoors === 'Стандарт') {
        const doorCount = Math.max(1, Math.ceil(area / 60));
        const windowCount = Math.max(2, Math.ceil(area / 25));
        items.push(
            { name: 'Окно стандарт', unit: 'шт', category: EstimateCategory.WINDOWS, subgroup: EstimateSubgroup.MATERIALS, quantity: windowCount },
            { name: 'Дверь входная', unit: 'шт', category: EstimateCategory.WINDOWS, subgroup: EstimateSubgroup.MATERIALS, quantity: doorCount },
            { name: 'Установка окон', unit: 'шт', category: EstimateCategory.WINDOWS, subgroup: EstimateSubgroup.WORKS, quantity: windowCount },
            { name: 'Установка дверей', unit: 'шт', category: EstimateCategory.WINDOWS, subgroup: EstimateSubgroup.WORKS, quantity: doorCount },
        );
    }

    if (params.finishLevel === 'Чистовая') {
        items.push(
            { name: 'Штукатурка стен', unit: 'м²', category: EstimateCategory.WALLS, subgroup: EstimateSubgroup.WORKS, quantity: wallArea },
            { name: 'Покраска стен', unit: 'м²', category: EstimateCategory.WALLS, subgroup: EstimateSubgroup.WORKS, quantity: wallArea },
            { name: 'Напольное покрытие', unit: 'м²', category: EstimateCategory.GRILLAGE, subgroup: EstimateSubgroup.MATERIALS, quantity: area },
            { name: 'Укладка напольного покрытия', unit: 'м²', category: EstimateCategory.GRILLAGE, subgroup: EstimateSubgroup.WORKS, quantity: area },
        );
    }

    items.push(
        { name: 'Электрика', unit: 'точка', category: EstimateCategory.ELECTRICAL, subgroup: EstimateSubgroup.WORKS, quantity: Math.max(5, Math.ceil(area / 10)) },
        { name: 'Доставка материалов', unit: 'комплект', category: EstimateCategory.LOGISTICS, subgroup: EstimateSubgroup.DELIVERY, quantity: 1 },
    );

    return items;
}

function buildWizardItems(
    params: SmartWizardParams,
    estimates: Estimate[],
    materials: Material[],
    works: Work[],
): SmartWizardResult {
    const warnings: SmartWizardWarning[] = [];
    const approved = filterApprovedEstimates(estimates);

    if (approved.length === 0) {
        warnings.push({
            type: 'missing_data',
            message: 'Нет согласованных смет для анализа. Используется базовый набор позиций.',
        });
    }

    const similar = findSimilarEstimates(approved, params);
    const itemStats = approved.length > 0 ? buildItemStats(similar) : new Map<string, ItemStats>();

    const items: EstimateItem[] = [];
    const addedKeys = new Set<string>();
    const autoCategories = new Map<EstimateCategory, number>();
    let needsReviewCount = 0;

    const requiredItems = getRequiredItems(params);

    for (const req of requiredItems) {
        const key = normalizeKey(req.name);
        if (addedKeys.has(key)) continue;
        addedKeys.add(key);

        const stats = itemStats.get(key);
        const isFromHistory = stats && stats.frequency >= 0.4;
        const isReviewed = stats && stats.frequency >= 0.7;

        let quantity = req.quantity;
        if (stats && stats.quantityPerM2 > 0 && params.area > 0) {
            quantity = stats.quantityPerM2 * params.area;
            if (req.unit === 'шт' || req.unit === 'комплект') {
                quantity = Math.max(1, Math.round(quantity));
            } else {
                quantity = Math.round(quantity * 100) / 100;
            }
        }

        let price = 0;
        if (req.subgroup === EstimateSubgroup.MATERIALS) {
            price = getMaterialPrice(req.name, materials, stats?.medianPrice ?? 0);
        } else if (req.subgroup === EstimateSubgroup.WORKS) {
            price = getWorkPrice(req.name, works, stats?.medianPrice ?? 0);
        } else {
            price = stats?.medianPrice ?? 0;
        }

        if (!isReviewed && isFromHistory) {
            needsReviewCount++;
        }
        if (!isFromHistory && !stats) {
            needsReviewCount++;
        }

        const total = Math.round(quantity * price * 100) / 100;
        items.push({
            id: `item-sw-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name: req.name,
            unit: req.unit,
            quantity,
            price,
            total,
            category: req.category,
            subgroup: req.subgroup,
        });

        autoCategories.set(req.category, (autoCategories.get(req.category) || 0) + 1);
    }

    if (similar.length < 3 && approved.length > 0) {
        warnings.push({
            type: 'low_confidence',
            message: `Найдено мало похожих смет (${similar.length}). Расчёт может быть неточным.`,
        });
    }

    if (params.area < 15) {
        warnings.push({
            type: 'unusual_params',
            message: 'Площадь менее 15 м² — количества могут быть неточными.',
        });
    }

    if (params.floors > 2) {
        warnings.push({
            type: 'unusual_params',
            message: 'Более 2 этажей — проверьте количество стеновых материалов.',
        });
    }

    const autoSummary: AutoAddedSummary[] = [];
    for (const [category, count] of autoCategories) {
        autoSummary.push({
            category,
            count,
            description: getCategoryDescription(category),
        });
    }

    return {
        items,
        autoAddedCount: items.length,
        needsReviewCount,
        autoSummary,
        warnings,
    };
}

function getCategoryDescription(category: EstimateCategory): string {
    const descriptions: Record<string, string> = {
        [EstimateCategory.FOUNDATION]: 'Фундамент и основание',
        [EstimateCategory.GRILLAGE]: 'Ростверк, лаги, полы',
        [EstimateCategory.WALLS]: 'Стены и утепление',
        [EstimateCategory.ROOF]: 'Кровля и потолок',
        [EstimateCategory.WINDOWS]: 'Окна и двери',
        [EstimateCategory.ELECTRICAL]: 'Электрика',
        [EstimateCategory.LOGISTICS]: 'Логистика и доставка',
        [EstimateCategory.DEMOLITION]: 'Демонтаж',
        [EstimateCategory.GENERAL]: 'Общие работы',
    };
    return descriptions[category] || category;
}

export function buildSmartEstimate(
    params: SmartWizardParams,
    estimates: Estimate[],
    materials: Material[],
    works: Work[],
): SmartWizardResult {
    return buildWizardItems(params, estimates, materials, works);
}
