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
    sortOrder?: number;
    created_at?: string | null;
    updated_at?: string | null;
}

export enum EstimateStatus {
    DRAFT = 'Черновик',
    SENT = 'Отправлена',
    APPROVED = 'Согласована',
    ARCHIVED = 'В архиве',
}

export enum View {
    HISTORY,
    EDITOR,
    PRICES,
    WORKS,
    BUNDLES,
    SALARY_CALCULATOR,
    ANALYTICS,
    SUBSCRIPTIONS,
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
export interface Worker {
    id: string;
    name: string;
}

export interface WorkAllocation {
    workItemId: string; // ID позиции работы из EstimateItem
    workItemName: string;
    workItemTotal: number; // Стоимость работы
    allocations: { [workerId: string]: number }; // workerId -> процент выполнения (0-100)
}

export interface SalaryCalculation {
    id: string;
    estimateId: string;
    estimateNumber: string;
    workers: Worker[];
    workAllocations: WorkAllocation[];
    createdDate: string;
}
