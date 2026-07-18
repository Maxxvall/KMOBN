export enum EstimateCategory {
    FOUNDATION = 'ФУНДАМЕНТ',
    GRILLAGE = 'РОСТВЕРК, ЛАГИ, ПОЛЫ',
    WALLS = 'СТЕНЫ',
    ROOF = 'КРОВЛЯ/ПОТОЛОК',
    WINDOWS = 'ОКНА/ДВЕРИ',
    ELECTRICAL = 'ЭЛЕКТРИКА',
    LOGISTICS = 'ЛОГИСТИКА',
    GENERAL = 'ОБЩАЯ',
    DEMOLITION = 'ДЕМОНТАЖ',
}

export interface EstimateItem {
    id: string;
    name: string;
    unit: string;
    quantity: number;
    price: number;
    total: number;
    category: EstimateCategory;
    // Подгруппа внутри раздела: работы или материалы
    subgroup?: EstimateSubgroup;
    note?: string;
    actual?: EstimateItemActual;
    isActualOnly?: boolean;
    catalogWorkId?: string;
}

export type ToolQuantityMode = 'crew' | 'person';

export interface WorkToolRequirement {
    name: string;
    key?: string;
    quantity: number;
    quantityMode: ToolQuantityMode;
    note?: string;
}

export interface CrewToolRequirement extends WorkToolRequirement {
    toolKey: string;
    source: 'work' | 'manual' | 'ai';
    catalogWorkId?: string;
    estimateItemId?: string;
}

export interface CrewToolPlan {
    crewSize: number;
    requirements: CrewToolRequirement[];
    quantityOverrides?: Record<string, number>;
}

export interface EstimateItemActual {
    unit?: string;
    quantity?: number | null;
    price?: number | null;
    total?: number;
    note?: string;
    updatedAt?: string;
}

export interface Estimate {
    id: string;
    parentId?: string;
    estimateNumber: string;
    client: string;
    date: string;
    status: EstimateStatus;
    version: number;
    items: EstimateItem[];
    total: number;
    isArchived?: boolean;
    buildingType: string;
    area: number;
    needsPriceUpdate?: boolean;
    selectedSections?: EstimateCategory[];
    sortOrder?: number;
    created_at?: string | null;
    updated_at?: string | null;
    crewToolPlan?: CrewToolPlan;
}

export enum EstimateStatus {
    DRAFT = 'Черновик',
    SENT = 'Отправлена',
    APPROVED = 'Согласована',
}

export enum View {
    HISTORY,
    EDITOR,
    PRICES,
    WORKS,
    BUNDLES,
    SALARY_CALCULATOR,
    HOUSE_CALCULATOR,
    ANALYTICS,
    SUBSCRIPTIONS,
    CUTTING,
    WIKI,
}

export type SubscriptionTier = 'free' | 'basic' | 'premium';

export type SubscriptionStatus = 'active' | 'expired' | 'cancelled';

export type SubscriptionFeatures = {
    analytics: boolean;
    salaryCalculator: boolean;
    wiki: boolean;
};

export interface SubscriptionLimits {
    estimates: {
        max: number | null;
        canDelete: boolean;
        deletePerMonth?: number | null;
    };
    materials: {
        max: number | null;
    };
    works: {
        max: number | null;
    };
    bundles: {
        max: number | null;
    };
    aiRequestsPerDay: number | null;
    features: SubscriptionFeatures;
}

export interface SubscriptionUsage {
    estimatesCreated: number;
    estimatesDeletedThisMonth: number;
    materialsCreated: number;
    worksCreated: number;
    bundlesCreated: number;
    aiRequestsToday: number;
}

export interface UserSubscription {
    id: string;
    user_id: string;
    subscription_tier: SubscriptionTier;
    status: SubscriptionStatus;
    started_at: string;
    expires_at: string | null;
    last_payment_id?: string | null;
    last_payment_amount?: number | null;
    last_payment_currency?: string | null;
    last_payment_date?: string | null;
    estimates_created?: number | null;
    estimates_deleted_this_month?: number | null;
    materials_created?: number | null;
    works_created?: number | null;
    bundles_created?: number | null;
    ai_requests_today?: number | null;
    last_ai_request_date?: string | null;
    limits_reset_date?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
}

export interface ProjectTemplate {
    id: string;
    name: string;
    baseArea: number;
    items?: EstimateItem[]; // Элементы сметы из шаблона
    sortOrder?: number;
    created_at?: string | null;
    updated_at?: string | null;
}

