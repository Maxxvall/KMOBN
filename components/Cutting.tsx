import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { generateCuttingPdf } from '../services/cutting/exportPdf';
import { decodeCuttingFile, parseCuttingText, validateCuttingItems } from '../services/cutting/importCsv';
import { optimizeCuttingPlan } from '../services/cutting/optimizer';
import { getCuttingStageLabel } from '../services/cutting/stageOrder';
import {
    clearCuttingDraft,
    loadCuttingDraft,
    loadCuttingStageMappings,
    saveCuttingDraft,
    saveCuttingStageMapping,
} from '../services/cutting/storage';
import {
    CUTTING_STAGE_ORDER,
    CuttingImportIssue,
    CuttingImportResult,
    CuttingItem,
    CuttingPlan,
    CuttingSettings,
    CuttingStageId,
    DEFAULT_CUTTING_SETTINGS,
    getSheetStockProfile,
} from '../services/cutting/types';
import PlywoodCutMap from './PlywoodCutMap';

type IconName = 'upload' | 'alert' | 'calculator' | 'file' | 'reset' | 'download';

const Icon: React.FC<{ name: IconName; className?: string }> = ({ name, className = 'h-5 w-5' }) => {
    const props = {
        className,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 2,
        strokeLinecap: 'round' as const,
        strokeLinejoin: 'round' as const,
        'aria-hidden': true,
    };

    if (name === 'upload') return <svg {...props}><path d="M12 3v12M7 8l5-5 5 5" /><path d="M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" /></svg>;
    if (name === 'alert') return <svg {...props}><path d="M10.3 2.9 1.8 17a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 2.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h.01" /></svg>;
    if (name === 'calculator') return <svg {...props}><rect x="4" y="2" width="16" height="20" rx="2" /><path d="M8 6h8v4H8zM8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" /></svg>;
    if (name === 'file') return <svg {...props}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6M8 13h8M8 17h5" /></svg>;
    if (name === 'download') return <svg {...props}><path d="M12 3v12M7 10l5 5 5-5" /><path d="M5 19h14" /></svg>;
    return <svg {...props}><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>;
};

const inputClass = 'min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-text-primary outline-none transition placeholder:text-text-secondary focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30';
const focusClass = 'outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background';
const numberFormatter = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });

const formatNumber = (value: number): string => numberFormatter.format(value);
const formatPercent = (value: number): string => `${formatNumber(value)}%`;

const StageSelect: React.FC<{
    value: CuttingStageId;
    label: string;
    onChange: (value: CuttingStageId) => void;
}> = ({ value, label, onChange }) => (
    <select
        value={value}
        aria-label={label}
        onChange={event => onChange(event.target.value as CuttingStageId)}
        className={`${inputClass} min-w-[170px]`}
    >
        {CUTTING_STAGE_ORDER.map(stage => <option key={stage} value={stage}>{getCuttingStageLabel(stage)}</option>)}
    </select>
);

const Section: React.FC<{ title: string; description?: string; children: React.ReactNode; className?: string }> = ({
    title, description, children, className = '',
}) => (
    <section className={`rounded-xl border border-border bg-surface p-3 shadow-lg sm:p-4 ${className}`}>
        <div className="mb-3">
            <h2 className="text-base font-semibold text-text-primary sm:text-lg">{title}</h2>
            {description && <p className="mt-1 text-sm text-text-secondary">{description}</p>}
        </div>
        {children}
    </section>
);

