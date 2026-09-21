import {
    Estimate,
    EstimateCategory,
    EstimateItem,
    EstimateStatus,
    EstimateSubgroup,
    SectionId,
} from '../types';
import { detectHouseScopeId, evaluateHouseScope, getRequiredHouseScopeIds, HouseScopeCheck } from './houseScope';
import {
    calculateHouseGeometry,
    HouseGeometryInput,
    HouseGeometryResult,
    resolveHouseGeometryQuantity,
} from './houseGeometry';

export type HousePackage =
    | 'box'
    | 'warm-shell'
    | 'rough-finish'
    | 'turnkey'
    | 'turnkey-engineering';

export type RoofShape = 'single-slope' | 'gable' | 'hip' | 'flat' | 'mansard';

export interface HouseFinancialRates {
    overheadPercent: number;
    marginPercent: number;
    reservePercent: number;
    taxPercent: number;
    discountPercent: number;
}

export interface HouseCalculatorInput {
    estimates: Estimate[];
    area: number;
    floors: number;
    glazingArea: number;
    doors: number;
    roofShape: RoofShape;
    package: HousePackage;
    additions?: HouseAdditionType[];
    geometry?: HouseGeometryInput;
    rates: HouseFinancialRates;
    now?: Date;
}

export type HouseAdditionType = 'terrace' | 'porch' | 'veranda' | 'canopy' | 'garage' | 'balcony' | 'gazebo';

export const HOUSE_ADDITION_OPTIONS: Array<{ value: HouseAdditionType; label: string }> = [
    { value: 'terrace', label: 'Терраса' },
    { value: 'porch', label: 'Крыльцо' },
    { value: 'veranda', label: 'Веранда' },
    { value: 'canopy', label: 'Навес' },
    { value: 'garage', label: 'Гараж' },
    { value: 'balcony', label: 'Балкон' },
    { value: 'gazebo', label: 'Беседка' },
];

export const GLAZING_MATERIAL_PRICE_PER_SQM = 14_000;
export const GLAZING_INSTALLATION_PRICE_PER_SQM = 2_000;
export const INTERIOR_DOOR_PRICE = 15_000;
export const INTERIOR_DOOR_INSTALLATION_PRICE = 6_000;
export const ENTRANCE_DOOR_PRICE = 50_000;

export interface HouseFinancialBreakdown {
    materials: number;
    works: number;
    logistics: number;
    equipment: number;
    overhead: number;
    margin: number;
    reserve: number;
    tax: number;
    discount: number;
    final: number;
}

export interface HouseCalculatorSection {
    category: SectionId;
    total: number;
    items: EstimateItem[];
}

export interface HouseCalculatorEvidence {
    eligibleEstimateCount: number;
    approvedCount: number;
    sentCount: number;
    draftCount: number;
    referenceMatched: boolean;
    sourceReason: string;
}

export interface HouseCalculatorResult {
    low: number;
    base: number;
    high: number;
    confidence: 'low' | 'medium' | 'high';
    evidence: HouseCalculatorEvidence;
    sections: HouseCalculatorSection[];
    items: EstimateItem[];
    warnings: string[];
    sourceEstimate: Estimate;
    rates: HouseFinancialRates;
    financials: HouseFinancialBreakdown;
    scope?: HouseScopeCheck[];
    geometry?: HouseGeometryResult;
}

export interface ParsedHouseDescription {
    area?: number;
    package?: HousePackage;
}

export type HouseTier = 'economy' | 'optimal' | 'premium';

export interface HouseVariantResult {
    tier: HouseTier;
    label: string;
    description: string;
    package: HousePackage;
    result: HouseCalculatorResult;
}

export const HOUSE_TIER_CONFIG: Array<Omit<HouseVariantResult, 'result'>> = [
    { tier: 'economy', label: 'Эконом', description: 'Тёплый контур без отделки и инженерии', package: 'warm-shell' },
    { tier: 'optimal', label: 'Оптимальный', description: 'Дом с подготовкой под чистовую отделку', package: 'rough-finish' },
    { tier: 'premium', label: 'Премиум', description: 'Под ключ с инженерными системами', package: 'turnkey-engineering' },
];

