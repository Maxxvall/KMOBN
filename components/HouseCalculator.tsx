import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Estimate, EstimateCategory, EstimateItem, EstimateStatus, EstimateSubgroup, Material, Work } from '../types';
import {
    calculateHouseEstimate,
    HouseCalculatorInput,
    HouseCalculatorResult,
    HousePackage,
    RoofShape,
} from '../services/houseCalculator';

interface HouseCalculatorProps {
    estimates: Estimate[];
    materials: Material[];
    works: Work[];
    onCreateEstimate: (estimate: Estimate) => void;
}

type AdditionType = HouseCalculatorInput['additions'][number]['type'];

const roofOptions: { value: RoofShape; label: string }[] = [
    { value: 'single-slope', label: 'Односкатная' },
    { value: 'gable', label: 'Двускатная' },
    { value: 'hip', label: 'Вальмовая' },
    { value: 'flat', label: 'Плоская' },
    { value: 'mansard', label: 'Мансардная' },
];

const packageOptions: { value: HousePackage; label: string; description: string }[] = [
    { value: 'box', label: 'Коробка', description: 'Фундамент, каркас и крыша' },
    { value: 'warm-shell', label: 'Тёплый контур', description: 'Закрытый утеплённый дом' },
    { value: 'rough-finish', label: 'Черновая отделка', description: 'Подготовка под чистовые работы' },
    { value: 'turnkey', label: 'Под ключ', description: 'Дом с чистовой отделкой' },
    { value: 'turnkey-engineering', label: 'Под ключ + инженерия', description: 'Сети, отопление и электрика' },
];

const additions: { type: AdditionType; label: string }[] = [
    { type: 'terrace', label: 'Терраса' },
    { type: 'gazebo', label: 'Беседка' },
    { type: 'porch', label: 'Входная группа' },
];

const money = (value: number) => `${(Object.is(Math.round(value), -0) ? 0 : Math.round(value)).toLocaleString('ru-RU')} ₽`;
const inputClass = 'min-h-[44px] w-full rounded-lg border border-border bg-background px-3 text-text-primary outline-none transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30';
const buttonFocus = 'outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background';

const Stepper: React.FC<{ label: string; value: number; min?: number; max?: number; onChange: (value: number) => void }> = ({
    label, value, min = 0, max = 30, onChange,
}) => (
    <div>
        <span className="mb-2 block text-sm font-medium text-text-secondary">{label}</span>
        <div className="grid grid-cols-[44px_1fr_44px] overflow-hidden rounded-lg border border-border bg-background">
            <button type="button" aria-label={`Уменьшить: ${label}`} disabled={value <= min} onClick={() => onChange(value - 1)} className={`min-h-[44px] text-xl text-text-primary hover:bg-white/5 disabled:opacity-30 ${buttonFocus}`}>−</button>
            <output className="flex min-h-[44px] items-center justify-center border-x border-border font-semibold">{value}</output>
            <button type="button" aria-label={`Увеличить: ${label}`} disabled={value >= max} onClick={() => onChange(value + 1)} className={`min-h-[44px] text-xl text-text-primary hover:bg-white/5 disabled:opacity-30 ${buttonFocus}`}>+</button>
        </div>
    </div>
);

const Choice: React.FC<{ active: boolean; label: string; onClick: () => void }> = ({ active, label, onClick }) => (
    <button type="button" onClick={onClick} className={`min-h-[44px] rounded-lg border px-3 py-2 text-sm font-medium transition ${buttonFocus} ${active ? 'border-primary bg-primary text-white' : 'border-border bg-background text-text-primary hover:border-gray-500'}`}>
        {label}
    </button>
);

