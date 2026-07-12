import {
    Estimate,
    EstimateCategory,
    EstimateItem,
    EstimateStatus,
    EstimateSubgroup,
} from '../types';

export type HousePackage =
    | 'box'
    | 'warm-shell'
    | 'rough-finish'
    | 'turnkey'
    | 'turnkey-engineering';

export type RoofShape = 'single-slope' | 'gable' | 'hip' | 'flat' | 'mansard';

export interface HouseAddition {
    type: 'terrace' | 'veranda' | 'porch' | 'gazebo' | 'balcony' | 'carport' | 'garage';
    area: number;
}

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
    windows: number;
    doors: number;
    exteriorDoors?: number;
    interiorDoors?: number;
    roofShape: RoofShape;
    additions: HouseAddition[];
    package: HousePackage;
    rates: HouseFinancialRates;
    now?: Date;
}

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
    category: EstimateCategory;
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
}

const DAY_MS = 24 * 60 * 60 * 1000;
const REFERENCE_CLIENT = 'наталья дубровка';
const REFERENCE_BUILDING = 'одноэтажный дачный дом';

const normalize = (value: string): string => value.toLocaleLowerCase('ru-RU')
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
    const text = normalize(`${estimate.buildingType} ${estimate.client}`);
    if (text.includes('наталья дубровка') && text.includes('дачный дом')) return true;
    if (['кирпич', 'газобет', 'пеноблок', 'бетонный дом', 'брус', 'бревн'].some(word => text.includes(word))) return false;
    return text.includes('каркас');
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

/** Selects current-year approved/sent estimates and drafts no older than 90 days. */
export function selectEligibleHouseHistory(estimates: Estimate[], now = new Date()): Estimate[] {
    const yearStart = new Date(now.getFullYear(), 0, 1).getTime();
    const draftStart = now.getTime() - 90 * DAY_MS;
    return selectLatestVersions(estimates).filter(estimate => {
        if (estimate.isArchived || estimate.status === EstimateStatus.ARCHIVED || !estimate.items?.length || !isFrameHouse(estimate)) return false;
        const timestamp = dateOf(estimate);
        if (estimate.status === EstimateStatus.DRAFT) return timestamp >= draftStart && timestamp <= now.getTime();
        return (estimate.status === EstimateStatus.APPROVED || estimate.status === EstimateStatus.SENT)
            && timestamp >= yearStart && timestamp <= now.getTime();
    });
}

const isReference = (estimate: Estimate): boolean => {
    const client = normalize(estimate.client);
    const building = normalize(estimate.buildingType);
    return estimate.status === EstimateStatus.APPROVED
        && client.includes(REFERENCE_CLIENT)
        && building.includes(REFERENCE_BUILDING)
        && Math.abs(estimate.area - 79) <= 1;
};

export function chooseHouseReference(estimates: Estimate[], targetArea: number): Estimate | undefined {
    const explicit = estimates.find(isReference);
    if (explicit) return explicit;
    const approved = estimates.filter(item => item.status === EstimateStatus.APPROVED);
    const pool = approved.length ? approved : estimates;
    return [...pool].sort((a, b) => Math.abs(a.area - targetArea) - Math.abs(b.area - targetArea))[0];
}

type ItemKind = 'structure' | 'roof' | 'warm-shell' | 'addition' | 'rough-finish' | 'finish' | 'engineering' | 'logistics' | 'equipment';

const hasAny = (text: string, words: string[]): boolean => words.some(word => text.includes(word));