const DAY_MS = 24 * 60 * 60 * 1000;
const REFERENCE_CLIENT = 'наталья дубровка';
const REFERENCE_BUILDING = 'одноэтажный дачный дом';

const normalize = (value: string): string => value.toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/[_\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const money = (value: number): number => Math.round(value * 100) / 100;

const dateOf = (estimate: Estimate): number => {
    const value = estimate.updated_at || estimate.date || estimate.created_at || '';
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? timestamp : 0;
};

const isFrameHouse = (estimate: Estimate): boolean => {
    const buildingType = normalize(estimate.buildingType);
    const descriptor = normalize(`${estimate.buildingType} ${estimate.explanation || ''}`);
    const excluded = ['баня', 'террас', 'пристрой', 'пост охраны', 'крыша', 'изолятор', 'обшив'];
    if (excluded.some(word => buildingType.includes(word))) return false;
    if (!descriptor.includes('дом') && !descriptor.includes('коттедж')) return false;

    const sourceText = normalize(`${descriptor} ${(estimate.items || []).map(item => item.name).join(' ')}`);
    if (['кирпич', 'газобет', 'пеноблок', 'бетонный дом', 'брус', 'бревн'].some(word => sourceText.includes(word))) return false;
    // Компания работает только с каркасными домами. Поэтому любой объект типа
    // «дом/коттедж» допустим, пока в самой смете явно не указана другая технология.
    return true;
};

export function selectLatestVersions(estimates: Estimate[]): Estimate[] {
    const latest = new Map<string, Estimate>();
    for (const estimate of estimates) {
        const key = estimate.estimateNumber || estimate.parentId || estimate.id;
        const previous = latest.get(key);
        if (!previous || estimate.version > previous.version
            || (estimate.version === previous.version && dateOf(estimate) > dateOf(previous))) {
            latest.set(key, estimate);
        }
    }
    return [...latest.values()];
}

/** Selects all approved/sent estimates and drafts no older than 90 days. */
export function selectEligibleHouseHistory(estimates: Estimate[], now = new Date()): Estimate[] {
    const draftStart = now.getTime() - 90 * DAY_MS;
    const latestDraftIds = new Set(selectLatestVersions(estimates.filter(estimate => estimate.status === EstimateStatus.DRAFT)).map(estimate => estimate.id));
    return estimates.filter(estimate => {
        if (estimate.isArchived || !estimate.items?.length || !isFrameHouse(estimate)) return false;
        const timestamp = dateOf(estimate);
        if (estimate.status === EstimateStatus.DRAFT) return latestDraftIds.has(estimate.id) && timestamp >= draftStart && timestamp <= now.getTime();
        return estimate.status === EstimateStatus.APPROVED || estimate.status === EstimateStatus.SENT;
    });
}

/** Broader source pool for AI when structured house recognition cannot choose a reference. */
export function selectHouseHistoryForAi(estimates: Estimate[]): Estimate[] {
    const excluded = ['баня', 'террас', 'пристрой', 'пост охраны', 'крыша', 'изолятор', 'обшив'];
    return estimates.filter(estimate => {
        if (estimate.isArchived || !estimate.items?.length) return false;
        if (estimate.status !== EstimateStatus.APPROVED && estimate.status !== EstimateStatus.SENT) return false;
        const buildingType = normalize(estimate.buildingType || '');
        return !excluded.some(word => buildingType.includes(word));
    });
}

export function parseHouseDescription(description: string): ParsedHouseDescription {
    const text = normalize(description || '');
    const areaMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(?:м2|м²|кв\.?\s*м)/i);
    const parsedArea = areaMatch ? Number(areaMatch[1].replace(',', '.')) : undefined;
    const area = parsedArea && parsedArea >= 20 && parsedArea <= 500 ? parsedArea : undefined;
    let packageValue: HousePackage | undefined;
    if (text.includes('премиум')) packageValue = 'turnkey-engineering';
    else if (text.includes('под ключ') && (text.includes('инженер') || text.includes('коммуникац'))) packageValue = 'turnkey-engineering';
    else if (text.includes('под ключ')) packageValue = 'turnkey';
    else if (text.includes('оптималь')) packageValue = 'rough-finish';
    else if (text.includes('чернов') || text.includes('предчистов')) packageValue = 'rough-finish';
    else if (text.includes('тепл') && text.includes('контур')) packageValue = 'warm-shell';
    else if (text.includes('коробк')) packageValue = 'box';
    return { area, package: packageValue };
}

