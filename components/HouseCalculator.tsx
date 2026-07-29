import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ESTIMATE_EXPLANATION_MAX_LENGTH, Estimate, EstimateCategory, EstimateItem, EstimateStatus, EstimateSubgroup, Material, Work } from '../types';
import {
    calculateHouseEstimate,
    calculateHouseVariants,
    HouseCalculatorInput,
    HouseCalculatorResult,
    HOUSE_TIER_CONFIG,
    HouseTier,
    HouseVariantResult,
    HousePackage,
    RoofShape,
    parseHouseDescription,
    selectEligibleHouseHistory,
} from '../services/houseCalculator';
import { explainHouseCalculation } from '../services/openRouterService';
import { buildCrewToolPlan } from '../services/toolPlanning';

interface HouseCalculatorProps {
    estimates: Estimate[];
    materials: Material[];
    works: Work[];
    historyLoaded: boolean;
    onRefreshEstimates: () => Promise<Estimate[]>;
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
    { type: 'porch', label: 'Входная группа' },
];

const money = (value: number) => `${(Object.is(Math.round(value), -0) ? 0 : Math.round(value)).toLocaleString('ru-RU')} ₽`;
const internalExplanation = (estimate: Estimate) => estimate.explanation
    ?.trim()
    .slice(0, ESTIMATE_EXPLANATION_MAX_LENGTH) || 'не указано';
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