const HouseCalculator: React.FC<HouseCalculatorProps> = ({ estimates, materials, works, onCreateEstimate }) => {
    // Catalogs are part of the shared screen contract; prices in this MVP come only from historical estimates.
    void materials;
    void works;

    const [area, setArea] = useState(79);
    const [floors, setFloors] = useState(1);
    const [windows, setWindows] = useState(6);
    const [externalDoors, setExternalDoors] = useState(0);
    const [interiorDoors, setInteriorDoors] = useState(3);
    const [roofShape, setRoofShape] = useState<RoofShape>('gable');
    const [selectedPackage, setSelectedPackage] = useState<HousePackage>('warm-shell');
    const [additionAreas, setAdditionAreas] = useState<Record<AdditionType, number>>({ terrace: 19, veranda: 0, porch: 0, gazebo: 0, balcony: 0, carport: 0, garage: 0 });
    const [rates, setRates] = useState({ overheadPercent: 0, marginPercent: 0, reservePercent: 0, taxPercent: 0, discountPercent: 0 });
    const [result, setResult] = useState<HouseCalculatorResult | null>(null);
    const [error, setError] = useState('');
    const [isCalculating, setIsCalculating] = useState(true);

    const calculationInput = useMemo<HouseCalculatorInput>(() => ({
        estimates,
        area,
        floors,
        windows,
        doors: externalDoors + interiorDoors,
        exteriorDoors,
        interiorDoors,
        roofShape,
        package: selectedPackage,
        additions: additions
            .map(({ type }) => ({ type, area: additionAreas[type] }))
            .filter(item => item.area > 0),
        rates,
    }), [estimates, area, floors, windows, externalDoors, interiorDoors, roofShape, selectedPackage, additionAreas, rates]);

    const runCalculation = useCallback(() => {
        setIsCalculating(true);
        setError('');
        try {
            setResult(calculateHouseEstimate(calculationInput));
        } catch (reason) {
            setResult(null);
            setError(reason instanceof Error ? reason.message : 'Не удалось выполнить расчёт.');
        } finally {
            setIsCalculating(false);
        }
    }, [calculationInput]);

    useEffect(() => { runCalculation(); }, [runCalculation]);

    const setRate = (key: keyof typeof rates, value: number) => {
        setRates(current => ({ ...current, [key]: Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0)) }));
    };

    const createDraft = () => {
        if (!result) return;
        const timestamp = Date.now();
        const financialRows: Array<[string, number]> = [
            ['Накладные расходы', result.financials.overhead],
            ['Наценка компании', result.financials.margin],
            ['Резерв на отклонения', result.financials.reserve],
        ];
        const financialItems: EstimateItem[] = financialRows
            .filter(([, value]) => value > 0)
            .map(([name, value], index) => ({
                id: `house-finance-${timestamp}-${index}`,
                name,
                unit: 'комплект',
                quantity: 1,
                price: value,
                total: value,
                category: EstimateCategory.GENERAL,
                subgroup: EstimateSubgroup.WORKS,
                note: 'Финансовая строка предварительного расчёта дома',
            }));
        const preDiscountItems = [...result.items, ...financialItems];
        const preDiscountTotal = preDiscountItems.reduce((sum, item) => sum + item.total, 0);
        const discountFactor = preDiscountTotal > 0
            ? Math.max(0, (preDiscountTotal - result.financials.discount) / preDiscountTotal)
            : 1;
        const discountedItems = preDiscountItems.map(item => ({
            ...item,
            price: Math.round(item.price * discountFactor * 100) / 100,
            total: Math.round(item.total * discountFactor * 100) / 100,
            note: result.financials.discount > 0
                ? `${item.note ? `${item.note}. ` : ''}Скидка распределена по строкам предварительного расчёта`
                : item.note,
        }));
        const taxItem: EstimateItem[] = result.financials.tax > 0 ? [{
            id: `house-finance-${timestamp}-tax`,
            name: 'Налог',
            unit: 'комплект',
            quantity: 1,
            price: result.financials.tax,
            total: result.financials.tax,
            category: EstimateCategory.GENERAL,
            subgroup: EstimateSubgroup.WORKS,
            note: 'Финансовая строка предварительного расчёта дома',
        }] : [];
        onCreateEstimate({
            id: `house-${timestamp}`,
            estimateNumber: `ДОМ-${timestamp}`,
            client: '',
            date: new Date().toISOString().slice(0, 10),
            status: EstimateStatus.DRAFT,
            version: 1,
            items: [...discountedItems, ...taxItem],
            total: result.base,
            buildingType: 'Каркасный дом',
            area,
            needsPriceUpdate: false,
            sortOrder: timestamp,
        });
    };

    const confidence = result?.confidence === 'high' ? 'Высокая' : result?.confidence === 'medium' ? 'Средняя' : 'Низкая';

    return (
        <section className="mx-auto w-full max-w-[1500px] px-3 py-4 sm:px-5 lg:px-8 lg:py-7">
            <header className="mb-6 border-b border-border pb-5">
                <p className="mb-1 text-xs font-bold uppercase tracking-[0.18em] text-primary">Каркасное домостроение</p>
                <h1 className="text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">Калькулятор стоимости дома</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-text-secondary">Предварительная оценка по актуальным сметам общей базы: подтверждённые за текущий год и свежие черновики за 90 дней.</p>
            </header>

            <div className="grid items-start gap-7 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.75fr)]">
                <div className="min-w-0 space-y-8">
                    <fieldset>
                        <legend className="mb-4 text-lg font-bold">1. Размер и конструкция</legend>
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            <div className="sm:col-span-2 lg:col-span-3">
                                <div className="mb-2 flex items-end justify-between gap-4">
                                    <label htmlFor="house-area" className="text-sm font-medium text-text-secondary">Общая площадь по смете</label>
                                    <div className="flex items-center gap-2"><input id="house-area-number" aria-label="Площадь числом" type="number" min={20} max={500} value={area} onChange={e => setArea(Math.min(500, Math.max(20, Number(e.target.value) || 20)))} className={`${inputClass} w-24 text-right font-semibold`} /><span className="text-sm text-text-secondary">м²</span></div>
                                </div>
                                <input id="house-area" type="range" min={20} max={500} step={1} value={area} onChange={e => setArea(Number(e.target.value))} className="h-11 w-full cursor-pointer accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" />
                                <div className="flex justify-between text-xs text-text-secondary"><span>20 м²</span><span>500 м²</span></div>
                            </div>
                            <div>
                                <span className="mb-2 block text-sm font-medium text-text-secondary">Этажность</span>
                                <div className="grid grid-cols-2 gap-2">{[1, 2].map(value => <Choice key={value} active={floors === value} label={`${value} этаж${value === 1 ? '' : 'а'}`} onClick={() => setFloors(value)} />)}</div>
                            </div>
                            <Stepper label="Окна" value={windows} min={0} onChange={setWindows} />
                            <Stepper label="Входные двери" value={externalDoors} min={0} onChange={setExternalDoors} />
                            <Stepper label="Межкомнатные двери" value={interiorDoors} min={0} onChange={setInteriorDoors} />
                            <div className="sm:col-span-2">
                                <span className="mb-2 block text-sm font-medium text-text-secondary">Форма крыши</span>
                                <div className="grid grid-cols-2 gap-2 md:grid-cols-3">{roofOptions.map(option => <Choice key={option.value} active={roofShape === option.value} label={option.label} onClick={() => setRoofShape(option.value)} />)}</div>
                            </div>
                        </div>
                    </fieldset>

                    <fieldset>
                        <legend className="mb-4 text-lg font-bold">2. Комплектация</legend>
                        <div className="grid gap-2 sm:grid-cols-2">{packageOptions.map(option => (
                            <button key={option.value} type="button" onClick={() => setSelectedPackage(option.value)} className={`min-h-[64px] rounded-lg border p-3 text-left transition ${buttonFocus} ${selectedPackage === option.value ? 'border-primary bg-primary/10' : 'border-border bg-background hover:border-gray-500'}`}>
                                <span className="block font-semibold text-text-primary">{option.label}</span><span className="mt-0.5 block text-xs leading-5 text-text-secondary">{option.description}</span>
                            </button>
                        ))}</div>
                    </fieldset>

                    <fieldset>
                        <legend className="mb-1 text-lg font-bold">3. Дополнительные конструкции</legend>
                        <p className="mb-4 text-sm text-text-secondary">Укажите только фактическую площадь. Нулевое значение исключает объект.</p>
                        <div className="grid gap-3 sm:grid-cols-3">{additions.map(addition => (
                            <label key={addition.type} className="text-sm text-text-secondary">{addition.label}<span className="relative mt-2 block"><input type="number" min={0} max={300} value={additionAreas[addition.type]} onChange={e => setAdditionAreas(current => ({ ...current, [addition.type]: Math.max(0, Number(e.target.value) || 0) }))} className={`${inputClass} pr-10`} /><span className="pointer-events-none absolute right-3 top-3">м²</span></span></label>
                        ))}</div>
                    </fieldset>

                    <details className="border-y border-border py-1">
                        <summary className={`flex min-h-[52px] cursor-pointer items-center font-semibold text-text-primary ${buttonFocus}`}>Финансовые настройки</summary>
                        <div className="grid gap-4 pb-5 pt-2 sm:grid-cols-2 lg:grid-cols-5">
                            {([
                                ['overheadPercent', 'Накладные'], ['marginPercent', 'Наценка'], ['reservePercent', 'Резерв'], ['taxPercent', 'Налог'], ['discountPercent', 'Скидка'],
                            ] as const).map(([key, label]) => <label key={key} className="text-sm text-text-secondary">{label}<span className="relative mt-2 block"><input type="number" min={0} max={100} value={rates[key]} onChange={e => setRate(key, Number(e.target.value))} className={`${inputClass} pr-8`} /><span className="pointer-events-none absolute right-3 top-3">%</span></span></label>)}
                        </div>
                        <p className="pb-4 text-xs leading-5 text-text-secondary">По умолчанию дополнительные ставки равны нулю: эталонная смета уже содержит клиентские цены. Заполняйте их только когда требуется начислить расходы поверх исторической стоимости.</p>
                    </details>

                    <button type="button" onClick={runCalculation} disabled={isCalculating} className={`min-h-[52px] w-full rounded-lg bg-primary px-5 font-bold text-white shadow-lg shadow-red-950/20 transition hover:bg-primary-hover disabled:cursor-wait disabled:opacity-60 ${buttonFocus}`}>
                        {isCalculating ? 'Рассчитываем…' : 'Рассчитать стоимость'}
                    </button>
                </div>

                <aside className="min-w-0 xl:sticky xl:top-6">
                    <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-2xl">
                        <div className="border-b border-border p-5 sm:p-6">
                            <p className="text-xs font-bold uppercase tracking-wider text-text-secondary">Предварительная стоимость</p>
                            {isCalculating ? <div aria-label="Расчёт выполняется" className="mt-4 space-y-3 animate-pulse"><div className="h-9 w-3/4 rounded bg-border" /><div className="h-5 w-full rounded bg-border/70" /></div> : error ? <div role="alert" className="mt-4 rounded-lg border border-red-500/40 bg-red-950/30 p-4 text-sm leading-6 text-red-200"><strong className="block text-red-100">Расчёт пока недоступен</strong>{error}</div> : result ? <>
                                <p className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">{money(result.base)}</p>
                                <p className="mt-2 text-sm text-text-secondary">Диапазон: <span className="font-semibold text-text-primary">{money(result.low)} — {money(result.high)}</span></p>
                                <div className="mt-4 flex flex-wrap gap-2 text-xs"><span className={`rounded-full px-2.5 py-1 font-semibold ${result.confidence === 'high' ? 'bg-emerald-500/15 text-emerald-300' : result.confidence === 'medium' ? 'bg-amber-500/15 text-amber-300' : 'bg-red-500/15 text-red-300'}`}>Уверенность: {confidence}</span><span className="rounded-full bg-background px-2.5 py-1 text-text-secondary">1 эталон · {result.evidence.eligibleEstimateCount} доступно</span></div>
                            </> : <p className="mt-4 text-sm leading-6 text-text-secondary">Заполните параметры и нажмите «Рассчитать стоимость».</p>}
                        </div>

                        {result && !isCalculating && !error && <div className="divide-y divide-border">
                            <div className="p-5 sm:p-6">
                                <h2 className="mb-3 font-bold">За что идёт оплата</h2>
                                <dl className="space-y-2 text-sm">{([
                                    ['Материалы', result.financials.materials], ['Работы', result.financials.works], ['Логистика', result.financials.logistics], ['Техника', result.financials.equipment], ['Накладные расходы', result.financials.overhead], ['Наценка', result.financials.margin], ['Резерв', result.financials.reserve], ['Налог', result.financials.tax], ['Скидка', -result.financials.discount],
                                ] as const).map(([label, value]) => <div key={label} className="flex justify-between gap-4"><dt className="text-text-secondary">{label}</dt><dd className={`whitespace-nowrap font-medium ${value < 0 ? 'text-emerald-300' : 'text-text-primary'}`}>{money(value)}</dd></div>)}</dl>
                            </div>
                            <details className="p-5 sm:p-6" open>
                                <summary className={`min-h-[44px] cursor-pointer font-bold ${buttonFocus}`}>Разделы строительства</summary>
                                <div className="space-y-2 pt-2">{result.sections.length ? result.sections.map(section => <div key={section.category} className="flex items-start justify-between gap-4 text-sm"><span className="min-w-0 text-text-secondary">{section.category}</span><span className="whitespace-nowrap font-semibold">{money(section.total)}</span></div>) : <p className="text-sm text-text-secondary">В эталонной смете нет подходящих позиций.</p>}</div>
                            </details>
                            <div className="p-5 sm:p-6">
                                <h2 className="font-bold">Основание расчёта</h2>
                                <p className="mt-2 text-sm leading-6 text-text-secondary">{result.evidence.sourceReason}</p>
                                <p className="mt-2 text-xs text-text-secondary">Согласованных: {result.evidence.approvedCount} · Отправленных: {result.evidence.sentCount} · Черновиков: {result.evidence.draftCount}</p>
                                {result.warnings.length > 0 && <div className="mt-4 space-y-2">{result.warnings.map((warning, index) => <p key={`${warning}-${index}`} role="status" className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 text-xs leading-5 text-amber-200">{warning}</p>)}</div>}
                            </div>
                            <div className="p-5 sm:p-6"><button type="button" onClick={createDraft} disabled={!result.items.length} className={`min-h-[48px] w-full rounded-lg bg-primary px-4 font-bold text-white transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40 ${buttonFocus}`}>Создать черновик сметы</button><p className="mt-2 text-center text-xs text-text-secondary">Все позиции откроются для проверки и редактирования.</p></div>
                        </div>}
                    </div>
                </aside>
            </div>
        </section>
    );
};

export default HouseCalculator;
