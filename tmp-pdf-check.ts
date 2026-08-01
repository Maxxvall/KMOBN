import { generateCuttingPdf } from './services/cutting/exportPdf';
import { generateSheetRoomPdf } from './services/cutting/exportSheetRoomPdf';
import { optimizeCuttingPlan } from './services/cutting/optimizer';
import { CuttingItem, DEFAULT_CUTTING_SETTINGS } from './services/cutting/types';

const items: CuttingItem[] = [
    ['r1', 'Ростверк наружный', '45×195', 2950, 8, 'rostverk'],
    ['r2', 'Ростверк внутренний', '45×195', 1430, 6, 'rostverk'],
    ['f1', 'Черновой пол', '25×100', 1180, 18, 'subfloor'],
    ['j1', 'Лаги пола', '45×195', 2870, 12, 'joists'],
    ['j2', 'Бриджи для лаг пола', '45×195', 430, 24, 'joists'],
    ['w1', 'Стена передняя - стойки', '45×145', 2420, 14, 'walls'],
    ['w2', 'Стена задняя - стойки', '45×145', 2310, 14, 'walls'],
    ['w3', 'Бриджи стены передней', '45×145', 575, 18, 'walls'],
    ['w4', 'Проёмы стен', '45×145', 910, 10, 'walls'],
    ['roof1', 'Стропила кровли', '45×145', 3340, 12, 'roof'],
    ['roof2', 'Бриджи кровли', '45×145', 535, 20, 'roof'],
    ['ext1', 'Контробрешётка фасада', '25×50', 2480, 16, 'exterior'],
    ['other1', 'Закладные', '45×95', 780, 12, 'other'],
].map(([id, construction, section, length, quantity, stage], index) => ({
    id: String(id),
    sourceRow: index + 2,
    construction: String(construction),
    section: String(section),
    length: Number(length),
    quantity: Number(quantity),
    isSheet: false,
    stage: stage as CuttingItem['stage'],
}));

const settings = { ...DEFAULT_CUTTING_SETTINGS, separateStages: false };
const plan = optimizeCuttingPlan(items, settings);

document.querySelector('#board')?.addEventListener('click', () => {
    void generateCuttingPdf({ fileName: 'Хозблок - контрольный расчёт.csv', items, plan, settings });
});

document.querySelector('#sheet')?.addEventListener('click', () => {
    void generateSheetRoomPdf([
        { id: 'room-1', name: 'Черновой пол', material: 'plywood', length: 6050, width: 4250 },
        { id: 'room-2', name: 'Стены хозблока', material: 'osb', length: 7800, width: 2700 },
    ]);
});