const Cutting: React.FC = () => {
    const inputRef = useRef<HTMLInputElement>(null);
    const [initialDraft] = useState(loadCuttingDraft);
    const [importResult, setImportResult] = useState<CuttingImportResult | null>(() => initialDraft ? {
        fileName: initialDraft.fileName,
        items: initialDraft.items,
        issues: [],
        skippedRows: 0,
    } : null);
    const [settings, setSettings] = useState<CuttingSettings>(() => ({
        ...DEFAULT_CUTTING_SETTINGS,
        ...(initialDraft?.settings ?? {}),
        maxBoardPartLength: DEFAULT_CUTTING_SETTINGS.maxBoardPartLength,
    }));
    const [plan, setPlan] = useState<CuttingPlan | null>(null);
    const [fileError, setFileError] = useState('');
    const [calculationError, setCalculationError] = useState('');
    const [isDragging, setIsDragging] = useState(false);
    const [isReading, setIsReading] = useState(false);
    const [isExporting, setIsExporting] = useState(false);

    const clearPlan = useCallback(() => {
        setPlan(null);
        setCalculationError('');
    }, []);

    const itemIssues = useMemo(
        () => importResult ? validateCuttingItems(importResult.items, settings) : [],
        [importResult, settings],
    );
    const importLevelIssues = useMemo(
        () => importResult?.issues.filter(issue => !issue.itemId) ?? [],
        [importResult],
    );
    const issues = useMemo(() => [...importLevelIssues, ...itemIssues], [importLevelIssues, itemIssues]);
    const errorIssues = issues.filter(issue => issue.severity === 'error');
    const warningIssues = issues.filter(issue => issue.severity === 'warning');

    const settingsErrors = useMemo(() => {
        const errors: string[] = [];
        if (!Number.isFinite(settings.boardStockLength) || settings.boardStockLength <= 0) errors.push('Укажите длину заготовки больше нуля.');
        if (settings.boardStockLength < settings.maxBoardPartLength) errors.push(`Заготовка должна быть не короче ${settings.maxBoardPartLength} мм.`);
        if (!Number.isFinite(settings.boardKerf) || settings.boardKerf < 0) errors.push('Пропил доски не может быть отрицательным.');
        if (!Number.isFinite(settings.usefulOffcutLength) || settings.usefulOffcutLength < 0) errors.push('Полезный остаток не может быть отрицательным.');
        if (settings.usefulOffcutLength >= settings.boardStockLength) errors.push('Полезный остаток должен быть короче заготовки.');
        const sheetMaterials = new Set(importResult?.items.filter(item => item.isSheet).map(item => item.section) ?? []);
        sheetMaterials.forEach(material => {
            const profile = getSheetStockProfile(settings, material);
            if (!Number.isFinite(profile.width) || profile.width <= 0 || !Number.isFinite(profile.height) || profile.height <= 0) errors.push(`${material}: укажите корректный формат листа.`);
            if (!Number.isFinite(profile.kerf) || profile.kerf < 0) errors.push(`${material}: пропил листа не может быть отрицательным.`);
        });
        return errors;
    }, [importResult, settings]);

    useEffect(() => {
        if (!importResult?.items.length) return;
        saveCuttingDraft({
            fileName: importResult.fileName,
            items: importResult.items,
            settings,
            updatedAt: new Date().toISOString(),
        });
    }, [importResult, settings]);

    const hasBlockingErrors = errorIssues.length > 0 || settingsErrors.length > 0;
    const canCalculate = Boolean(importResult?.items.length) && !hasBlockingErrors && !isReading;

    const reset = useCallback(() => {
        setImportResult(null);
        setSettings(DEFAULT_CUTTING_SETTINGS);
        setFileError('');
        clearCuttingDraft();
        clearPlan();
        if (inputRef.current) inputRef.current.value = '';
    }, [clearPlan]);

    const readFile = useCallback(async (file: File) => {
        const extension = file.name.split('.').pop()?.toLocaleLowerCase('ru-RU');
        if (extension !== 'csv' && extension !== 'txt') {
            setFileError('Поддерживаются только файлы .csv и .txt.');
            return;
        }

        setIsReading(true);
        setFileError('');
        clearPlan();
        try {
            const text = decodeCuttingFile(await file.arrayBuffer());
            const result = parseCuttingText(text, file.name, settings);
            const mappings = loadCuttingStageMappings();
            const sheetProfiles = { ...settings.sheetProfiles };
            result.items.filter(item => item.isSheet).forEach(item => {
                if (sheetProfiles[item.section]) return;
                const isOsb = /osb|осб|осп/i.test(item.section);
                sheetProfiles[item.section] = isOsb
                    ? { width: 1250, height: 2500, kerf: 5, allowRotation: true }
                    : { width: 1525, height: 1525, kerf: 5, allowRotation: true };
            });
            setSettings(current => ({ ...current, sheetProfiles }));
            setImportResult({
                ...result,
                items: result.items.map(item => ({
                    ...item,
                    stage: mappings[item.construction.toLocaleLowerCase('ru-RU').trim()] ?? item.stage,
                })),
            });
            if (result.items.length === 0 && result.issues.length === 0) setFileError('В файле нет строк для раскроя.');
        } catch (reason) {
            setImportResult(null);
            setFileError(reason instanceof Error ? reason.message : 'Не удалось прочитать файл.');
        } finally {
            setIsReading(false);
        }
    }, [clearPlan, settings]);

    const updateItems = useCallback((updater: (items: CuttingItem[]) => CuttingItem[]) => {
        setImportResult(current => current ? { ...current, items: updater(current.items) } : current);
        clearPlan();
    }, [clearPlan]);

    const updateItemWidth = (itemId: string, width: number | undefined) => {
        updateItems(items => items.map(item => item.id === itemId ? { ...item, width } : item));
    };

    const updateConstructionStage = (construction: string, stage: CuttingStageId) => {
        saveCuttingStageMapping(construction, stage);
        updateItems(items => items.map(item => item.construction === construction ? { ...item, stage } : item));
    };

    const updateSetting = <Key extends keyof CuttingSettings>(key: Key, value: CuttingSettings[Key]) => {
        setSettings(current => ({ ...current, [key]: value }));
        clearPlan();
    };

    const updateSheetProfile = (
        material: string,
        key: 'width' | 'height' | 'kerf' | 'allowRotation',
        value: number | boolean,
    ) => {
        setSettings(current => ({
            ...current,
            sheetProfiles: {
                ...current.sheetProfiles,
                [material]: { ...getSheetStockProfile(current, material), [key]: value },
            },
        }));
        clearPlan();
    };

    const calculate = () => {
        if (!importResult || !canCalculate) return;
        setCalculationError('');
        try {
            const nextPlan = optimizeCuttingPlan(importResult.items, settings);
            setPlan(nextPlan);
            window.requestAnimationFrame(() => document.getElementById('cutting-result')?.focus());
        } catch (reason) {
            setPlan(null);
            setCalculationError(reason instanceof Error ? reason.message : 'Не удалось выполнить раскрой.');
        }
    };

    const exportPdf = async () => {
        if (!plan || !importResult || isExporting) return;
        setIsExporting(true);
        setCalculationError('');
        try {
            await generateCuttingPdf({ fileName: importResult.fileName, items: importResult.items, plan, settings });
        } catch (reason) {
            setCalculationError(reason instanceof Error ? reason.message : 'Не удалось сформировать PDF.');
        } finally {
            setIsExporting(false);
        }
    };

    const sheetItems = importResult?.items.filter(item => item.isSheet) ?? [];
    const sheetMaterials = [...new Set(sheetItems.map(item => item.section))];
    const missingSheetItems = sheetItems.filter(item => !item.width || item.width <= 0);
    const totalPieces = importResult?.items.reduce((total, item) => total + item.quantity, 0) ?? 0;

    const constructions = useMemo(() => {
        if (!importResult) return [];
        const groups = new Map<string, { construction: string; stage: CuttingStageId; rows: number; pieces: number }>();
        for (const item of importResult.items) {
            const current = groups.get(item.construction);
            if (current) {
                current.rows += 1;
                current.pieces += item.quantity;
            } else {
                groups.set(item.construction, { construction: item.construction, stage: item.stage, rows: 1, pieces: item.quantity });
            }
        }
        return [...groups.values()].sort((left, right) => (
            CUTTING_STAGE_ORDER.indexOf(left.stage) - CUTTING_STAGE_ORDER.indexOf(right.stage)
            || left.construction.localeCompare(right.construction, 'ru')
        ));
    }, [importResult]);

    const stageRows = useMemo(() => {
        if (!importResult || !plan) return new Map<CuttingStageId, Array<{
            key: string;
            construction: string;
            section: string;
            size: string;
            quantity: number;
            references: string;
        }>>();

        const boardRefs = new Map<string, Set<string>>();
        for (const board of plan.boards) for (const cut of board.cuts) {
            const refs = boardRefs.get(cut.itemId) ?? new Set<string>();
            refs.add(board.id);
            boardRefs.set(cut.itemId, refs);
        }
        const sheetRefs = new Map<string, Set<string>>();
        for (const sheet of plan.sheets) for (const part of sheet.parts) {
            const refs = sheetRefs.get(part.itemId) ?? new Set<string>();
            refs.add(sheet.id);
            sheetRefs.set(part.itemId, refs);
        }

        const rows = new Map<CuttingStageId, Array<{
            key: string;
            construction: string;
            section: string;
            size: string;
            quantity: number;
            references: string;
        }>>();
        for (const item of importResult.items) {
            const stage = rows.get(item.stage) ?? [];
            const refs = item.isSheet ? sheetRefs.get(item.id) : boardRefs.get(item.id);
            stage.push({
                key: item.id,
                construction: item.construction,
                section: item.section || '—',
                size: item.isSheet ? `${formatNumber(item.length)} × ${formatNumber(item.width ?? 0)}` : formatNumber(item.length),
                quantity: item.quantity,
                references: refs ? [...refs].join(', ') : '—',
            });
            rows.set(item.stage, stage);
        }
        rows.forEach(stage => stage.sort((left, right) => (
            left.construction.localeCompare(right.construction, 'ru')
            || left.section.localeCompare(right.section, 'ru')
            || left.size.localeCompare(right.size, 'ru', { numeric: true })
        )));
        return rows;
    }, [importResult, plan]);

    return (
        <main className="mx-auto w-full max-w-[1500px] space-y-4 pb-8 text-text-primary">
            <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Производство</p>
                    <h1 className="mt-1 text-2xl font-bold text-text-primary sm:text-3xl">Раскрой материалов</h1>
                    <p className="mt-1 max-w-3xl text-sm text-text-secondary">Загрузите ведомость, проверьте этапы и получите очередь распила от ростверка до кровли.</p>
                </div>
                {importResult && (
                    <button type="button" onClick={reset} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-background/50 px-4 text-sm font-medium text-text-primary transition hover:bg-white/5 ${focusClass}`}>
                        <Icon name="reset" className="h-4 w-4" /> Новый файл
                    </button>
                )}
            </header>

            <Section title="1. Импорт ведомости" description="CSV или TXT с разделителем ; , или tab. Файл обрабатывается локально и никуда не отправляется.">
                <div
                    onDragEnter={event => { event.preventDefault(); setIsDragging(true); }}
                    onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; setIsDragging(true); }}
                    onDragLeave={event => { if (event.currentTarget === event.target) setIsDragging(false); }}
                    onDrop={event => {
                        event.preventDefault();
                        setIsDragging(false);
                        const file = event.dataTransfer.files[0];
                        if (file) void readFile(file);
                    }}
                    className={`rounded-lg border-2 border-dashed p-4 text-center transition sm:p-6 ${isDragging ? 'border-primary bg-primary/10' : 'border-border bg-background/35 hover:border-text-secondary'}`}
                >
                    <input
                        ref={inputRef}
                        id="cutting-file"
                        type="file"
                        accept=".csv,.txt,text/csv,text/plain"
                        className="sr-only"
                        onChange={event => { const file = event.target.files?.[0]; if (file) void readFile(file); }}
                    />
                    <Icon name="upload" className="mx-auto h-7 w-7 text-primary" />
                    <p className="mt-2 text-sm font-medium text-text-primary">{isReading ? 'Читаем файл…' : 'Перетащите файл сюда'}</p>
                    <p className="mt-1 text-xs text-text-secondary">или</p>
                    <label htmlFor="cutting-file" className={`mt-2 inline-flex min-h-11 cursor-pointer items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-white transition hover:bg-primary-hover ${focusClass}`}>
                        Выбрать файл
                    </label>
                </div>

                {fileError && <div role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200"><Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />{fileError}</div>}

                {importResult && (
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5" aria-label="Итог импорта">
                        {[
                            ['Файл', importResult.fileName],
                            ['Позиций', formatNumber(importResult.items.length)],
                            ['Деталей', formatNumber(totalPieces)],
                            ['Пропущено', formatNumber(importResult.skippedRows)],
                            ['Ошибок', formatNumber(errorIssues.length)],
                        ].map(([label, value]) => (
                            <div key={label} className="min-w-0 rounded-lg border border-border bg-background/40 px-3 py-2">
                                <div className="text-xs text-text-secondary">{label}</div>
                                <div className={`mt-0.5 truncate text-sm font-semibold ${label === 'Ошибок' && errorIssues.length ? 'text-red-300' : 'text-text-primary'}`} title={String(value)}>{value}</div>
                            </div>
                        ))}
                    </div>
                )}
            </Section>

            {importResult && (
                <>
                    {(issues.length > 0 || settingsErrors.length > 0) && (
                        <Section title="Проверка данных" description="Красные ошибки блокируют расчёт. Исправьте значения ниже или исходный файл.">
                            <div role="alert" className="space-y-2">
                                {settingsErrors.map(message => (
                                    <div key={message} className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200"><Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />{message}</div>
                                ))}
                                {errorIssues.map(issue => <IssueRow key={issue.id} issue={issue} />)}
                                {warningIssues.map(issue => <IssueRow key={issue.id} issue={issue} />)}
                            </div>
                        </Section>
                    )}

                    {sheetItems.length > 0 && (
                        <Section
                            title="Размеры листовых деталей"
                            description={missingSheetItems.length ? `Заполните ширину у ${missingSheetItems.length} позиций. Длина уже взята из файла.` : 'Все размеры заполнены.'}
                        >
                            <div className="overflow-x-auto rounded-lg border border-border">
                                <table className="w-full min-w-[680px] text-left text-sm">
                                    <thead className="bg-background/70 text-xs text-text-secondary">
                                        <tr><th className="px-3 py-2 font-medium">Строка</th><th className="px-3 py-2 font-medium">Наименование</th><th className="px-3 py-2 font-medium">Длина, мм</th><th className="px-3 py-2 font-medium">Ширина, мм</th><th className="px-3 py-2 font-medium">Кол-во</th></tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {sheetItems.map(item => {
                                            const invalid = !item.width || item.width <= 0;
                                            return (
                                                <tr key={item.id} className={invalid ? 'bg-red-500/5' : 'bg-background/25'}>
                                                    <td className="px-3 py-2 text-text-secondary">{item.sourceRow}</td>
                                                    <td className="max-w-[320px] px-3 py-2 font-medium text-text-primary">{item.construction}</td>
                                                    <td className="px-3 py-2 tabular-nums">{formatNumber(item.length)}</td>
                                                    <td className="w-44 px-3 py-2">
                                                        <input
                                                            type="number"
                                                            min="1"
                                                            step="1"
                                                            value={item.width ?? ''}
                                                            aria-invalid={invalid}
                                                            aria-label={`Ширина детали, строка ${item.sourceRow}`}
                                                            onChange={event => updateItemWidth(item.id, event.target.value === '' ? undefined : event.target.valueAsNumber)}
                                                            className={`${inputClass} ${invalid ? 'border-red-500/70 focus-visible:border-red-400 focus-visible:ring-red-500/30' : ''}`}
                                                        />
                                                    </td>
                                                    <td className="px-3 py-2 tabular-nums">{formatNumber(item.quantity)}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </Section>
                    )}

                    <Section title="2. Очередность работ" description="Этап назначается сразу всем строкам с одинаковым наименованием. Бриджи попадут к стенам или кровле, если это указано в названии; здесь назначение можно поправить.">
                        <div className="overflow-x-auto rounded-lg border border-border">
                            <table className="w-full min-w-[720px] text-left text-sm">
                                <thead className="bg-background/70 text-xs text-text-secondary"><tr><th className="px-3 py-2 font-medium">Наименование</th><th className="px-3 py-2 font-medium">Строк</th><th className="px-3 py-2 font-medium">Деталей</th><th className="px-3 py-2 font-medium">Этап</th></tr></thead>
                                <tbody className="divide-y divide-border">
                                    {constructions.map(group => (
                                        <tr key={group.construction} className="bg-background/25">
                                            <td className="max-w-[520px] px-3 py-2 font-medium text-text-primary">{group.construction}</td>
                                            <td className="px-3 py-2 tabular-nums text-text-secondary">{group.rows}</td>
                                            <td className="px-3 py-2 tabular-nums text-text-secondary">{group.pieces}</td>
                                            <td className="w-56 px-3 py-2"><StageSelect value={group.stage} label={`Этап для ${group.construction}`} onChange={stage => updateConstructionStage(group.construction, stage)} /></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Section>

                    <Section title="3. Настройки раскроя" description="Детали длиннее 6000 мм всегда считаются ошибкой, даже при увеличенной неторцованной заготовке.">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                            <NumberField label="Заготовка, мм" value={settings.boardStockLength} min={1} step={10} onChange={value => updateSetting('boardStockLength', value)} hint="По умолчанию 6050" />
                            <NumberField label="Пропил доски, мм" value={settings.boardKerf} min={0} step={0.5} onChange={value => updateSetting('boardKerf', value)} />
                            <NumberField label="Полезный остаток от, мм" value={settings.usefulOffcutLength} min={0} step={50} onChange={value => updateSetting('usefulOffcutLength', value)} />
                            <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-border bg-background px-3 py-2 transition hover:border-text-secondary">
                                <input type="checkbox" checked={settings.separateStages} onChange={event => updateSetting('separateStages', event.target.checked)} className="h-5 w-5 rounded border-border accent-primary" />
                                <span><span className="block text-sm font-medium text-text-primary">Не смешивать этапы</span><span className="block text-xs text-text-secondary">Отдельная доска для каждого блока</span></span>
                            </label>
                        </div>

                        {sheetItems.length > 0 && (
                            <div className="mt-4 border-t border-border pt-4">
                                <h3 className="mb-3 text-sm font-semibold text-text-primary">Форматы листовых материалов</h3>
                                <div className="space-y-3">
                                    {sheetMaterials.map(material => {
                                        const profile = getSheetStockProfile(settings, material);
                                        return (
                                            <div key={material} className="rounded-lg border border-border bg-background/25 p-3">
                                                <h4 className="mb-3 text-sm font-semibold text-text-primary">{material}</h4>
                                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                                    <NumberField label="Ширина листа, мм" value={profile.width} min={1} step={1} onChange={value => updateSheetProfile(material, 'width', value)} />
                                                    <NumberField label="Высота листа, мм" value={profile.height} min={1} step={1} onChange={value => updateSheetProfile(material, 'height', value)} />
                                                    <NumberField label="Пропил листа, мм" value={profile.kerf} min={0} step={0.5} onChange={value => updateSheetProfile(material, 'kerf', value)} />
                                                    <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-border bg-background px-3 py-2 transition hover:border-text-secondary">
                                                        <input type="checkbox" checked={profile.allowRotation} onChange={event => updateSheetProfile(material, 'allowRotation', event.target.checked)} className="h-5 w-5 rounded border-border accent-primary" />
                                                        <span><span className="block text-sm font-medium text-text-primary">Разрешить поворот</span><span className="block text-xs text-text-secondary">Поворачивать детали на 90°</span></span>
                                                    </label>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                            <button type="button" disabled={!canCalculate} onClick={calculate} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-white transition hover:bg-primary-hover active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 ${focusClass}`}>
                                <Icon name="calculator" /> Рассчитать раскрой
                            </button>
                            {!canCalculate && <p className="text-sm text-text-secondary">Исправьте ошибки, чтобы запустить расчёт.</p>}
                        </div>
                        {calculationError && <div role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200"><Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />{calculationError}</div>}
                    </Section>
                </>
            )}

            {plan && importResult && (
                <section id="cutting-result" tabIndex={-1} aria-label="Результат раскроя" className="space-y-4 outline-none">
                    <div className="flex flex-col gap-3 rounded-xl border border-primary/40 bg-primary/10 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-wider text-primary">Расчёт готов</p>
                            <h2 className="mt-1 text-xl font-bold text-text-primary">{formatNumber(plan.boards.length)} досок · {formatNumber(plan.sheets.length)} листов</h2>
                            <p className="mt-1 text-sm text-text-secondary">Отход доски {formatPercent(plan.totalBoardWastePercentage)}{plan.sheets.length ? ` · листов ${formatPercent(plan.totalSheetWastePercentage)}` : ''}</p>
                        </div>
                        <button type="button" disabled={isExporting} onClick={() => void exportPdf()} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-primary/50 bg-background/50 px-4 text-sm font-semibold text-text-primary transition hover:bg-background disabled:cursor-wait disabled:opacity-60 ${focusClass}`}>
                            <Icon name="download" /> {isExporting ? 'Формируем PDF…' : 'Скачать PDF'}
                        </button>
                    </div>

                    <Section title="Ведомость закупки" description="Количество целых заготовок по сечению и листовому материалу.">
                        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                            <PurchaseTable plan={plan} type="boards" />
                            {plan.sheetPurchase.length > 0 && <PurchaseTable plan={plan} type="sheets" />}
                        </div>
                    </Section>

                    <Section title="Очередность по строительным блокам" description="Позиции идут снизу вверх по этапам строительства. Номера показывают, где искать деталь.">
                        <div className="space-y-3">
                            {CUTTING_STAGE_ORDER.map((stage, stageIndex) => {
                                const rows = stageRows.get(stage) ?? [];
                                if (!rows.length) return null;
                                return (
                                    <div key={stage} className="overflow-hidden rounded-lg border border-border bg-background/25">
                                        <div className="flex items-center gap-3 border-b border-border bg-background/60 px-3 py-2">
                                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">{stageIndex + 1}</span>
                                            <h3 className="font-semibold text-text-primary">{getCuttingStageLabel(stage)}</h3>
                                            <span className="ml-auto text-xs text-text-secondary">{formatNumber(rows.reduce((total, row) => total + row.quantity, 0))} деталей</span>
                                        </div>
                                        <div className="overflow-x-auto">
                                            <table className="w-full min-w-[760px] text-left text-sm">
                                                <thead className="text-xs text-text-secondary"><tr><th className="px-3 py-2 font-medium">Наименование</th><th className="px-3 py-2 font-medium">Сечение</th><th className="px-3 py-2 font-medium">Размер, мм</th><th className="px-3 py-2 font-medium">Кол-во</th><th className="px-3 py-2 font-medium">Доски / листы</th></tr></thead>
                                                <tbody className="divide-y divide-border">{rows.map(row => <tr key={row.key}><td className="px-3 py-2 font-medium text-text-primary">{row.construction}</td><td className="px-3 py-2 text-text-secondary">{row.section}</td><td className="px-3 py-2 tabular-nums">{row.size}</td><td className="px-3 py-2 tabular-nums">{row.quantity}</td><td className="max-w-[300px] px-3 py-2 text-text-secondary">{row.references}</td></tr>)}</tbody>
                                            </table>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </Section>

                    {plan.patterns.length > 0 && (
                        <Section title="Компактные карты досок" description="Одинаковые схемы объединены. Визуализация досок не используется.">
                            <div className="overflow-x-auto rounded-lg border border-border">
                                <table className="w-full min-w-[840px] text-left text-sm">
                                    <thead className="bg-background/70 text-xs text-text-secondary"><tr><th className="px-3 py-2 font-medium">Сечение</th><th className="px-3 py-2 font-medium">Доски</th><th className="px-3 py-2 font-medium">Карта резов</th><th className="px-3 py-2 font-medium">Остаток</th><th className="px-3 py-2 font-medium">Этапы</th></tr></thead>
                                    <tbody className="divide-y divide-border">
                                        {plan.patterns.map(pattern => {
                                            const stages = Array.from(new Set(pattern.cuts.map(cut => cut.stage)));
                                            return (
                                                <tr key={pattern.key} className="bg-background/20 align-top">
                                                    <td className="whitespace-nowrap px-3 py-2 font-semibold">{pattern.section} × {formatNumber(pattern.stockLength)}</td>
                                                    <td className="px-3 py-2 text-text-secondary"><span className="font-medium text-text-primary">{pattern.boardIds.length} шт.</span><div className="mt-0.5 max-w-[220px] break-words text-xs">{pattern.boardIds.join(', ')}</div></td>
                                                    <td className="px-3 py-2"><div className="font-mono text-xs leading-5 text-text-primary">{pattern.cuts.map(cut => `${formatNumber(cut.length)} ${cut.construction}`).join(' + ')}</div></td>
                                                    <td className={`whitespace-nowrap px-3 py-2 tabular-nums ${pattern.wasteLength >= settings.usefulOffcutLength ? 'text-emerald-300' : 'text-text-secondary'}`}>{formatNumber(pattern.wasteLength)} мм</td>
                                                    <td className="px-3 py-2 text-xs text-text-secondary">{stages.map(getCuttingStageLabel).join(', ')}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </Section>
                    )}

                    {plan.sheets.length > 0 && (
                        <Section title="Карты фанеры и OSB" description="Визуализация показана только для листового материала.">
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                                {plan.sheets.map((sheet, index) => <PlywoodCutMap key={sheet.id} sheet={sheet} index={index} />)}
                            </div>
                        </Section>
                    )}
                </section>
            )}

            {!importResult && (
                <div className="rounded-xl border border-border bg-background/20 p-6 text-center text-sm text-text-secondary">
                    <Icon name="file" className="mx-auto h-7 w-7" />
                    <p className="mt-2">После загрузки здесь появятся проверка строк, этапы и настройки раскроя.</p>
                </div>
            )}
        </main>
    );
};

const IssueRow: React.FC<{ issue: CuttingImportIssue }> = ({ issue }) => {
    const isError = issue.severity === 'error';
    return (
        <div className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${isError ? 'border-red-500/40 bg-red-500/10 text-red-200' : 'border-amber-500/40 bg-amber-500/10 text-amber-100'}`}>
            <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
            <span><span className="font-semibold">Строка {issue.sourceRow}.</span> {issue.message}</span>
        </div>
    );
};

const NumberField: React.FC<{
    label: string;
    value: number;
    min: number;
    step: number;
    hint?: string;
    onChange: (value: number) => void;
}> = ({ label, value, min, step, hint, onChange }) => (
    <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-text-secondary">{label}</span>
        <input type="number" value={Number.isFinite(value) ? value : ''} min={min} step={step} onChange={event => onChange(event.target.value === '' ? Number.NaN : event.target.valueAsNumber)} className={`${inputClass} tabular-nums`} />
        {hint && <span className="mt-1 block text-xs text-text-secondary">{hint}</span>}
    </label>
);

const PurchaseTable: React.FC<{ plan: CuttingPlan; type: 'boards' | 'sheets' }> = ({ plan, type }) => {
    const isBoards = type === 'boards';
    return (
        <div className="overflow-hidden rounded-lg border border-border">
            <h3 className="border-b border-border bg-background/60 px-3 py-2 text-sm font-semibold text-text-primary">{isBoards ? 'Пиломатериал' : 'Листовой материал'}</h3>
            <div className="overflow-x-auto">
                <table className="w-full min-w-[460px] text-left text-sm">
                    <thead className="text-xs text-text-secondary">
                        {isBoards ? <tr><th className="px-3 py-2 font-medium">Сечение</th><th className="px-3 py-2 font-medium">Длина</th><th className="px-3 py-2 font-medium">Кол-во</th><th className="px-3 py-2 font-medium">Объём</th></tr> : <tr><th className="px-3 py-2 font-medium">Материал</th><th className="px-3 py-2 font-medium">Лист</th><th className="px-3 py-2 font-medium">Кол-во</th></tr>}
                    </thead>
                    <tbody className="divide-y divide-border">
                        {isBoards ? plan.boardPurchase.map(row => (
                            <tr key={`${row.section}-${row.stockLength}`}><td className="px-3 py-2 font-medium">{row.section}</td><td className="px-3 py-2 tabular-nums">{formatNumber(row.stockLength)} мм</td><td className="px-3 py-2 tabular-nums">{row.quantity} шт.</td><td className="px-3 py-2 tabular-nums text-text-secondary">{formatNumber(row.volumeM3)} м³</td></tr>
                        )) : plan.sheetPurchase.map(row => (
                            <tr key={`${row.material}-${row.thickness}-${row.sheetWidth}-${row.sheetHeight}`}><td className="px-3 py-2 font-medium">{row.material}{row.thickness ? ` · ${formatNumber(row.thickness)} мм` : ''}</td><td className="px-3 py-2 tabular-nums">{formatNumber(row.sheetWidth)} × {formatNumber(row.sheetHeight)}</td><td className="px-3 py-2 tabular-nums">{row.quantity} шт.</td></tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default Cutting;
