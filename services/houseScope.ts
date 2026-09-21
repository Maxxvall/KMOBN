import { EstimateCategory, EstimateItem, EstimateSubgroup } from '../types';
import type { HousePackage } from './houseCalculator';

export type HouseScopeStatus = 'included' | 'partial' | 'needs-clarification' | 'not-included';

export type HouseScopeId =
    | 'foundation'
    | 'structure'
    | 'roof'
    | 'insulation'
    | 'openings'
    | 'rough-finish'
    | 'finish'
    | 'electrical'
    | 'heating'
    | 'water-supply'
    | 'sewerage'
    | 'ventilation';

export interface HouseScopeCheck {
    id: HouseScopeId;
    label: string;
    status: HouseScopeStatus;
    required: boolean;
    total: number;
    itemCount: number;
    details: string[];
}

export const HOUSE_SCOPE_STATUS_LABELS: Record<HouseScopeStatus, string> = {
    included: 'Учтено',
    partial: 'Частично',
    'needs-clarification': 'Нужно уточнить',
    'not-included': 'Не входит',
};

const labels: Record<HouseScopeId, string> = {
    foundation: 'Фундамент',
    structure: 'Каркас и перекрытия',
    roof: 'Кровля',
    insulation: 'Утепление и защитные слои',
    openings: 'Остекление и двери',
    'rough-finish': 'Черновая отделка',
    finish: 'Чистовая отделка',
    electrical: 'Электрика',
    heating: 'Отопление',
    'water-supply': 'Водоснабжение',
    sewerage: 'Канализация',
    ventilation: 'Вентиляция',
};

const requiredByPackage: Record<HousePackage, HouseScopeId[]> = {
    box: ['foundation', 'structure', 'roof'],
    'warm-shell': ['foundation', 'structure', 'roof', 'insulation', 'openings'],
    'rough-finish': ['foundation', 'structure', 'roof', 'insulation', 'openings', 'rough-finish'],
    turnkey: ['foundation', 'structure', 'roof', 'insulation', 'openings', 'rough-finish', 'finish'],
    'turnkey-engineering': [
        'foundation', 'structure', 'roof', 'insulation', 'openings', 'rough-finish', 'finish',
        'electrical', 'heating', 'water-supply', 'sewerage', 'ventilation',
    ],
};

export const getRequiredHouseScopeIds = (housePackage: HousePackage): HouseScopeId[] => [...requiredByPackage[housePackage]];

const allScopeIds = Object.keys(labels) as HouseScopeId[];
const normalize = (value: string): string => value.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
const hasAny = (value: string, fragments: string[]): boolean => fragments.some(fragment => value.includes(fragment));

export const detectHouseScopeId = (item: EstimateItem): HouseScopeId | null => {
    const text = normalize(`${item.name} ${item.note || ''}`);
    if (item.category === EstimateCategory.LOGISTICS || item.subgroup === EstimateSubgroup.DELIVERY) return null;
    if (hasAny(text, ['террас', 'веранд', 'крыльц', 'бесед', 'балкон', 'навес', 'гараж'])) return null;
    if (item.category === EstimateCategory.FOUNDATION) return 'foundation';
    if (item.category === EstimateCategory.ROOF || hasAny(text, ['кровл', 'стропил', 'конек', 'свес'])) return 'roof';
    if (item.category === EstimateCategory.WINDOWS || hasAny(text, ['окн', 'остеклен', 'двер'])) return 'openings';
    if (item.category === EstimateCategory.ELECTRICAL || hasAny(text, ['электр', 'розетк', 'выключател'])) return 'electrical';
    if (hasAny(text, ['отоплен', 'котельн', 'радиатор', 'теплый пол'])) return 'heating';
    if (item.category === EstimateCategory.WATER_SUPPLY || hasAny(text, ['водоснаб', 'водопровод', 'скважин'])) return 'water-supply';
    if (item.category === EstimateCategory.SEWERAGE || hasAny(text, ['канализ', 'септик'])) return 'sewerage';
    if (hasAny(text, ['вентиляц', 'воздуховод'])) return 'ventilation';
    if (hasAny(text, ['гипсокарт', 'гкл', 'предчист', 'черновая отделка', 'шпаклев', 'стяжк'])) return 'rough-finish';
    if (hasAny(text, ['чистовая', 'покраск', 'ламинат', 'плитк', 'обои', 'линолеум'])) return 'finish';
    if (hasAny(text, ['утепл', 'пароизоляц', 'ветрозащит', 'мембран', 'герметизац'])) return 'insulation';
    if (item.category === EstimateCategory.WALLS || item.category === EstimateCategory.GRILLAGE) return 'structure';
    return null;
};

const needsMaterialAndWork = new Set<HouseScopeId>([
    'foundation', 'structure', 'roof', 'insulation', 'rough-finish', 'finish',
]);

export function evaluateHouseScope(items: EstimateItem[], housePackage: HousePackage): HouseScopeCheck[] {
    const required = new Set(requiredByPackage[housePackage]);
    return allScopeIds.map(id => {
        const scopeItems = items.filter(item => detectHouseScopeId(item) === id);
        const isRequired = required.has(id);
        const total = scopeItems.reduce((sum, item) => sum + (Number.isFinite(item.total) ? item.total : 0), 0);
        if (!isRequired) {
            return { id, label: labels[id], status: 'not-included', required: false, total, itemCount: scopeItems.length, details: [] };
        }
        if (!scopeItems.length) {
            return {
                id, label: labels[id], status: 'needs-clarification', required: true, total: 0, itemCount: 0,
                details: ['Нет сопоставленных позиций с объёмом и ценой.'],
            };
        }

        const details: string[] = [];
        const invalid = scopeItems.filter(item => !(item.quantity > 0) || !(item.price >= 0) || !(item.total > 0));
        if (invalid.length) details.push(`Нужно проверить объём или цену: ${invalid.map(item => item.name).join(', ')}.`);
        if (needsMaterialAndWork.has(id)) {
            const hasMaterials = scopeItems.some(item => item.subgroup === EstimateSubgroup.MATERIALS);
            const hasWorks = scopeItems.some(item => item.subgroup === EstimateSubgroup.WORKS);
            if (!hasMaterials) details.push('Не найдены материалы.');
            if (!hasWorks) details.push('Не найдены работы.');
        }

        return {
            id,
            label: labels[id],
            status: details.length ? 'partial' : 'included',
            required: true,
            total,
            itemCount: scopeItems.length,
            details,
        };
    });
}