const isReference = (estimate: Estimate): boolean => {
    const client = normalize(estimate.client);
    const building = normalize(estimate.buildingType);
    return estimate.status === EstimateStatus.APPROVED
        && client.includes(REFERENCE_CLIENT)
        && building.includes(REFERENCE_BUILDING)
        && Math.abs(estimate.area - 79) <= 1;
};

const explanationMatchesPackage = (estimate: Estimate, targetPackage?: HousePackage): boolean => {
    if (!targetPackage) return false;
    const text = normalize(estimate.explanation || '');
    if (!text) return false;
    if (targetPackage === 'box' || targetPackage === 'warm-shell') {
        return text.includes('тепл') && text.includes('контур');
    }
    if (targetPackage === 'rough-finish') return text.includes('оптималь');
    if (targetPackage === 'turnkey' || targetPackage === 'turnkey-engineering') {
        return text.includes('под ключ') || text.includes('премиум');
    }
    return false;
};

const statusPriority: Record<EstimateStatus, number> = {
    [EstimateStatus.APPROVED]: 0,
    [EstimateStatus.SENT]: 1,
    [EstimateStatus.DRAFT]: 2,
};

export function chooseHouseReference(
    estimates: Estimate[],
    targetArea: number,
    targetPackage?: HousePackage,
): Estimate | undefined {
    const approved = estimates.filter(item => item.status === EstimateStatus.APPROVED);
    const pool = approved.length ? approved : estimates;
    return [...pool].sort((left, right) => (
        statusPriority[left.status] - statusPriority[right.status]
        || Number(!explanationMatchesPackage(left, targetPackage)) - Number(!explanationMatchesPackage(right, targetPackage))
        || Number(!isReference(left)) - Number(!isReference(right))
        || Math.abs(left.area - targetArea) - Math.abs(right.area - targetArea)
        || dateOf(right) - dateOf(left)
    ))[0];
}

type ItemKind = 'structure' | 'roof' | 'warm-shell' | 'addition' | 'rough-finish' | 'finish' | 'engineering' | 'logistics' | 'equipment';

const hasAny = (text: string, words: string[]): boolean => words.some(word => text.includes(word));

const itemKind = (item: EstimateItem): ItemKind => {
    const text = normalize(`${item.name} ${item.note || ''}`);
    if (item.category === EstimateCategory.LOGISTICS || item.subgroup === EstimateSubgroup.DELIVERY
        || hasAny(text, ['достав', 'разгруз', 'транспорт', 'логист'])) return 'logistics';
    if (hasAny(text, ['аренд', 'техник', 'манипулятор', 'кран', 'экскаватор', 'бурени'])) return 'equipment';
    if (item.category === EstimateCategory.ELECTRICAL
        || item.category === EstimateCategory.WATER_SUPPLY
        || item.category === EstimateCategory.SEWERAGE
        || hasAny(text, ['электр', 'отоплен', 'водоснаб', 'канализ', 'септик', 'вентиляц', 'сантех', 'котельн'])) return 'engineering';
    if (hasAny(text, ['террас', 'веранд', 'крыльц', 'бесед', 'балкон', 'навес', 'гараж'])) return 'addition';
    if (hasAny(text, ['гипсокарт', 'гкл', 'предчист', 'черновая отделка', 'шпаклев', 'стяжк'])) return 'rough-finish';
    if (hasAny(text, ['чистовая', 'покраск', 'ламинат', 'плитк', 'обои', 'линолеум'])) return 'finish';
    if (item.category === EstimateCategory.WINDOWS
        || hasAny(text, ['окн', 'двер', 'утепл', 'пароизоляц', 'ветрозащит', 'мембран', 'герметизац'])) return 'warm-shell';
    if (item.category === EstimateCategory.ROOF || hasAny(text, ['кровл', 'кры', 'стропил'])) return 'roof';
    return 'structure';
};

