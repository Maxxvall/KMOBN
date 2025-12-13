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
}

export interface ProjectTemplate {
    id: string;
    name: string;
    baseArea: number;
    items?: EstimateItem[]; // Элементы сметы из шаблона
}

export enum EstimateSubgroup {
    WORKS = 'Работы',
    MATERIALS = 'Материалы',
}

export interface Material {
    id: string;
    name: string;
    price: number;
    lastUpdated: string;
    category: EstimateCategory;
    isManualPrice?: boolean;
}

export interface Work {
    id: string;
    name: string;
    price: number;
    category: EstimateCategory;
}

export interface WorkBundle {
    id: string;
    name: string;
    mainWorkId?: string; // ID основной работы, если есть
    items: EstimateItem[]; // Работы и материалы в комплекте
    category: EstimateCategory; // Категория блока, куда добавлять
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