const itemKind = (item: EstimateItem): ItemKind => {
    const text = normalize(`${item.name} ${item.note || ''}`);
    if (item.category === EstimateCategory.LOGISTICS || item.subgroup === EstimateSubgroup.DELIVERY
        || hasAny(text, ['достав', 'разгруз', 'транспорт', 'логист'])) return 'logistics';
    if (hasAny(text, ['аренд', 'техник', 'манипулятор', 'кран', 'экскаватор', 'бурени'])) return 'equipment';
    if (item.category === EstimateCategory.ELECTRICAL
        || hasAny(text, ['электр', 'отоплен', 'водоснаб', 'канализ', 'септик', 'вентиляц', 'сантех', 'котельн'])) return 'engineering';
    if (hasAny(text, ['террас', 'веранд', 'крыльц', 'бесед', 'балкон', 'навес', 'гараж'])) return 'addition';
    if (hasAny(text, ['гипсокарт', 'гкл', 'предчист', 'черновая отделка', 'шпаклев', 'стяжк'])) return 'rough-finish';
    if (hasAny(text, ['чистовая', 'покраск', 'ламинат', 'плитк', 'обои', 'линолеум'])) return 'finish';
    if (item.category === EstimateCategory.WINDOWS
        || hasAny(text, ['окн', 'двер', 'утепл', 'пароизоляц', 'ветрозащит', 'мембран', 'герметизац'])) return 'warm-shell';
    if (item.category === EstimateCategory.ROOF || hasAny(text, ['кровл', 'кры', 'стропил'])) return 'roof';
    return 'structure';
};