const additionType = (item: EstimateItem): HouseAdditionType | null => {
    const text = normalize(`${item.name} ${item.note || ''}`);
    if (text.includes('террас')) return 'terrace';
    if (text.includes('крыльц')) return 'porch';
    if (text.includes('веранд')) return 'veranda';
    if (text.includes('навес')) return 'canopy';
    if (text.includes('гараж')) return 'garage';
    if (text.includes('балкон')) return 'balcony';
    if (text.includes('бесед')) return 'gazebo';
    return null;
};

const packageAllows = (kind: ItemKind, selected: HousePackage): boolean => {
    if (kind === 'addition') return true;
    if (kind === 'warm-shell') return selected !== 'box';
    if (kind === 'rough-finish') return selected === 'rough-finish' || selected === 'turnkey' || selected === 'turnkey-engineering';
    if (kind === 'finish') return selected === 'turnkey' || selected === 'turnkey-engineering';
    if (kind === 'engineering') return selected === 'turnkey-engineering';
    return true;
};

const roofFactor: Record<RoofShape, number> = {
    'single-slope': 0.95,
    gable: 1,
    hip: 1.15,
    flat: 0.9,
    mansard: 1.25,
};

const isOpeningItem = (item: EstimateItem): boolean => {
    const text = normalize(item.name);
    return text.includes('окн') || text.includes('двер') || item.category === EstimateCategory.WINDOWS;
};

const glazingItems = (area: number): EstimateItem[] => area > 0 ? [
    {
        id: 'house-glazing-materials',
        name: 'Остекление',
        unit: 'м²',
        quantity: area,
        price: GLAZING_MATERIAL_PRICE_PER_SQM,
        total: money(area * GLAZING_MATERIAL_PRICE_PER_SQM),
        category: EstimateCategory.WINDOWS,
        subgroup: EstimateSubgroup.MATERIALS,
        note: `Рыночная цена ${GLAZING_MATERIAL_PRICE_PER_SQM.toLocaleString('ru-RU')} ₽/м²`,
    },
    {
        id: 'house-glazing-installation',
        name: 'Монтаж остекления',
        unit: 'м²',
        quantity: area,
        price: GLAZING_INSTALLATION_PRICE_PER_SQM,
        total: money(area * GLAZING_INSTALLATION_PRICE_PER_SQM),
        category: EstimateCategory.WINDOWS,
        subgroup: EstimateSubgroup.WORKS,
        note: `Рыночная цена ${GLAZING_INSTALLATION_PRICE_PER_SQM.toLocaleString('ru-RU')} ₽/м²`,
    },
] : [];

const doorItems = (quantity: number): EstimateItem[] => [
    {
        id: 'house-entrance-door',
        name: 'Входная дверь',
        unit: 'шт',
        quantity: 1,
        price: ENTRANCE_DOOR_PRICE,
        total: ENTRANCE_DOOR_PRICE,
        category: EstimateCategory.WINDOWS,
        subgroup: EstimateSubgroup.MATERIALS,
        note: 'Стандартная входная дверь',
    },
    ...(quantity > 0 ? [
        {
            id: 'house-interior-doors',
            name: 'Межкомнатные двери',
            unit: 'шт',
            quantity,
            price: INTERIOR_DOOR_PRICE,
            total: money(quantity * INTERIOR_DOOR_PRICE),
            category: EstimateCategory.WINDOWS,
            subgroup: EstimateSubgroup.MATERIALS,
            note: `Стандартная дверь ${INTERIOR_DOOR_PRICE.toLocaleString('ru-RU')} ₽/шт`,
        },
        {
            id: 'house-interior-door-installation',
            name: 'Установка межкомнатных дверей',
            unit: 'шт',
            quantity,
            price: INTERIOR_DOOR_INSTALLATION_PRICE,
            total: money(quantity * INTERIOR_DOOR_INSTALLATION_PRICE),
            category: EstimateCategory.WINDOWS,
            subgroup: EstimateSubgroup.WORKS,
            note: `Монтаж ${INTERIOR_DOOR_INSTALLATION_PRICE.toLocaleString('ru-RU')} ₽/шт`,
        },
    ] : []),
];