export enum EstimateSubgroup {
    WORKS = 'Работы',
    MATERIALS = 'Материалы',
    DELIVERY = 'Доставка',
}

export type MaterialSearchSource =
    | 'JUKOV_LES'
    | 'PETROVICH'
    | 'LEMANO_PRO'
    | 'VSEINSTRUMENTI'
    | 'GRANDLINE';

export interface Material {
    id: string;
    name: string;
    price: number;
    lastUpdated: string;
    category: EstimateCategory;
    isManualPrice?: boolean;
    link?: string;
    sortOrder?: number;
    created_at?: string | null;
    updated_at?: string | null;
}

export interface Work {
    id: string;
    name: string;
    price: number;
    category: EstimateCategory;
    sortOrder?: number;
    created_at?: string | null;
    updated_at?: string | null;
    toolRequirements?: WorkToolRequirement[];
}

export interface WorkBundle {
    id: string;
    name: string;
    mainWorkId?: string; // ID основной работы, если есть
    items: EstimateItem[]; // Работы и материалы в комплекте
    category: EstimateCategory; // Категория блока, куда добавлять
    sortOrder?: number;
    created_at?: string | null;
    updated_at?: string | null;
}

export interface WikiCategory {
    id: string;
    name: string;
    icon: string;
    description: string;
}

export interface WikiSubcategory {
    id: string;
    categoryId: string;
    name: string;
    icon: string;
    description: string;
}

export interface WikiArticle {
    id: string;
    categoryId: string;
    subcategoryId: string;
    title: string;
    content: string;
    tags: string[];
}

export interface GenerationParams {
    area: number;
    projectTemplateId: string;
    region: string;
}

// Salary Calculator Types
export type SalaryMode = 'percent' | 'rate';

export interface Worker {
    id: string;
    name: string;
    ratePerHour?: number;
    ratePerDay?: number;
    rateType?: 'hour' | 'day';
}

export interface WorkAllocation {
    workItemId: string;
    workItemName: string;
    workItemTotal: number;
    allocations: { [workerId: string]: number };
    hours?: { [workerId: string]: number };
}

export interface SalaryCalculation {
    id: string;
    estimateId: string;
    estimateNumber: string;
    workers: Worker[];
    workAllocations: WorkAllocation[];
    createdDate: string;
    mode?: SalaryMode;
}

export const normalizeKey = (s: unknown): string => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

export const safeNumber = (v: unknown, fallback = 0): number => {
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : fallback;
};

export const ESTIMATE_CATEGORIES: EstimateCategory[] = [
    EstimateCategory.FOUNDATION,
    EstimateCategory.GRILLAGE,
    EstimateCategory.WALLS,
    EstimateCategory.ROOF,
    EstimateCategory.DEMOLITION,
    EstimateCategory.WINDOWS,
    EstimateCategory.ELECTRICAL,
    EstimateCategory.LOGISTICS,
];

export interface DuplicateGroup<T extends { id: string; name: string; price: number }> {
    normalizedKey: string;
    displayName: string;
    items: T[];
}

export function findDuplicates<T extends { id: string; name: string; price: number }>(
    items: T[]
): DuplicateGroup<T>[] {
    const map = new Map<string, T[]>();
    for (const item of items) {
        const key = normalizeKey(item.name);
        const group = map.get(key);
        if (group) {
            group.push(item);
        } else {
            map.set(key, [item]);
        }
    }
    const result: DuplicateGroup<T>[] = [];
    for (const [key, group] of map) {
        if (group.length > 1) {
            result.push({ normalizedKey: key, displayName: group[0].name, items: group });
        }
    }
    return result;
}

export interface SmartWizardParams {
    buildingType: string;
    area: number;
    floors: number;
    foundation: string;
    roof: string;
    insulation: string;
    windowsDoors: string;
    region: string;
    finishLevel: string;
}

export interface AutoAddedSummary {
    category: EstimateCategory;
    count: number;
    description: string;
}

export interface SmartWizardWarning {
    type: 'missing_data' | 'unusual_params' | 'low_confidence';
    message: string;
}

export interface SmartWizardResult {
    items: EstimateItem[];
    autoAddedCount: number;
    needsReviewCount: number;
    autoSummary: AutoAddedSummary[];
    warnings: SmartWizardWarning[];
}
