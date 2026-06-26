import React, { useState, useMemo, useCallback } from 'react';
import {
    Estimate,
    EstimateCategory,
    EstimateStatus,
    Material,
    SmartWizardParams,
    SmartWizardResult,
    Work,
} from '../types';
import { generateEstimateNumber } from '../services/estimateNumber';
import { buildSmartEstimate, WIZARD_OPTIONS } from '../services/smartEstimateBuilder';

interface SmartEstimateWizardProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (estimate: Estimate) => void;
    estimates: Estimate[];
    materials: Material[];
    works: Work[];
    existingEstimateNumbers: string[];
}

type Step = 1 | 2 | 3 | 4 | 5;

const STEP_TITLES: Record<Step, string> = {
    1: 'Тип и размеры',
    2: 'Конструктив',
    3: 'Отделка и окна',
    4: 'Регион и клиент',
    5: 'Результат',
};

const STEP_ICONS: Record<Step, string> = {
    1: '📐',
    2: '🏗',
    3: '🪟',
    4: '📍',
    5: '✅',
};

const SelectGroup: React.FC<{
    label: string;
    options: string[];
    value: string;
    onChange: (v: string) => void;
}> = ({ label, options, value, onChange }) => (
    <div className="mb-4">
        <label className="block text-sm font-semibold text-text-secondary mb-2">{label}</label>
        <div className="flex flex-wrap gap-2">
            {options.map(opt => (
                <button
                    key={opt}
                    type="button"
                    onClick={() => onChange(opt)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium border transition ${
                        value === opt
                            ? 'bg-primary text-white border-primary'
                            : 'bg-background border-border text-text-primary hover:border-primary'
                    }`}
                >
                    {opt}
                </button>
            ))}
        </div>
    </div>
);

const NumberInput: React.FC<{
    label: string;
    value: number;
    onChange: (v: number) => void;
    min?: number;
    max?: number;
    unit?: string;
}> = ({ label, value, onChange, min = 0, max, unit }) => (
    <div className="mb-4">
        <label className="block text-sm font-semibold text-text-secondary mb-2">{label}</label>
        <div className="flex items-center gap-2">
            <input
                type="number"
                value={value}
                onChange={e => onChange(Number(e.target.value) || 0)}
                min={min}
                max={max}
                className="flex-1 p-2 bg-background border border-border rounded-md text-text-primary focus:ring-primary focus:border-primary"
            />
            {unit && <span className="text-sm text-text-secondary">{unit}</span>}
        </div>
    </div>
);

const TextInput: React.FC<{
    label: string;
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
}> = ({ label, value, onChange, placeholder }) => (
    <div className="mb-4">
        <label className="block text-sm font-semibold text-text-secondary mb-2">{label}</label>
        <input
            type="text"
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            className="w-full p-2 bg-background border border-border rounded-md text-text-primary focus:ring-primary focus:border-primary"
        />
    </div>
);

const SmartEstimateWizard: React.FC<SmartEstimateWizardProps> = ({
    isOpen,
    onClose,
    onConfirm,
    estimates,
    materials,
    works,
    existingEstimateNumbers,
}) => {
    const [step, setStep] = useState<Step>(1);
    const [clientName, setClientName] = useState('');
    const [buildingType, setBuildingType] = useState(WIZARD_OPTIONS.buildingTypes[0]);
    const [area, setArea] = useState(120);
    const [floors, setFloors] = useState(1);
    const [foundation, setFoundation] = useState(WIZARD_OPTIONS.foundations[0]);
    const [roof, setRoof] = useState(WIZARD_OPTIONS.roofs[0]);
    const [insulation, setInsulation] = useState(WIZARD_OPTIONS.insulations[0]);
    const [windowsDoors, setWindowsDoors] = useState(WIZARD_OPTIONS.windowsDoors[0]);
    const [region, setRegion] = useState('');
    const [finishLevel, setFinishLevel] = useState(WIZARD_OPTIONS.finishLevels[0]);

    const params: SmartWizardParams = useMemo(() => ({
        buildingType,
        area,
        floors,
        foundation,
        roof,
        insulation,
        windowsDoors,
        region,
        finishLevel,
    }), [buildingType, area, floors, foundation, roof, insulation, windowsDoors, region, finishLevel]);

    const result: SmartWizardResult = useMemo(() => {
        return buildSmartEstimate(params, estimates, materials, works);
    }, [params, estimates, materials, works]);

    const handleConfirm = useCallback(() => {
        const total = result.items.reduce((sum, item) => sum + item.quantity * item.price, 0);
        const estimate: Estimate = {
            id: `sm-id-${Date.now()}`,
            estimateNumber: generateEstimateNumber(existingEstimateNumbers, new Date()),
            client: clientName,
            date: new Date().toISOString().split('T')[0],
            status: EstimateStatus.DRAFT,
            version: 1,
            items: result.items,
            total,
            buildingType,
            area,
            needsPriceUpdate: false,
            sortOrder: Date.now(),
        };
        onConfirm(estimate);
    }, [result, clientName, buildingType, area, existingEstimateNumbers, onConfirm]);

    const canProceed = useMemo(() => {
        switch (step) {
            case 1: return area > 0;
            case 2: return true;
            case 3: return true;
            case 4: return true;
            case 5: return result.items.length > 0;
            default: return true;
        }
    }, [step, area, result]);

    if (!isOpen) return null;

    const renderStep1 = () => (
        <div>
            <SelectGroup
                label="Тип строения"
                options={WIZARD_OPTIONS.buildingTypes}
                value={buildingType}
                onChange={setBuildingType}
            />
            <NumberInput
                label="Площадь"
                value={area}
                onChange={setArea}
                min={5}
                unit="м²"
            />
            <div className="mb-4">
                <label className="block text-sm font-semibold text-text-secondary mb-2">Этажность</label>
                <div className="flex gap-2">
                    {[1, 2, 3].map(f => (
                        <button
                            key={f}
                            type="button"
                            onClick={() => setFloors(f)}
                            className={`px-4 py-2 rounded-md text-sm font-medium border transition ${
                                floors === f
                                    ? 'bg-primary text-white border-primary'
                                    : 'bg-background border-border text-text-primary hover:border-primary'
                            }`}
                        >
                            {f}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );

    const renderStep2 = () => (
        <div>
            <SelectGroup
                label="Фундамент"
                options={WIZARD_OPTIONS.foundations}
                value={foundation}
                onChange={setFoundation}
            />
            <SelectGroup
                label="Кровля"
                options={WIZARD_OPTIONS.roofs}
                value={roof}
                onChange={setRoof}
            />
            <SelectGroup
                label="Утепление"
                options={WIZARD_OPTIONS.insulations}
                value={insulation}
                onChange={setInsulation}
            />
        </div>
    );

    const renderStep3 = () => (
        <div>
            <SelectGroup
                label="Окна и двери"
                options={WIZARD_OPTIONS.windowsDoors}
                value={windowsDoors}
                onChange={setWindowsDoors}
            />
            <SelectGroup
                label="Уровень отделки"
                options={WIZARD_OPTIONS.finishLevels}
                value={finishLevel}
                onChange={setFinishLevel}
            />
        </div>
    );

    const renderStep4 = () => (
        <div>
            <TextInput
                label="Регион (опционально)"
                value={region}
                onChange={setRegion}
                placeholder="Например: Москва, МО"
            />
            <TextInput
                label="Имя клиента"
                value={clientName}
                onChange={setClientName}
                placeholder="Введите имя клиента"
            />
        </div>
    );

    const categoryLabels: Record<EstimateCategory, string> = {
        [EstimateCategory.FOUNDATION]: 'Фундамент',
        [EstimateCategory.GRILLAGE]: 'Ростверк, лаги, полы',
        [EstimateCategory.WALLS]: 'Стены',
        [EstimateCategory.ROOF]: 'Кровля',
        [EstimateCategory.WINDOWS]: 'Окна/двери',
        [EstimateCategory.ELECTRICAL]: 'Электрика',
        [EstimateCategory.LOGISTICS]: 'Логистика',
        [EstimateCategory.GENERAL]: 'Общая',
        [EstimateCategory.DEMOLITION]: 'Демонтаж',
    };

    const renderStep5 = () => {
        const groupedItems = new Map<EstimateCategory, typeof result.items>();
        for (const item of result.items) {
            const list = groupedItems.get(item.category) || [];
            list.push(item);
            groupedItems.set(item.category, list);
        }

        return (
            <div>
                {result.warnings.length > 0 && (
                    <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                        <div className="text-sm font-semibold text-amber-400 mb-1">Предупреждения</div>
                        {result.warnings.map((w, i) => (
                            <div key={i} className="text-xs text-amber-300">• {w.message}</div>
                        ))}
                    </div>
                )}

                <div className="mb-4 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                    <div className="text-sm font-semibold text-green-400 mb-1">
                        Добавлено автоматически: {result.autoAddedCount} позиций
                    </div>
                    {result.autoSummary.map((s, i) => (
                        <div key={i} className="text-xs text-green-300">
                            • {s.description}: {s.count} поз.
                        </div>
                    ))}
                </div>

                {result.needsReviewCount > 0 && (
                    <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                        <div className="text-sm font-semibold text-yellow-400">
                            Требует проверки: {result.needsReviewCount} позиций
                        </div>
                        <div className="text-xs text-yellow-300">
                            Эти позиции добавлены с низкой уверенностью — проверьте количества и цены.
                        </div>
                    </div>
                )}

                <div className="max-h-60 overflow-y-auto border border-border rounded-lg">
                    {Array.from(groupedItems.entries()).map(([category, items]) => (
                        <div key={category}>
                            <div className="px-3 py-1.5 bg-background/80 text-xs font-semibold text-text-secondary border-b border-border">
                                {categoryLabels[category] || category}
                            </div>
                            {items.map(item => (
                                <div key={item.id} className="flex items-center justify-between px-3 py-1.5 text-xs border-b border-border/50 last:border-b-0">
                                    <span className="text-text-primary truncate flex-1">{item.name}</span>
                                    <span className="text-text-secondary ml-2 shrink-0">
                                        {item.quantity} {item.unit}
                                    </span>
                                    <span className="text-text-secondary ml-2 shrink-0 w-20 text-right">
                                        {item.price > 0 ? `${item.price.toLocaleString('ru-RU')} ₽` : '—'}
                                    </span>
                                </div>
                            ))}
                        </div>
                    ))}
                </div>

                <div className="mt-3 text-right text-sm font-semibold text-text-primary">
                    Итого: {result.items.reduce((sum, item) => sum + item.quantity * item.price, 0).toLocaleString('ru-RU')} ₽
                </div>
            </div>
        );
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
            <div className="bg-surface p-6 rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold text-text-primary">Умный мастер смет</h2>
                    <button onClick={onClose} className="text-text-secondary hover:text-text-primary text-2xl leading-none">&times;</button>
                </div>

                <div className="flex items-center gap-1 mb-6">
                    {([1, 2, 3, 4, 5] as Step[]).map(s => (
                        <div key={s} className="flex items-center flex-1">
                            <div
                                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition ${
                                    s === step
                                        ? 'bg-primary text-white'
                                        : s < step
                                        ? 'bg-green-600 text-white'
                                        : 'bg-background text-text-secondary border border-border'
                                }`}
                            >
                                {s < step ? '✓' : STEP_ICONS[s]}
                            </div>
                            {s < 5 && (
                                <div className={`flex-1 h-0.5 mx-1 ${s < step ? 'bg-green-600' : 'bg-border'}`} />
                            )}
                        </div>
                    ))}
                </div>

                <div className="text-sm font-semibold text-text-secondary mb-4">
                    Шаг {step}/5: {STEP_TITLES[step]}
                </div>

                <div className="min-h-[200px]">
                    {step === 1 && renderStep1()}
                    {step === 2 && renderStep2()}
                    {step === 3 && renderStep3()}
                    {step === 4 && renderStep4()}
                    {step === 5 && renderStep5()}
                </div>

                <div className="flex gap-3 mt-6">
                    {step > 1 && (
                        <button
                            onClick={() => setStep((step - 1) as Step)}
                            className="flex-1 py-2 px-4 border border-border rounded-md text-text-primary hover:bg-background transition font-medium"
                        >
                            Назад
                        </button>
                    )}
                    {step < 5 ? (
                        <button
                            onClick={() => setStep((step + 1) as Step)}
                            disabled={!canProceed}
                            className="flex-1 py-2 px-4 bg-primary hover:bg-primary-hover disabled:opacity-50 text-white font-bold rounded-md transition"
                        >
                            Далее
                        </button>
                    ) : (
                        <button
                            onClick={handleConfirm}
                            disabled={!canProceed}
                            className="flex-1 py-2 px-4 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 disabled:opacity-50 text-white font-bold rounded-md transition"
                        >
                            Создать смету
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SmartEstimateWizard;