export function scaleReferenceItems(source: Estimate, input: HouseCalculatorInput): EstimateItem[] {
    const sourceArea = source.area > 0 ? source.area : input.area;
    const areaFactor = input.area / sourceArea;
    const floorFactor = Math.max(1, input.floors);
    const geometry = input.geometry ? calculateHouseGeometry(input.geometry) : null;
    return source.items.flatMap((item, index) => {
        if (item.isActualOnly) return [];
        const kind = itemKind(item);
        if (!packageAllows(kind, input.package)) return [];
        if (kind === 'addition') {
            const type = additionType(item);
            if (!type || !input.additions?.includes(type)) return [];
        }
        if (isOpeningItem(item)) return [];
        let factor = areaFactor;
        if (kind === 'roof') factor *= roofFactor[input.roofShape];
        if (kind === 'logistics' || kind === 'equipment') factor = 1;
        if (kind === 'structure' && input.floors > 1) factor *= 1 + (floorFactor - 1) * 0.35;
        const sourceTotal = Number.isFinite(item.total) ? Math.max(0, item.total) : Math.max(0, item.quantity * item.price);
        const geometryQuantity = geometry ? resolveHouseGeometryQuantity(item, geometry) : null;
        const quantity = geometryQuantity
            ? money(Math.max(0, geometryQuantity.quantity))
            : money(Math.max(0, item.quantity) * Math.max(0, factor));
        const sourceUnitPrice = item.quantity > 0 ? sourceTotal / item.quantity : Math.max(0, item.price);
        const total = geometryQuantity
            ? money(quantity * sourceUnitPrice)
            : money(sourceTotal * Math.max(0, factor));
        const price = quantity > 0 ? money(total / quantity) : Math.max(0, item.price);
        const { actual: _actual, isActualOnly: _isActualOnly, ...plannedItem } = item;
        const geometryNote = geometryQuantity ? `Количество по геометрии: ${geometryQuantity.basis}` : '';
        const note = [plannedItem.note, geometryNote].filter(Boolean).join('. ');
        return [{ ...plannedItem, id: `house-${index}-${item.id}`, quantity, price, total, note: note || undefined }];
    });
}

const scopeKindsByPackage: Record<HousePackage, ItemKind[]> = {
    box: [],
    'warm-shell': [],
    'rough-finish': ['rough-finish'],
    turnkey: ['rough-finish', 'finish'],
    'turnkey-engineering': ['rough-finish', 'finish', 'engineering'],
};

const scopeKindLabel: Record<ItemKind, string> = {
    structure: 'конструктив',
    roof: 'кровля',
    'warm-shell': 'тёплый контур',
    addition: 'дополнительные строения',
    'rough-finish': 'черновая отделка',
    finish: 'чистовая отделка',
    engineering: 'инженерные системы',
    logistics: 'логистика',
    equipment: 'техника',
};

const sourceHasKind = (source: Estimate, kind: ItemKind): boolean => source.items.some(item => itemKind(item) === kind);

const chooseScopeSource = (
    sources: Estimate[],
    primary: Estimate,
    kind: ItemKind,
    targetArea: number,
    targetPackage: HousePackage,
): Estimate | undefined => {
    return sources
        .filter(source => source.id !== primary.id && sourceHasKind(source, kind))
        .sort((left, right) => (
            statusPriority[left.status] - statusPriority[right.status]
            || Number(!explanationMatchesPackage(left, targetPackage)) - Number(!explanationMatchesPackage(right, targetPackage))
            || Math.abs(left.area - targetArea) - Math.abs(right.area - targetArea)
        ))[0];
};