const packageAllows = (kind: ItemKind, selected: HousePackage): boolean => {
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

const additionTypesIn = (item: EstimateItem): HouseAddition['type'][] => {
    const text = normalize(item.name);
    const types: HouseAddition['type'][] = [];
    if (text.includes('террас')) types.push('terrace');
    if (text.includes('веранд')) types.push('veranda');
    if (text.includes('крыльц') || text.includes('входн') && text.includes('групп')) types.push('porch');
    if (text.includes('бесед')) types.push('gazebo');
    if (text.includes('балкон')) types.push('balcony');
    if (text.includes('навес')) types.push('carport');
    if (text.includes('гараж')) types.push('garage');
    return types;
};

const additionFactor = (input: HouseCalculatorInput, source: Estimate, item: EstimateItem): number => {
    const itemTypes = additionTypesIn(item);
    const requestedTypes = itemTypes.length ? itemTypes : ['terrace'];
    const total = input.additions
        .filter(addition => requestedTypes.includes(addition.type))
        .reduce((sum, addition) => sum + Math.max(0, addition.area), 0);
    const sourceAdditionArea = source.items.reduce((largest, item) => {
        if (itemKind(item) !== 'addition') return largest;
        if (!additionTypesIn(item).some(type => requestedTypes.includes(type))) return largest;
        const unit = normalize(item.unit);
        return unit.includes('м2') || unit.includes('м²') ? Math.max(largest, item.quantity) : largest;
    }, 0);
    return total > 0 && sourceAdditionArea > 0 ? total / sourceAdditionArea : 0;
};

export function scaleReferenceItems(source: Estimate, input: HouseCalculatorInput): EstimateItem[] {
    const sourceArea = source.area > 0 ? source.area : input.area;
    const areaFactor = input.area / sourceArea;
    const floorFactor = Math.max(1, input.floors);
    const sourceWindows = Math.max(1, source.items.reduce((largest, item) => {
        const name = normalize(item.name);
        return name.includes('установка окон') ? Math.max(largest, item.quantity) : largest;
    }, 0) || Math.round(sourceArea / 10));
    const sourceDoors = Math.max(1, source.items.reduce((largest, item) => {
        const name = normalize(item.name);
        return name.includes('межкомнатн') && item.unit.toLocaleLowerCase('ru-RU').includes('шт')
            ? Math.max(largest, item.quantity) : largest;
    }, 0) || Math.round(sourceArea / 20));
    const targetInteriorDoors = input.interiorDoors ?? input.doors;
    const targetExteriorDoors = input.exteriorDoors ?? Math.max(0, input.doors - targetInteriorDoors);

    return source.items.flatMap((item, index) => {
        const kind = itemKind(item);
        if (!packageAllows(kind, input.package)) return [];
        let factor = areaFactor;
        if (kind === 'roof') factor *= roofFactor[input.roofShape];
        if (kind === 'warm-shell') {
            const text = normalize(item.name);
            if (text.includes('окн')) factor = input.windows / sourceWindows;
            else if (text.includes('межкомнатн')) factor = targetInteriorDoors / sourceDoors;
            else if (text.includes('входн') || text.includes('террасн')) factor = targetExteriorDoors;
            else if (text.includes('двер')) factor = input.doors / sourceDoors;
        }
        if (kind === 'addition') {
            const additions = additionFactor(input, source, item);
            if (additions <= 0) return [];
            factor = additions;
        }
        if (kind === 'logistics' || kind === 'equipment') factor = 1;
        if (kind === 'structure' && input.floors > 1) factor *= 1 + (floorFactor - 1) * 0.35;
        const quantity = money(Math.max(0, item.quantity) * Math.max(0, factor));
        const sourceTotal = Number.isFinite(item.total) ? Math.max(0, item.total) : Math.max(0, item.quantity * item.price);
        const total = money(sourceTotal * Math.max(0, factor));
        const price = quantity > 0 ? money(total / quantity) : Math.max(0, item.price);
        return [{ ...item, id: `house-${index}-${item.id}`, quantity, price, total }];
    });
}

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

export function calculateHouseEstimate(input: HouseCalculatorInput): HouseCalculatorResult {
    if (!(input.area > 0) || !(input.floors >= 1) || input.windows < 0 || input.doors < 0) {
        throw new Error('Площадь и этажность должны быть больше нуля, окна и двери — неотрицательными.');
    }
    validateRates(input.rates);
    const eligible = selectEligibleHouseHistory(input.estimates, input.now);
    const source = chooseHouseReference(eligible, input.area);
    if (!source) throw new Error('Нет подходящих исторических смет для расчёта каркасного дома.');

    const items = scaleReferenceItems(source, input);
    const warnings: string[] = [];
    const sourceKinds = new Set(source.items.map(itemKind));
    if ((input.package === 'rough-finish' || input.package === 'turnkey' || input.package === 'turnkey-engineering') && !sourceKinds.has('rough-finish')) {
        warnings.push('В эталонной смете нет подтверждённых позиций черновой отделки: они не включены в стоимость.');
    }
    if ((input.package === 'turnkey' || input.package === 'turnkey-engineering') && !sourceKinds.has('finish')) {
        warnings.push('В эталонной смете нет подтверждённых позиций чистовой отделки: они не включены в стоимость.');
    }
    if (input.package === 'turnkey-engineering' && !sourceKinds.has('engineering')) {
        warnings.push('В эталонной смете нет инженерных систем: инженерия не включена в стоимость.');
    }
    const sourceAdditionTypes = new Set(source.items.flatMap(additionTypesIn));
    for (const addition of input.additions) {
        if (!sourceAdditionTypes.has(addition.type)) {
            warnings.push(`В эталонной смете нет подтверждённых данных для объекта «${addition.type}»: его стоимость не включена.`);
        }
    }
    if (!isReference(source)) warnings.push('Эталон «Наталья_Дубровка, 79 м²» не найден; выбран ближайший подтверждённый аналог.');

    const financials = financialBreakdown(items, input.rates);
    const sections = [...new Set(items.map(item => item.category))].map(category => {
        const sectionItems = items.filter(item => item.category === category);
        return { category, total: money(sum(sectionItems)), items: sectionItems };
    });
    const approvedCount = eligible.filter(item => item.status === EstimateStatus.APPROVED).length;
    const sentCount = eligible.filter(item => item.status === EstimateStatus.SENT).length;
    const draftCount = eligible.filter(item => item.status === EstimateStatus.DRAFT).length;
    const confidence: HouseCalculatorResult['confidence'] = isReference(source) && approvedCount >= 3 && warnings.length === 0
        ? 'high' : isReference(source) && warnings.length === 0 ? 'medium' : approvedCount >= 3 && warnings.length <= 1 ? 'medium' : 'low';
    const spread = confidence === 'high' ? 0.1 : confidence === 'medium' ? 0.15 : 0.25;

    return {
        low: money(financials.final * (1 - spread)), base: financials.final, high: money(financials.final * (1 + spread)),
        confidence,
        evidence: {
            eligibleEstimateCount: eligible.length, approvedCount, sentCount, draftCount,
            referenceMatched: isReference(source),
            sourceReason: isReference(source) ? 'Явный подтверждённый эталон Наталья_Дубровка, 79 м².' : 'Ближайшая по площади подтверждённая смета.',
        },
        sections, items, warnings, sourceEstimate: source, rates: { ...input.rates }, financials,
    };
}
