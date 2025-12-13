import { Estimate, EstimateStatus, ProjectTemplate, EstimateCategory, EstimateSubgroup } from './types';

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
    { id: '1', name: 'Дом 6х8 м', baseArea: 48 },
    { id: '2', name: 'Дом 6х9 м', baseArea: 54 },
    { id: '3', name: 'Дом 8х10 м', baseArea: 80 },
    { id: '4', name: 'Баня 4x6 м', baseArea: 24 },
];

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

export const MOCK_ESTIMATES: Estimate[] = [
    {
        id: 'sm-2024-001-v2',
        parentId: 'sm-2024-001-v1',
        estimateNumber: 'SM-2024-001',
        client: 'Иванов А.С.',
        date: '2024-05-18',
        status: EstimateStatus.APPROVED,
        version: 2,
        items: [
            { id: '1', name: 'Монтаж силового каркаса', unit: 'м²', quantity: 120, price: 1500, total: 180000, category: EstimateCategory.WALLS, subgroup: EstimateSubgroup.WORKS },
            { id: '2', name: 'Засыпка пескобетона', unit: 'м³', quantity: 8, price: 8500, total: 68000, category: EstimateCategory.FOUNDATION, subgroup: EstimateSubgroup.WORKS },
            { id: '3', name: 'Монтаж кровли', unit: 'м²', quantity: 90, price: 1200, total: 108000, category: EstimateCategory.ROOF, subgroup: EstimateSubgroup.WORKS },
            { id: '4', name: 'Работы по террасе', unit: 'компл.', quantity: 1, price: 150000, total: 150000, category: EstimateCategory.GRILLAGE, subgroup: EstimateSubgroup.WORKS },
        ],
        total: 506000,
        buildingType: 'Дом',
        area: 120,
    },
    {
        id: 'sm-2024-001-v1',
        estimateNumber: 'SM-2024-001',
        client: 'Иванов А.С.',
        date: '2024-05-15',
        status: EstimateStatus.ARCHIVED,
        version: 1,
        items: [
            { id: '1', name: 'Монтаж силового каркаса', unit: 'м²', quantity: 120, price: 1500, total: 180000, category: EstimateCategory.WALLS, subgroup: EstimateSubgroup.WORKS },
            { id: '2', name: 'Засыпка пескобетона', unit: 'м³', quantity: 8, price: 8500, total: 68000, category: EstimateCategory.FOUNDATION, subgroup: EstimateSubgroup.WORKS },
            { id: '3', name: 'Монтаж кровли', unit: 'м²', quantity: 90, price: 1200, total: 108000, category: EstimateCategory.ROOF, subgroup: EstimateSubgroup.WORKS },
        ],
        total: 356000,
        isArchived: true,
        buildingType: 'Дом',
        area: 120,
    },
    {
        id: 'sm-2024-002-v1',
        estimateNumber: 'SM-2024-002',
        client: 'Петров В.В.',
        date: '2024-06-01',
        status: EstimateStatus.SENT,
        version: 1,
        items: [
            { id: '1', name: 'Разработка грунта', unit: 'м³', quantity: 25, price: 500, total: 12500, category: EstimateCategory.FOUNDATION, subgroup: EstimateSubgroup.WORKS },
            { id: '2', name: 'Устройство фундамента', unit: 'м³', quantity: 15, price: 10000, total: 150000, category: EstimateCategory.FOUNDATION, subgroup: EstimateSubgroup.WORKS },
        ],
        total: 162500,
        buildingType: 'Хоз.блок',
        area: 50,
    },
    {
        id: 'sm-2024-003-v1',
        estimateNumber: 'SM-2024-003',
        client: 'Сидоров Н.П.',
        date: '2024-06-10',
        status: EstimateStatus.DRAFT,
        version: 1,
        items: [],
        total: 0,
        buildingType: 'Беседка',
        area: 20,
    },
];