const scalePackageScope = (primary: Estimate, history: Estimate[], input: HouseCalculatorInput): { items: EstimateItem[]; supplements: string[] } => {
    const items = scaleReferenceItems(primary, input);
    const supplements: string[] = [];

    for (const kind of scopeKindsByPackage[input.package]) {
        if (sourceHasKind(primary, kind)) continue;
        const source = chooseScopeSource(history, primary, kind, input.area, input.package);
        if (!source) continue;
        const scopeItems = scaleReferenceItems(source, input)
            .filter(item => itemKind(item) === kind)
            .map((item, index) => ({ ...item, id: `house-supplement-${kind}-${source.id}-${index}-${item.id}` }));
        if (!scopeItems.length) continue;
        items.push(...scopeItems);
        supplements.push(`${scopeKindLabel[kind]}: ${source.estimateNumber}`);
    }

    for (const scopeId of getRequiredHouseScopeIds(input.package)) {
        if (items.some(item => detectHouseScopeId(item) === scopeId)) continue;
        const source = history
            .filter(candidate => candidate.id !== primary.id && candidate.items.some(item => detectHouseScopeId(item) === scopeId))
            .sort((left, right) => statusPriority[left.status] - statusPriority[right.status]
                || Math.abs(left.area - input.area) - Math.abs(right.area - input.area))[0];
        if (!source) continue;
        const scopeItems = scaleReferenceItems(source, input)
            .filter(item => detectHouseScopeId(item) === scopeId)
            .map((item, index) => ({ ...item, id: `house-supplement-${scopeId}-${source.id}-${index}-${item.id}` }));
        if (!scopeItems.length) continue;
        items.push(...scopeItems);
        supplements.push(`${scopeId}: ${source.estimateNumber}`);
    }

    for (const addition of input.additions || []) {
        if (items.some(item => additionType(item) === addition)) continue;
        const source = history
            .filter(candidate => candidate.items.some(item => additionType(item) === addition))
            .sort((left, right) => statusPriority[left.status] - statusPriority[right.status]
                || Math.abs(left.area - input.area) - Math.abs(right.area - input.area))[0];
        if (!source) continue;
        const additionItems = scaleReferenceItems(source, input)
            .filter(item => additionType(item) === addition)
            .map((item, index) => ({ ...item, id: `house-addition-${addition}-${source.id}-${index}-${item.id}` }));
        if (!additionItems.length) continue;
        items.push(...additionItems);
        const label = HOUSE_ADDITION_OPTIONS.find(option => option.value === addition)?.label || addition;
        supplements.push(`${label}: ${source.estimateNumber}`);
    }

    return { items, supplements };
};

const validateRates = (rates: HouseFinancialRates): void => {
    for (const [name, value] of Object.entries(rates)) {
        if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error(`Некорректная ставка ${name}: ${value}`);
    }
};

const sum = (items: EstimateItem[]): number => items.reduce((total, item) => total + item.total, 0);

const financialBreakdown = (items: EstimateItem[], rates: HouseFinancialRates): HouseFinancialBreakdown => {
    let materials = 0; let works = 0; let logistics = 0; let equipment = 0;
    for (const item of items) {
        const kind = itemKind(item);
        if (kind === 'logistics') logistics += item.total;
        else if (kind === 'equipment') equipment += item.total;
        else if (item.subgroup === EstimateSubgroup.WORKS) works += item.total;
        else materials += item.total;
    }
    const direct = materials + works + logistics + equipment;
    const overhead = direct * rates.overheadPercent / 100;
    const cost = direct + overhead;
    const margin = cost * rates.marginPercent / 100;
    const reserve = cost * rates.reservePercent / 100;
    const beforeDiscount = cost + margin + reserve;
    const discount = beforeDiscount * rates.discountPercent / 100;
    const tax = (beforeDiscount - discount) * rates.taxPercent / 100;
    return {
        materials: money(materials), works: money(works), logistics: money(logistics), equipment: money(equipment),
        overhead: money(overhead), margin: money(margin), reserve: money(reserve), tax: money(tax),
        discount: money(discount), final: money(beforeDiscount - discount + tax),
    };
};