const HouseCalculator: React.FC<HouseCalculatorProps> = ({ estimates, materials, works, historyLoaded, onRefreshEstimates, onCreateEstimate }) => {
    // Materials remain part of the shared screen contract; prices in this MVP come from history.
    void materials;

    const [area, setArea] = useState(79);
    const [floors, setFloors] = useState(1);
    const [crewSize, setCrewSize] = useState(4);
    const [windows, setWindows] = useState(6);
    const [externalDoors, setExternalDoors] = useState(0);
    const [interiorDoors, setInteriorDoors] = useState(3);
    const [roofShape, setRoofShape] = useState<RoofShape>('gable');
    const [selectedPackage, setSelectedPackage] = useState<HousePackage>('warm-shell');
    const [additionAreas, setAdditionAreas] = useState<Record<AdditionType, number>>({ terrace: 19, veranda: 0, porch: 0, balcony: 0, carport: 0, garage: 0 });
    const [rates, setRates] = useState({ overheadPercent: 0, marginPercent: 0, reservePercent: 0, taxPercent: 0, discountPercent: 0 });
    const [result, setResult] = useState<HouseCalculatorResult | null>(null);
    const [error, setError] = useState('');
    const [isCalculating, setIsCalculating] = useState(true);
    const [clientDescription, setClientDescription] = useState('');
    const [aiExplanation, setAiExplanation] = useState('');
    const [aiError, setAiError] = useState('');
    const [isAiLoading, setIsAiLoading] = useState(false);
    const [variants, setVariants] = useState<HouseVariantResult[]>([]);
    const [selectedTier, setSelectedTier] = useState<HouseTier>('optimal');
    const [proposalExport, setProposalExport] = useState<'pdf' | 'word' | null>(null);
    const [proposalError, setProposalError] = useState('');
    const houseToolPlanning = useMemo(() => result ? buildCrewToolPlan({
        estimateItems: result.items,
        works,
        crewSize,
    }) : null, [crewSize, result, works]);

    const calculationInput = useMemo<HouseCalculatorInput>(() => ({
        estimates,
        area,
        floors,
        windows,
        doors: externalDoors + interiorDoors,
        exteriorDoors: externalDoors,
        interiorDoors,
        roofShape,
        package: selectedPackage,
        additions: additions
            .map(({ type }) => ({ type, area: additionAreas[type] }))
            .filter(item => item.area > 0),
        rates,
    }), [estimates, area, floors, windows, externalDoors, interiorDoors, roofShape, selectedPackage, additionAreas, rates]);

    const applyVariants = useCallback((input: HouseCalculatorInput, tier: HouseTier = selectedTier) => {
        const nextVariants = calculateHouseVariants(input);
        const selected = nextVariants.find(variant => variant.tier === tier) || nextVariants[1];
        setVariants(nextVariants);
        setSelectedTier(selected.tier);
        setSelectedPackage(selected.package);
        setResult(selected.result);
        return { variants: nextVariants, selected };
    }, [selectedTier]);

    const runCalculation = useCallback(() => {
        if (!historyLoaded) {
            setIsCalculating(true);
            return;
        }
        setIsCalculating(true);
        setError('');
        setAiExplanation('');
        setAiError('');
        try {
            applyVariants(calculationInput);
        } catch (reason) {
            setVariants([]);
            setResult(null);
            setError(reason instanceof Error ? reason.message : 'Не удалось выполнить расчёт.');
        } finally {
            setIsCalculating(false);
        }
    }, [applyVariants, calculationInput, historyLoaded]);

    useEffect(() => { runCalculation(); }, [runCalculation]);

    const runRequestedCalculation = async () => {
        setIsCalculating(true);
        setError('');
        setAiError('');
        setAiExplanation('');
        try {
            const parsed = parseHouseDescription(clientDescription);
            const requestedTier: HouseTier = parsed.package === 'turnkey' || parsed.package === 'turnkey-engineering'
                ? 'premium' : parsed.package === 'box' || parsed.package === 'warm-shell' ? 'economy' : 'optimal';
            const effectiveArea = parsed.area || area;
            const effectiveInput = { ...calculationInput, area: effectiveArea };
            let estimatesUsed = effectiveInput.estimates;
            let calculation: ReturnType<typeof applyVariants>;
            try {
                calculation = applyVariants(effectiveInput, requestedTier);
            } catch {
                const refreshedEstimates = await onRefreshEstimates();
                estimatesUsed = refreshedEstimates;
                calculation = applyVariants({ ...effectiveInput, estimates: refreshedEstimates }, requestedTier);
            }
            if (parsed.area) setArea(parsed.area);

            if (clientDescription.trim()) {
                setIsAiLoading(true);
                const reviewed = calculation.selected.result;
                const historicalSummary = selectEligibleHouseHistory(estimatesUsed)
                    .map(estimate => `Статус: ${estimate.status}; площадь: ${estimate.area} м²; итог: ${money(estimate.total)}; внутреннее пояснение: ${internalExplanation(estimate)}.`)
                    .join('\n') || 'Подходящие сметы выбраны резервным алгоритмом.';
                const deterministicSummary = [
                    `Каркасный дом: ${effectiveArea} м², ${floors} эт.`,
                    `Выбранный вариант: ${calculation.selected.label}.`,
                    `Предварительная стоимость: ${money(reviewed.base)}; диапазон: ${money(reviewed.low)}—${money(reviewed.high)}.`,
                    `Основание: ${reviewed.evidence.approvedCount} согласованных смет; ${reviewed.evidence.sourceReason}`,
                ].join('\n');
                setAiExplanation(await explainHouseCalculation({ deterministicSummary, historicalSummary, clientDescription }));
            }
        } catch (reason) {
            setVariants([]);
            setResult(null);
            setError(reason instanceof Error ? reason.message : 'Не удалось выполнить расчёт.');
        } finally {
            setIsAiLoading(false);
            setIsCalculating(false);
        }
    };

    const setRate = (key: keyof typeof rates, value: number) => {
        setRates(current => ({ ...current, [key]: Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0)) }));
    };

    const explainWithAi = async () => {
        if (!result) return;
        setIsAiLoading(true);
        setAiError('');
        try {
            const refreshedEstimates = await onRefreshEstimates();
            const reviewedResult = calculateHouseEstimate({ ...calculationInput, estimates: refreshedEstimates });
            setResult(reviewedResult);
            const historicalSummary = selectEligibleHouseHistory(refreshedEstimates)
                .map(estimate => {
                    const categories = [...new Set(estimate.items.map(item => item.category))].join(', ');
                    return `Статус: ${estimate.status}; площадь: ${estimate.area} м²; итог: ${money(estimate.total)}; разделы: ${categories || 'не указаны'}; внутреннее пояснение: ${internalExplanation(estimate)}.`;
                })
                .join('\n') || 'Подходящих смет не найдено.';
            const summary = [
                `Дом: каркасный, ${area} м², ${floors} эт.`,
                `Окна: ${windows}; входные двери: ${externalDoors}; межкомнатные двери: ${interiorDoors}.`,
                `Крыша: ${roofOptions.find(option => option.value === roofShape)?.label || roofShape}.`,
                `Комплектация: ${packageOptions.find(option => option.value === selectedPackage)?.label || selectedPackage}.`,
                `Итог расчёта: ${money(result.base)}; диапазон: ${money(result.low)}—${money(result.high)}.`,
                `Источник: ${result.evidence.approvedCount} согласованных, ${result.evidence.draftCount} черновиков; ${result.evidence.sourceReason}`,
                `Предупреждения: ${result.warnings.join('; ') || 'нет'}.`,
            ].join('\n');
            setAiExplanation(await explainHouseCalculation({ deterministicSummary: summary, historicalSummary, clientDescription }));
        } catch (reason) {
            setAiExplanation('');
            setAiError(reason instanceof Error ? reason.message : 'Не удалось получить пояснение от Free AI.');
        } finally {
            setIsAiLoading(false);
        }
    };

    const selectVariant = (variant: HouseVariantResult) => {
        setSelectedTier(variant.tier);
        setSelectedPackage(variant.package);
        setResult(variant.result);
        setAiExplanation('');
        setProposalError('');
    };

    const proposalInput = () => ({
        area,
        floors,
        windows,
        doors: externalDoors + interiorDoors,
        roof: roofOptions.find(option => option.value === roofShape)?.label || roofShape,
        clientDescription: clientDescription.trim(),
        selectedTier,
        variants,
    });

    const exportProposalPdf = async () => {
        if (!variants.length) return;
        setProposalExport('pdf');
        setProposalError('');
        try {
            const { downloadHouseProposalPdf } = await import('../services/houseProposalPdf');
            await downloadHouseProposalPdf(proposalInput());
        } catch (reason) {
            setProposalError(reason instanceof Error ? reason.message : 'Не удалось сформировать PDF-файл.');
        } finally {
            setProposalExport(null);
        }
    };

    const exportProposalWord = async () => {
        if (!variants.length) return;
        setProposalExport('word');
        setProposalError('');
        try {
            const { downloadHouseProposalDocx } = await import('../services/houseProposalDocx');
            await downloadHouseProposalDocx(proposalInput());
        } catch (reason) {
            setProposalError(reason instanceof Error ? reason.message : 'Не удалось сформировать Word-документ.');
        } finally {
            setProposalExport(null);
        }
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
            explanation: clientDescription.trim().slice(0, ESTIMATE_EXPLANATION_MAX_LENGTH),
            crewToolPlan: houseToolPlanning?.plan,
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
                <p className="mt-2 max-w-3xl text-sm leading-6 text-text-secondary">Предварительная оценка только по вашим актуальным сметам: подтверждённые за текущий год и свежие черновики за 90 дней.</p>
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
                            <Stepper label="Бригада" value={crewSize} min={1} max={30} onChange={setCrewSize} />
                            <Stepper label="Входные двери" value={externalDoors} min={0} onChange={setExternalDoors} />
                            <Stepper label="Межкомнатные двери" value={interiorDoors} min={0} onChange={setInteriorDoors} />
                            <div className="sm:col-span-2">
                                <span className="mb-2 block text-sm font-medium text-text-secondary">Форма крыши</span>
                                <div className="grid grid-cols-2 gap-2 md:grid-cols-3">{roofOptions.map(option => <Choice key={option.value} active={roofShape === option.value} label={option.label} onClick={() => setRoofShape(option.value)} />)}</div>
                            </div>
                        </div>
                    </fieldset>

                    <fieldset>
                        <legend className="mb-1 text-lg font-bold">2. Варианты комплектации</legend>
                        <p className="mb-4 text-sm text-text-secondary">Один расчёт сразу подготовит три уровня готовности.</p>
                        <div className="grid gap-2 sm:grid-cols-3">{HOUSE_TIER_CONFIG.map(option => (
                            <button key={option.tier} type="button" onClick={() => {
                                const calculated = variants.find(variant => variant.tier === option.tier);
                                if (calculated) selectVariant(calculated);
                                else {
                                    setSelectedTier(option.tier);
                                    setSelectedPackage(option.package);
                                }
                            }} className={`min-h-[76px] rounded-lg border p-3 text-left transition ${buttonFocus} ${selectedTier === option.tier ? 'border-primary bg-primary/10' : 'border-border bg-background hover:border-gray-500'}`}>
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

                    <fieldset>
                        <legend className="mb-2 text-lg font-bold">4. Пожелания клиента</legend>
                        <label className="block text-sm text-text-secondary" htmlFor="house-client-description">Опишите дом и пожелания — AI сверит их с вашими сметами и подготовит итоговый вывод.</label>
                        <textarea id="house-client-description" value={clientDescription} onChange={event => setClientDescription(event.target.value)} maxLength={ESTIMATE_EXPLANATION_MAX_LENGTH} rows={4} placeholder="Например: нужен тёплый дом для круглогодичного проживания, важны большие окна и терраса." className={`${inputClass} mt-2 resize-y py-3`} />
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

                    <button type="button" onClick={() => void runRequestedCalculation()} disabled={isCalculating} className={`min-h-[52px] w-full rounded-lg bg-primary px-5 font-bold text-white shadow-lg shadow-red-950/20 transition hover:bg-primary-hover disabled:cursor-wait disabled:opacity-60 ${buttonFocus}`}>
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
                                <div className="mt-4 flex flex-wrap gap-2 text-xs"><span className={`rounded-full px-2.5 py-1 font-semibold ${result.confidence === 'high' ? 'bg-emerald-500/15 text-emerald-300' : result.confidence === 'medium' ? 'bg-amber-500/15 text-amber-300' : 'bg-red-500/15 text-red-300'}`}>Уверенность: {confidence}</span><span className="rounded-full bg-background px-2.5 py-1 text-text-secondary">Согласовано: {result.evidence.approvedCount} · Черновики: {result.evidence.draftCount}</span></div>
                            </> : <p className="mt-4 text-sm leading-6 text-text-secondary">Заполните параметры и нажмите «Рассчитать стоимость».</p>}
                        </div>

                        {result && !isCalculating && !error && <div className="divide-y divide-border">
                            {variants.length > 0 && <div className="p-5 sm:p-6">
                                <div className="mb-4">
                                    <h2 className="font-bold">Три варианта дома</h2>
                                    <p className="mt-1 text-sm leading-6 text-text-secondary">Выберите вариант для сметы и коммерческого предложения.</p>
                                </div>
                                <div className="grid gap-3">
                                    {variants.map(variant => {
                                        const active = variant.tier === selectedTier;
                                        return <button key={variant.tier} type="button" onClick={() => selectVariant(variant)} aria-pressed={active} className={`min-h-[92px] rounded-lg border p-4 text-left transition ${buttonFocus} ${active ? 'border-primary bg-primary/10' : 'border-border bg-background hover:border-gray-500'}`}>
                                            <span className="flex items-start justify-between gap-3">
                                                <span><span className="block font-bold text-text-primary">{variant.label}</span><span className="mt-1 block text-xs leading-5 text-text-secondary">{variant.description}</span></span>
                                                <span className="whitespace-nowrap text-base font-bold text-text-primary">{money(variant.result.base)}</span>
                                            </span>
                                            <span className="mt-2 block text-xs text-text-secondary">{money(variant.result.low)} — {money(variant.result.high)}</span>
                                        </button>;
                                    })}
                                </div>
                                <button type="button" onClick={() => void exportProposalPdf()} disabled={proposalExport !== null} className={`mt-4 min-h-[46px] w-full rounded-lg bg-white px-4 font-bold text-gray-950 transition hover:bg-gray-200 disabled:cursor-wait disabled:opacity-60 ${buttonFocus}`}>{proposalExport === 'pdf' ? 'Формируем PDF…' : 'Скачать коммерческое предложение PDF'}</button>
                                <button type="button" onClick={() => void exportProposalWord()} disabled={proposalExport !== null} className={`mt-2 min-h-[44px] w-full rounded-lg border border-border px-4 text-sm font-semibold text-text-secondary transition hover:border-gray-500 hover:text-text-primary disabled:cursor-wait disabled:opacity-60 ${buttonFocus}`}>{proposalExport === 'word' ? 'Формируем Word…' : 'Скачать Word-версию'}</button>
                                {proposalError && <p role="alert" className="mt-3 rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 text-xs leading-5 text-amber-200">{proposalError}</p>}
                            </div>}
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
                            <details className="p-5 sm:p-6">
                                <summary className={`min-h-[44px] cursor-pointer font-bold ${buttonFocus}`}>Инструмент для бригады{houseToolPlanning?.aggregated.length ? ` · ${houseToolPlanning.aggregated.length}` : ''}</summary>
                                <p className="mt-1 text-xs text-text-secondary">Внутреннее · не попадёт в коммерческое предложение</p>
                                {houseToolPlanning && houseToolPlanning.aggregated.length > 0 ? (
                                    <div className="mt-3 space-y-2">
                                        {houseToolPlanning.aggregated.map(tool => (
                                            <div key={tool.toolKey} className="flex items-start justify-between gap-4 text-sm">
                                                <span className="min-w-0 text-text-secondary">{tool.name}</span>
                                                <span className="whitespace-nowrap font-semibold text-text-primary">{tool.quantity} шт.</span>
                                            </div>
                                        ))}
                                        <p className="pt-2 text-xs leading-5 text-text-secondary">Набор найден для {houseToolPlanning.coverage.coveredWorkItems} из {houseToolPlanning.coverage.totalWorkItems} работ.</p>
                                    </div>
                                ) : <p className="mt-3 text-sm leading-6 text-text-secondary">Для работ этого расчёта инструмент пока не настроен в справочнике.</p>}
                            </details>
                            <div className="p-5 sm:p-6">
                                <h2 className="font-bold">Основание расчёта</h2>
                                <p className="mt-2 text-sm leading-6 text-text-secondary">{result.evidence.sourceReason}</p>
                                <p className="mt-2 text-xs text-text-secondary">Согласованных: {result.evidence.approvedCount} · Отправленных: {result.evidence.sentCount} · Черновиков: {result.evidence.draftCount}</p>
                                {result.warnings.length > 0 && <div className="mt-4 space-y-2">{result.warnings.map((warning, index) => <p key={`${warning}-${index}`} role="status" className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 text-xs leading-5 text-amber-200">{warning}</p>)}</div>}
                            </div>
                            <div className="p-5 sm:p-6">
                                <h2 className="font-bold">AI-перепроверка</h2>
                                <p className="mt-2 text-sm leading-6 text-text-secondary">AI повторно сопоставляет параметры и пожелания с вашими актуальными сметами и формирует финальный вывод.</p>
                                <button type="button" onClick={() => void explainWithAi()} disabled={isAiLoading} className={`mt-4 min-h-[44px] w-full rounded-lg border border-primary px-4 font-bold text-primary transition hover:bg-primary hover:text-white disabled:cursor-wait disabled:opacity-60 ${buttonFocus}`}>{isAiLoading ? 'AI перепроверяет…' : 'Перепроверить расчёт с AI'}</button>
                                {aiError && <p role="alert" className="mt-3 rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 text-xs leading-5 text-amber-200">{aiError}</p>}
                                {aiExplanation && <p className="mt-3 whitespace-pre-line rounded-lg border border-border bg-background p-3 text-sm leading-6 text-text-primary">{aiExplanation}</p>}
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