export function createAiHouseEstimateResult(
    input: HouseCalculatorInput,
    items: EstimateItem[],
    sources: Estimate[],
    aiWarnings: string[] = [],
): HouseCalculatorResult {
    validateRates(input.rates);
    const source = chooseHouseReference(sources, input.area, input.package) || sources[0];
    if (!source) throw new Error('AI не нашёл согласованных смет текущего года для проверки цен.');
    const pricedItems = items.filter(item => Number.isFinite(item.total) && item.total > 0);
    if (!pricedItems.length) throw new Error('AI не смог подобрать позиции с подтверждёнными ценами из базы.');

    const financials = financialBreakdown(pricedItems, input.rates);
    const sections = [...new Set(pricedItems.map(item => item.category))].map(category => {
        const sectionItems = pricedItems.filter(item => item.category === category);
        return { category, total: money(sum(sectionItems)), items: sectionItems };
    });
    const approvedCount = sources.filter(item => item.status === EstimateStatus.APPROVED).length;
    const sentCount = sources.filter(item => item.status === EstimateStatus.SENT).length;
    const confidence: HouseCalculatorResult['confidence'] = approvedCount >= 2 ? 'medium' : 'low';
    const spread = confidence === 'medium' ? 0.15 : 0.25;

    return {
        low: money(financials.final * (1 - spread)),
        base: financials.final,
        high: money(financials.final * (1 + spread)),
        confidence,
        evidence: {
            eligibleEstimateCount: sources.length,
            approvedCount,
            sentCount,
            draftCount: 0,
            referenceMatched: isReference(source),
            sourceReason: explanationMatchesPackage(source, input.package)
                ? 'AI выбрал допустимую смету с подходящими ключевыми словами во внутреннем пояснении.'
                : 'AI разобрал пожелания и собрал предварительный расчёт по согласованным сметам и справочникам текущего пользователя.',
        },
        sections,
        items: pricedItems,
        warnings: ['Расчёт подготовлен AI и требует проверки перед отправкой клиенту.', ...aiWarnings],
        sourceEstimate: source,
        rates: { ...input.rates },
        financials,
        scope: evaluateHouseScope(pricedItems, input.package),
        geometry: input.geometry ? calculateHouseGeometry(input.geometry) : undefined,
    };
}

export function calculateHouseEstimate(input: HouseCalculatorInput): HouseCalculatorResult {
    if (!(input.area > 0) || !(input.floors >= 1) || input.glazingArea < 0 || input.doors < 0) {
        throw new Error('Площадь и этажность должны быть больше нуля, площадь остекления и двери — неотрицательными.');
    }
    validateRates(input.rates);
    const eligible = selectEligibleHouseHistory(input.estimates, input.now);
    const broaderApproved = eligible.length ? [] : selectHouseHistoryForAi(input.estimates);
    const history = eligible.length ? eligible : broaderApproved;
    const source = chooseHouseReference(history, input.area, input.package);
    if (!source) throw new Error(`В личной базе загружено ${input.estimates.length} смет, но нет согласованных смет с позициями для расчёта дома.`);

    const { items, supplements } = scalePackageScope(source, history, input);
    if (input.package !== 'box') items.push(...glazingItems(input.glazingArea), ...doorItems(input.doors));
    const warnings: string[] = [];
    const geometry = input.geometry ? calculateHouseGeometry(input.geometry) : undefined;
    if (geometry) {
        warnings.push(...geometry.warnings);
        if (Math.abs(geometry.totalFloorArea - input.area) > 0.01) {
            warnings.push(`Площадь по геометрии ${geometry.totalFloorArea} м² отличается от площади расчёта ${input.area} м².`);
        }
    }
    for (const addition of input.additions || []) {
        if (!items.some(item => additionType(item) === addition)) {
            const label = HOUSE_ADDITION_OPTIONS.find(option => option.value === addition)?.label || addition;
            warnings.push(`${label}: в подтверждённых сметах не найдены позиции, дополнение не включено в стоимость.`);
        }
    }
    if (!eligible.length && broaderApproved.length) {
        warnings.push('Тип объекта не распознан автоматически: использована ближайшая согласованная смета из личной базы.');
    }
    const sourceKinds = new Set(source.items.map(itemKind));
    if ((input.package === 'rough-finish' || input.package === 'turnkey' || input.package === 'turnkey-engineering') && !sourceKinds.has('rough-finish')) {
        if (!supplements.some(value => value.startsWith('черновая отделка:'))) {
            warnings.push('В подтверждённых сметах нет позиций черновой отделки: они не включены в стоимость.');
        }
    }
    if ((input.package === 'turnkey' || input.package === 'turnkey-engineering') && !sourceKinds.has('finish')) {
        if (!supplements.some(value => value.startsWith('чистовая отделка:'))) {
            warnings.push('В подтверждённых сметах нет позиций чистовой отделки: они не включены в стоимость.');
        }
    }
    if (input.package === 'turnkey-engineering' && !sourceKinds.has('engineering')) {
        if (!supplements.some(value => value.startsWith('инженерные системы:'))) {
            warnings.push('В подтверждённых сметах нет инженерных систем: инженерия не включена в стоимость.');
        }
    }
    if (supplements.length) warnings.push(`Комплектация дополнена позициями из личной базы: ${supplements.join('; ')}.`);
    if (!isReference(source) && !explanationMatchesPackage(source, input.package)) {
        warnings.push('Эталон «Наталья_Дубровка, 79 м²» не найден; выбран ближайший подтверждённый аналог.');
    }

    const financials = financialBreakdown(items, input.rates);
    const sections = [...new Set(items.map(item => item.category))].map(category => {
        const sectionItems = items.filter(item => item.category === category);
        return { category, total: money(sum(sectionItems)), items: sectionItems };
    });
    const scope = evaluateHouseScope(items, input.package);
    const incompleteScope = scope.filter(item => item.required && item.status !== 'included');
    if (incompleteScope.length) {
        warnings.push(`Комплектация требует проверки: ${incompleteScope.map(item => `${item.label} — ${item.status === 'partial' ? 'частично' : 'нужно уточнить'}`).join('; ')}.`);
    }
    const approvedCount = history.filter(item => item.status === EstimateStatus.APPROVED).length;
    const sentCount = history.filter(item => item.status === EstimateStatus.SENT).length;
    const draftCount = history.filter(item => item.status === EstimateStatus.DRAFT).length;
    const confidence: HouseCalculatorResult['confidence'] = isReference(source) && approvedCount >= 3 && warnings.length === 0
        ? 'high' : isReference(source) && warnings.length === 0 ? 'medium' : approvedCount >= 3 && warnings.length <= 1 ? 'medium' : 'low';
    const spread = confidence === 'high' ? 0.1 : confidence === 'medium' ? 0.15 : 0.25;

    return {
        low: money(financials.final * (1 - spread)), base: financials.final, high: money(financials.final * (1 + spread)),
        confidence,
        evidence: {
            eligibleEstimateCount: history.length, approvedCount, sentCount, draftCount,
            referenceMatched: isReference(source),
            sourceReason: explanationMatchesPackage(source, input.package)
                ? 'Допустимая смета с подходящими ключевыми словами во внутреннем пояснении.'
                : isReference(source)
                    ? 'Явный подтверждённый эталон Наталья_Дубровка, 79 м².'
                    : 'Ближайшая по площади подтверждённая смета.',
        },
        sections, items, warnings, sourceEstimate: source, rates: { ...input.rates }, financials,
        scope,
        geometry,
    };
}

export function calculateHouseVariants(input: HouseCalculatorInput): HouseVariantResult[] {
    return HOUSE_TIER_CONFIG.map(config => ({
        ...config,
        result: calculateHouseEstimate({ ...input, package: config.package }),
    }));
}
