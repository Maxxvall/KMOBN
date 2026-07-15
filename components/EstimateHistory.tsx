import React, { useState, useMemo, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Estimate, EstimateStatus, ProjectTemplate, View } from '../types';
import { findEstimateVersionDuplicates, getLatestEstimateVersions, type EstimateDuplicateDeleteRequest, type EstimateDuplicateGroup } from '../services/estimateIntelligence';
import { exportData, importData, validateImportData } from '../services/database';

import { useOptionalEstimateContext } from '../contexts/EstimateContext';
import { useOptionalCatalogContext } from '../contexts/CatalogContext';
import SmartEstimateWizard from './SmartEstimateWizard';
import EstimateDuplicateDialog from './EstimateDuplicateDialog';

interface EstimateHistoryProps {
    estimates?: Estimate[];
    templates?: ProjectTemplate[];
    onCreateNew?: () => void;
    onEdit?: (estimate: Estimate) => void;
    onDelete?: (estimate: Estimate) => void;
    onDeleteVersion?: (estimate: Estimate) => void;
    onGeneratePdf?: (estimate: Estimate) => void;
}

const statusColors: { [key in EstimateStatus]: string } = {
    [EstimateStatus.DRAFT]: 'border border-amber-500/30 bg-amber-500/10 text-amber-200',
    [EstimateStatus.SENT]: 'border border-sky-500/30 bg-sky-500/10 text-sky-200',
    [EstimateStatus.APPROVED]: 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
};

const HistoryActionsMenu: React.FC<{
    desktop?: boolean;
    onExport: () => void | Promise<void>;
    onImport: () => void;
    onCheckDuplicates: () => void;
}> = ({ desktop = false, onExport, onImport, onCheckDuplicates }) => {
    const [open, setOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!open) return;
        const handlePointerDown = (event: MouseEvent) => {
            if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setOpen(false);
        };
        document.addEventListener('mousedown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('mousedown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [open]);

    const runAction = (action: () => void | Promise<void>) => {
        setOpen(false);
        void action();
    };

    return (
        <div ref={menuRef} className="relative">
            <button
                type="button"
                onClick={() => setOpen(value => !value)}
                aria-haspopup="menu"
                aria-expanded={open}
                className={`${desktop ? 'h-9' : 'min-h-11'} flex items-center justify-center rounded-lg border border-border bg-background/50 px-3 text-sm font-medium text-text-primary transition hover:border-text-secondary hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-primary/50`}
            >
                Ещё
            </button>
            {open && (
                <div role="menu" className="absolute right-0 z-20 mt-2 w-52 overflow-hidden rounded-lg border border-border bg-surface p-1 shadow-2xl">
                    <button type="button" role="menuitem" onClick={() => runAction(onExport)} className="w-full rounded-md px-3 py-2.5 text-left text-sm text-text-primary hover:bg-white/5">Экспорт данных</button>
                    <button type="button" role="menuitem" onClick={() => runAction(onImport)} className="w-full rounded-md px-3 py-2.5 text-left text-sm text-text-primary hover:bg-white/5">Импорт данных</button>
                    <button type="button" role="menuitem" onClick={() => runAction(onCheckDuplicates)} className="w-full rounded-md px-3 py-2.5 text-left text-sm text-text-primary hover:bg-white/5">Найти дубли версий</button>
                </div>
            )}
        </div>
    );
};

const VersionDropdown: React.FC<{
    versions: Estimate[];
    selectedId: string;
    onSelect: (id: string) => void;
    onDelete: (estimate: Estimate) => void;
}> = ({ versions, selectedId, onSelect, onDelete }) => {
    const [open, setOpen] = useState(false);
    const buttonRef = useRef<HTMLButtonElement | null>(null);
    const popupRef = useRef<HTMLDivElement | null>(null);
    const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
    const [rect, setRect] = useState<DOMRect | null>(null);
    const listboxId = useId();

    const closeDropdown = (restoreFocus = false) => {
        setOpen(false);
        if (restoreFocus) {
            requestAnimationFrame(() => buttonRef.current?.focus());
        }
    };

    useEffect(() => {
        if (!open) return;

        const handler = (e: MouseEvent) => {
            const target = e.target as Node | null;
            if (buttonRef.current && buttonRef.current.contains(target)) return;
            if (popupRef.current && target && popupRef.current.contains(target)) return;
            closeDropdown();
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') closeDropdown(true);
        };
        document.addEventListener('mousedown', handler);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('mousedown', handler);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const selectedIndex = Math.max(0, versions.findIndex(version => version.id === selectedId));
        const frame = requestAnimationFrame(() => optionRefs.current[selectedIndex]?.focus());
        return () => cancelAnimationFrame(frame);
    }, [open, selectedId, versions]);

    useEffect(() => {
        if (!open) return;

        const updateRect = () => {
            if (buttonRef.current) setRect(buttonRef.current.getBoundingClientRect());
        };

        updateRect();
        window.addEventListener('resize', updateRect);
        window.addEventListener('scroll', updateRect, true);
        return () => {
            window.removeEventListener('resize', updateRect);
            window.removeEventListener('scroll', updateRect, true);
        };
    }, [open]);

    const selected = versions.find(v => v.id === selectedId) ?? versions[0];
    const selectedLabel = selected
        ? `v${selected.version} (${new Date(selected.date).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })})`
        : 'Выбрать версию';
    const popupWidth = Math.min(240, Math.max(0, window.innerWidth - 16));
    const popupLeft = rect
        ? Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - popupWidth - 8))
        : 8;
    const estimatedPopupHeight = Math.min(288, versions.length * 45 + 8);
    const spaceBelow = rect ? window.innerHeight - rect.bottom - 8 : 0;
    const spaceAbove = rect ? rect.top - 8 : 0;
    const openAbove = Boolean(rect && spaceBelow < Math.min(estimatedPopupHeight, 180) && spaceAbove > spaceBelow);
    const popupMaxHeight = Math.max(44, Math.min(288, openAbove ? spaceAbove : spaceBelow));
    const popupTop = rect
        ? openAbove
            ? Math.max(8, rect.top - Math.min(estimatedPopupHeight, popupMaxHeight) - 6)
            : rect.bottom + 6
        : 8;

    return (
        <div className="inline-flex min-w-0 flex-1 sm:flex-none">
            <button
                ref={buttonRef}
                type="button"
                onClick={() => setOpen(v => !v)}
                className="flex min-h-11 w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-border bg-background/60 px-2.5 py-1.5 text-left text-sm transition hover:border-text-secondary hover:bg-white/[0.03] focus:outline-none focus:ring-2 focus:ring-primary/50 sm:w-[168px] md:min-h-9"
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-controls={open ? listboxId : undefined}
            >
                <span className="truncate" title={selected ? selectedLabel : undefined}>{selectedLabel}</span>
                <span aria-hidden="true" className={`shrink-0 text-xs text-text-secondary transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
            </button>

            {open && rect && createPortal(
                <div
                    ref={popupRef}
                    data-version-popup
                    style={{
                        position: 'fixed',
                        left: popupLeft,
                        top: popupTop,
                        width: popupWidth,
                        maxWidth: 'calc(100vw - 16px)',
                        zIndex: 9999,
                      }}
                    className="overflow-hidden rounded-xl border border-border bg-surface shadow-2xl"
                >
                    <div id={listboxId} role="listbox" aria-label="Версии сметы" style={{ maxHeight: popupMaxHeight }} className="overflow-auto p-1">
                        {versions.map((v, index) => (
                            <div
                                key={v.id}
                                role="presentation"
                                className={`flex items-center gap-1 rounded-lg text-sm transition-colors hover:bg-background/50 ${v.id === selectedId ? 'bg-background/60' : ''}`}
                            >
                                <button
                                    ref={node => { optionRefs.current[index] = node; }}
                                    type="button"
                                    role="option"
                                    aria-selected={v.id === selectedId}
                                    className="min-h-11 min-w-0 flex-1 whitespace-nowrap rounded-lg px-2.5 text-left focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary/50 md:min-h-9"
                                    onKeyDown={event => {
                                        let nextIndex = index;
                                        const isNavigationKey = ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key);
                                        if (event.key === 'ArrowDown') nextIndex = (index + 1) % versions.length;
                                        if (event.key === 'ArrowUp') nextIndex = (index - 1 + versions.length) % versions.length;
                                        if (event.key === 'Home') nextIndex = 0;
                                        if (event.key === 'End') nextIndex = versions.length - 1;
                                        if (isNavigationKey) {
                                            event.preventDefault();
                                            optionRefs.current[nextIndex]?.focus();
                                        }
                                    }}
                                    onClick={() => {
                                        onSelect(v.id);
                                        closeDropdown(true);
                                    }}
                                >
                                    <span className="font-semibold">v{v.version}</span>{' '}
                                    <span className="text-text-secondary">({new Date(v.date).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })})</span>
                                </button>
                                <button
                                    type="button"
                                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-red-500/10 hover:text-red-300 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-red-400/60 md:h-9 md:w-9"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onDelete(v);
                                    }}
                                    aria-label={`Удалить версию v${v.version}`}
                                >
                                    ✖
                                </button>
                            </div>
                        ))}
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

const EstimateHistory: React.FC<EstimateHistoryProps> = ({ estimates, templates: _templates, onCreateNew, onEdit, onDelete, onDeleteVersion, onGeneratePdf }) => {
    const estimateContext = useOptionalEstimateContext();
    const estimateList = useMemo(() => estimates ?? estimateContext?.estimates ?? [], [estimates, estimateContext?.estimates]);
    const allEstimatesList = useMemo(() => estimateContext?.allEstimates ?? estimateList, [estimateContext?.allEstimates, estimateList]);
    const createNewAction = onCreateNew ?? estimateContext?.actions.onCreateNew;
    const editAction = onEdit ?? estimateContext?.actions.onEdit;
    const deleteAction = onDelete ?? estimateContext?.actions.onDelete;
    const deleteVersionAction = onDeleteVersion ?? estimateContext?.actions.onDeleteVersion;
    const deleteVersionDuplicatesAction = estimateContext?.actions.onDeleteVersionDuplicates;
    const generatePdfAction = onGeneratePdf ?? estimateContext?.actions.onGeneratePdf;
    const setArchivedAction = estimateContext?.actions.onSetArchived;

    const [filterClient, setFilterClient] = useState('');
    const [filterStatus, setFilterStatus] = useState<EstimateStatus | 'all'>('all');
    const [archiveView, setArchiveView] = useState<'current' | 'archive'>('current');
    const [filterBuildingType, setFilterBuildingType] = useState<string>('');
    const [filterAreaMin, setFilterAreaMin] = useState('');
    const [filterAreaMax, setFilterAreaMax] = useState('');
    const [selectedVersions, setSelectedVersions] = useState<Record<string, string>>({});
    const catalogContext = useOptionalCatalogContext();
    const materialsList = catalogContext?.materials ?? [];
    const worksList = catalogContext?.works ?? [];
    const [showQuickStart, setShowQuickStart] = useState(false);
    const [showFilters, setShowFilters] = useState(false);
    const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
    const [duplicateGroups, setDuplicateGroups] = useState<EstimateDuplicateGroup[]>([]);
    const hasActiveFilters = filterClient !== '' || filterStatus !== 'all' || filterBuildingType !== '' || filterAreaMin !== '' || filterAreaMax !== '';
    const activeFilterCount = [filterClient, filterBuildingType, filterAreaMin, filterAreaMax].filter(Boolean).length + (filterStatus === 'all' ? 0 : 1);
    const archiveCounts = useMemo(() => getLatestEstimateVersions(allEstimatesList).reduce((counts, estimate) => {
        counts[estimate.isArchived ? 'archive' : 'current'] += 1;
        return counts;
    }, { current: 0, archive: 0 }), [allEstimatesList]);

    const resetFilters = () => {
        setFilterClient('');
        setFilterStatus('all');
        setFilterBuildingType('');
        setFilterAreaMin('');
        setFilterAreaMax('');
    };

    const handleCheckDuplicates = () => {
        const groups = findEstimateVersionDuplicates(allEstimatesList);
        setDuplicateGroups(groups);
        setShowDuplicateDialog(true);
    };

    const handleDeleteDuplicates = async (requests: EstimateDuplicateDeleteRequest[]): Promise<number> => {
        if (!deleteVersionDuplicatesAction) return 0;
        return deleteVersionDuplicatesAction(requests);
    };

    const handleExportData = async () => {
        try {
            const data = await exportData();
            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `backup-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            alert('Данные экспортированы успешно!');
        } catch (error) {
            console.error('Export failed:', error);
            alert('Ошибка при экспорте данных.');
        }
    };

    const handleImportData = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;
            try {
                const text = await file.text();
                const validation = validateImportData(text);
                if (validation.ok === false) {
                    alert(validation.error);
                    return;
                }
                const result = await importData(text);

                const lines: string[] = [];

                if (result.estimates.added > 0 || result.estimates.updated > 0 || result.estimates.unchanged > 0) {
                    const parts: string[] = [];
                    if (result.estimates.added > 0) parts.push(`${result.estimates.added} новых`);
                    if (result.estimates.updated > 0) parts.push(`${result.estimates.updated} изменено`);
                    if (result.estimates.unchanged > 0) parts.push(`${result.estimates.unchanged} без изменений`);
                    if (result.estimates.inFileDuplicates > 0) parts.push(`${result.estimates.inFileDuplicates} дублей в файле`);
                    lines.push(`Сметы: ${parts.join(', ')}`);
                }

                if (result.templates.added > 0 || result.templates.updated > 0 || result.templates.unchanged > 0) {
                    const parts: string[] = [];
                    if (result.templates.added > 0) parts.push(`${result.templates.added} новых`);
                    if (result.templates.updated > 0) parts.push(`${result.templates.updated} изменено`);
                    if (result.templates.unchanged > 0) parts.push(`${result.templates.unchanged} без изменений`);
                    lines.push(`Шаблоны: ${parts.join(', ')}`);
                }

                if (result.materials.added > 0 || result.materials.updated > 0 || result.materials.unchanged > 0) {
                    const parts: string[] = [];
                    if (result.materials.added > 0) parts.push(`${result.materials.added} новых`);
                    if (result.materials.updated > 0) parts.push(`${result.materials.updated} изменено`);
                    if (result.materials.unchanged > 0) parts.push(`${result.materials.unchanged} без изменений`);
                    if (result.materials.inFileDuplicates > 0) parts.push(`${result.materials.inFileDuplicates} дублей в файле`);
                    lines.push(`Материалы: ${parts.join(', ')}`);
                }

                if (result.works.added > 0 || result.works.updated > 0 || result.works.unchanged > 0) {
                    const parts: string[] = [];
                    if (result.works.added > 0) parts.push(`${result.works.added} новых`);
                    if (result.works.updated > 0) parts.push(`${result.works.updated} изменено`);
                    if (result.works.unchanged > 0) parts.push(`${result.works.unchanged} без изменений`);
                    if (result.works.inFileDuplicates > 0) parts.push(`${result.works.inFileDuplicates} дублей в файле`);
                    lines.push(`Работы: ${parts.join(', ')}`);
                }

                if (result.bundles.added > 0 || result.bundles.updated > 0 || result.bundles.unchanged > 0) {
                    const parts: string[] = [];
                    if (result.bundles.added > 0) parts.push(`${result.bundles.added} новых`);
                    if (result.bundles.updated > 0) parts.push(`${result.bundles.updated} изменено`);
                    if (result.bundles.unchanged > 0) parts.push(`${result.bundles.unchanged} без изменений`);
                    lines.push(`Комплекты: ${parts.join(', ')}`);
                }

                if (result.salaryCalculations.added > 0) {
                    lines.push(`Расчёт з/п: ${result.salaryCalculations.added} новых`);
                }

                alert(lines.length > 0
                    ? `Импорт завершён:\n\n${lines.join('\n')}`
                    : 'Данные импортированы, новых записей нет.');
                window.dispatchEvent(new CustomEvent('kmobn:data-imported'));
            } catch (error) {
                console.error('Import failed:', error);
                alert(error instanceof Error ? error.message : 'Ошибка при импорте данных. Проверьте файл.');
            }
        };
        input.click();
    };

    const filteredEstimates = useMemo(() => {
        const source = archiveView === 'archive' ? allEstimatesList : estimateList;
        const latestEstimates = getLatestEstimateVersions(source)
            .filter(e => archiveView === 'archive' ? e.isArchived : !e.isArchived);
        return latestEstimates
            .filter(e => filterClient === '' || e.client.toLowerCase().includes(filterClient.toLowerCase()))
            .filter(e => filterStatus === 'all' || e.status === filterStatus)
            .filter(e => filterBuildingType === '' || e.buildingType.toLowerCase().includes(filterBuildingType.toLowerCase()))
            .filter(e => {
                const min = filterAreaMin === '' ? 0 : parseFloat(filterAreaMin);
                const max = filterAreaMax === '' ? Infinity : parseFloat(filterAreaMax);
                return e.area >= min && e.area <= max;
            })
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [estimateList, allEstimatesList, archiveView, filterClient, filterStatus, filterBuildingType, filterAreaMin, filterAreaMax]);
    
    const getVersionHistory = (estimate: Estimate) => {
        const groupKey = estimate.estimateNumber;
        return allEstimatesList
            .filter(e => e.estimateNumber === groupKey)
            .sort((a, b) => b.version - a.version);
    }

    const getSelectedVersionEstimate = (estimate: Estimate): Estimate => {
        const groupKey = estimate.estimateNumber;
        const selectedVersionId = selectedVersions[groupKey];
        
        if (selectedVersionId) {
            const selectedEstimate = allEstimatesList.find(e => e.id === selectedVersionId);
            if (selectedEstimate) return selectedEstimate;
        }
        
        return estimate;
    }

    const handleVersionChange = (groupKey: string, versionId: string) => {
        setSelectedVersions(prev => ({
            ...prev,
            [groupKey]: versionId
        }));
    }

    useEffect(() => {
        // Ensure every parent chain has a selected version (default to latest)
        setSelectedVersions(prev => {
            const next = { ...prev };
            let changed = false;

            // Collect all estimate numbers present in estimates
            const groupKeys = new Set<string>();
            estimateList.forEach(e => groupKeys.add(e.estimateNumber));

            groupKeys.forEach(groupKey => {
                const versionHistory = estimateList
                    .filter(e => e.estimateNumber === groupKey)
                    .sort((a, b) => b.version - a.version);

                if (versionHistory.length === 0) {
                    if (next[groupKey]) {
                        delete next[groupKey];
                        changed = true;
                    }
                    return;
                }

                const latestId = versionHistory[0].id;
                // if no selection for this parent or current selection no longer exists — set to latest
                if (!next[groupKey] || !estimateList.some(e => e.id === next[groupKey])) {
                    next[groupKey] = latestId;
                    changed = true;
                }
            });

            return changed ? next : prev;
        });
    }, [estimateList]);

    return (
        <div className="rounded-xl border border-border bg-surface p-3 shadow-lg sm:p-4 md:p-5">
            <div className="mb-4 flex flex-col gap-3 border-b border-border/70 pb-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                    <h2 className="text-lg font-semibold tracking-tight text-text-primary">История смет</h2>
                    <p className="mt-0.5 text-xs text-text-secondary">
                        {hasActiveFilters ? `Найдено: ${filteredEstimates.length}` : `Активных смет: ${filteredEstimates.length}`}
                    </p>
                </div>
                <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
                    <button
                        type="button"
                        onClick={() => setShowQuickStart(true)}
                        className="min-h-11 rounded-lg border border-border bg-background/50 px-3 text-sm font-medium text-text-primary transition hover:border-text-secondary hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-primary/50 sm:min-h-9"
                    >
                        Быстрый старт
                    </button>
                    <button
                        type="button"
                        onClick={() => createNewAction?.()}
                        className="min-h-11 rounded-lg bg-primary px-3 text-sm font-semibold text-white transition hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-surface active:scale-[0.98] sm:min-h-9"
                    >
                        Создать смету
                    </button>
                </div>
            </div>

            <div className="mb-4 inline-flex rounded-lg border border-border bg-background/40 p-1" role="tablist" aria-label="Состояние смет">
                <button type="button" role="tab" aria-selected={archiveView === 'current'} onClick={() => setArchiveView('current')} className={`min-h-9 rounded-md px-4 text-sm font-medium transition ${archiveView === 'current' ? 'bg-primary text-white' : 'text-text-secondary hover:text-text-primary'}`}>Текущие {archiveCounts.current}</button>
                <button type="button" role="tab" aria-selected={archiveView === 'archive'} onClick={() => setArchiveView('archive')} className={`min-h-9 rounded-md px-4 text-sm font-medium transition ${archiveView === 'archive' ? 'bg-primary text-white' : 'text-text-secondary hover:text-text-primary'}`}>Архив {archiveCounts.archive}</button>
            </div>

            <div className="mb-4 flex items-center gap-2 xl:hidden">
                <button
                    type="button"
                    onClick={() => setShowFilters(prev => !prev)}
                    aria-expanded={showFilters}
                    className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-border bg-background/50 px-3 text-sm font-medium text-text-primary transition hover:border-text-secondary hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                    Фильтры
                    {activeFilterCount > 0 && (
                        <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">{activeFilterCount}</span>
                    )}
                </button>
                <HistoryActionsMenu onExport={handleExportData} onImport={handleImportData} onCheckDuplicates={handleCheckDuplicates} />
            </div>

            <div className="mb-4 hidden items-center gap-2 xl:flex">
                <label className="min-w-[220px] flex-1">
                    <span className="sr-only">Клиент</span>
                    <input type="text" placeholder="Клиент" className="h-9 w-full rounded-lg border border-border bg-background/60 px-3 text-sm text-text-primary placeholder:text-text-secondary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30" value={filterClient} onChange={(e) => setFilterClient(e.target.value)} />
                </label>
                <label>
                    <span className="sr-only">Статус</span>
                    <select className="h-9 w-40 rounded-lg border border-border bg-background/60 px-2.5 text-sm text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as EstimateStatus | 'all')}>
                        <option value="all">Все статусы</option>
                        {Object.values(EstimateStatus).map(status => <option key={status} value={status}>{status}</option>)}
                    </select>
                </label>
                <label>
                    <span className="sr-only">Тип строения</span>
                    <input type="text" placeholder="Тип строения" className="h-9 w-44 rounded-lg border border-border bg-background/60 px-3 text-sm text-text-primary placeholder:text-text-secondary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30" value={filterBuildingType} onChange={(e) => setFilterBuildingType(e.target.value)} />
                </label>
                <div className="flex items-center gap-1.5" aria-label="Площадь">
                    <input type="number" placeholder="м² от" aria-label="Площадь от" className="h-9 w-24 rounded-lg border border-border bg-background/60 px-2.5 text-sm text-text-primary placeholder:text-text-secondary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30" value={filterAreaMin} onChange={(e) => setFilterAreaMin(e.target.value)} />
                    <input type="number" placeholder="до" aria-label="Площадь до" className="h-9 w-20 rounded-lg border border-border bg-background/60 px-2.5 text-sm text-text-primary placeholder:text-text-secondary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30" value={filterAreaMax} onChange={(e) => setFilterAreaMax(e.target.value)} />
                </div>
                {hasActiveFilters && (
                    <button type="button" onClick={resetFilters} className="h-9 rounded-lg px-2.5 text-sm text-text-secondary transition hover:bg-white/5 hover:text-text-primary">Сбросить</button>
                )}
                <div className="ml-auto">
                    <HistoryActionsMenu desktop onExport={handleExportData} onImport={handleImportData} onCheckDuplicates={handleCheckDuplicates} />
                </div>
            </div>

            {showFilters && (
                <div className="mb-4 grid grid-cols-1 gap-3 rounded-lg border border-border bg-background/35 p-3 sm:grid-cols-2 xl:hidden">
                    <label className="text-xs font-medium text-text-secondary">
                        Клиент
                        <input type="text" placeholder="Имя или компания" className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-text-primary placeholder:text-text-secondary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30" value={filterClient} onChange={(e) => setFilterClient(e.target.value)} />
                    </label>
                    <label className="text-xs font-medium text-text-secondary">
                        Статус
                        <select className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as EstimateStatus | 'all')}>
                            <option value="all">Все статусы</option>
                            {Object.values(EstimateStatus).map(status => <option key={status} value={status}>{status}</option>)}
                        </select>
                    </label>
                    <label className="text-xs font-medium text-text-secondary">
                        Тип строения
                        <input type="text" placeholder="Например, каркасный дом" className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-text-primary placeholder:text-text-secondary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30" value={filterBuildingType} onChange={(e) => setFilterBuildingType(e.target.value)} />
                    </label>
                    <fieldset>
                        <legend className="text-xs font-medium text-text-secondary">Площадь, м²</legend>
                        <div className="mt-1 flex gap-2">
                            <input type="number" placeholder="От" aria-label="Площадь от" className="min-h-11 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-sm text-text-primary placeholder:text-text-secondary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30" value={filterAreaMin} onChange={(e) => setFilterAreaMin(e.target.value)} />
                            <input type="number" placeholder="До" aria-label="Площадь до" className="min-h-11 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-sm text-text-primary placeholder:text-text-secondary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30" value={filterAreaMax} onChange={(e) => setFilterAreaMax(e.target.value)} />
                        </div>
                    </fieldset>
                    {hasActiveFilters && (
                        <button type="button" onClick={resetFilters} className="min-h-11 rounded-lg border border-border px-3 text-sm font-medium text-text-secondary transition hover:bg-white/5 hover:text-text-primary sm:col-span-2">Сбросить фильтры</button>
                    )}
                </div>
            )}

            {/* Desktop table */}
            <div className="overflow-x-auto hidden md:block">
                <table className="min-w-full">
                    <thead>
                        <tr className="border-b border-border">
                            <th className="px-3 py-2 text-left text-xs font-medium text-text-secondary">Клиент и смета</th>
                            <th className="px-3 py-2 text-center text-xs font-medium text-text-secondary">Версия</th>
                            <th className="px-3 py-2 text-center text-xs font-medium text-text-secondary">Статус</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-text-secondary">Объект</th>
                            <th className="px-3 py-2 text-right text-xs font-medium text-text-secondary">Сумма</th>
                            <th className="px-3 py-2 text-right text-xs font-medium text-text-secondary">Действия</th>
                        </tr>
                    </thead>
                    <tbody className="text-text-primary">
                        {filteredEstimates.map(estimate => {
                            const groupKey = estimate.estimateNumber;
                            const selectedEstimate = getSelectedVersionEstimate(estimate);
                            const versionHistory = getVersionHistory(estimate);
                            
                            return (
                                <tr key={estimate.id} className="border-b border-border/70 transition-colors hover:bg-white/[0.03]">
                                    <td className="px-3 py-2.5 text-left">
                                        <div className="max-w-[240px] truncate text-sm font-medium">{selectedEstimate.client || 'Без клиента'}</div>
                                        <div className="mt-0.5 text-xs text-text-secondary">
                                            {selectedEstimate.estimateNumber} · {new Date(selectedEstimate.date).toLocaleDateString('ru-RU')}
                                        </div>
                                    </td>
                                    <td className="px-3 py-2.5 text-center">
                                        <VersionDropdown
                                            versions={versionHistory}
                                            selectedId={selectedVersions[groupKey] || (versionHistory[0] && versionHistory[0].id) || estimate.id}
                                            onSelect={(versionId) => handleVersionChange(groupKey, versionId)}
                                            onDelete={(estimateVersion) => deleteVersionAction?.(estimateVersion)}
                                        />
                                    </td>
                                    <td className="px-3 py-2.5 text-center">
                                        <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${statusColors[selectedEstimate.status]}`}>
                                            {selectedEstimate.status}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2.5 text-left">
                                        <div className="max-w-[180px] truncate text-sm">{selectedEstimate.buildingType || 'Не указан'}</div>
                                        <div className="mt-0.5 text-xs text-text-secondary">{selectedEstimate.area} м²</div>
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-2.5 text-right text-sm font-semibold">{selectedEstimate.total.toLocaleString('ru-RU')} ₽</td>
                                    <td className="px-3 py-2.5 text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            <button onClick={() => editAction?.(selectedEstimate)} className="rounded-md px-2 py-1.5 text-sm font-medium text-text-primary transition hover:bg-white/5">Открыть</button>
                                            <button onClick={() => generatePdfAction?.(selectedEstimate)} className="rounded-md px-2 py-1.5 text-sm font-medium text-text-secondary transition hover:bg-white/5 hover:text-text-primary">PDF для клиента</button>
                                            <button onClick={() => setArchivedAction?.(selectedEstimate, archiveView !== 'archive')} className="rounded-md px-2 py-1.5 text-sm font-medium text-text-secondary transition hover:bg-white/5 hover:text-text-primary">{archiveView === 'archive' ? 'Вернуть' : 'В архив'}</button>
                                            <button onClick={() => deleteAction?.(estimate)} className="rounded-md px-2 py-1.5 text-sm font-medium text-text-secondary transition hover:bg-red-500/10 hover:text-red-300">Удалить</button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                {filteredEstimates.length === 0 && (
                    <div className="py-10 text-center text-sm text-text-secondary">
                        <p>{hasActiveFilters ? 'По выбранным фильтрам смет не найдено' : 'Смет пока нет'}</p>
                        {hasActiveFilters && <button type="button" onClick={resetFilters} className="mt-2 rounded-md px-3 py-1.5 font-medium text-text-primary hover:bg-white/5">Сбросить фильтры</button>}
                    </div>
                )}
            </div>

            {/* Mobile card list */}
            <div className="md:hidden space-y-3">
                {filteredEstimates.map(estimate => {
                    const groupKey = estimate.estimateNumber;
                    const selectedEstimate = getSelectedVersionEstimate(estimate);
                    const versionHistory = getVersionHistory(estimate);

                    return (
                        <article key={estimate.id} className="rounded-lg border border-border bg-background/35 p-3">
                            <div className="flex items-start justify-between gap-2 mb-2">
                                <div className="min-w-0 flex-1">
                                    <div className="font-semibold text-text-primary truncate">{estimate.client || 'Без клиента'}</div>
                                    <div className="text-xs text-text-secondary">{estimate.estimateNumber} &middot; {estimate.area} м² &middot; {estimate.buildingType}</div>
                                </div>
                                <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium ${statusColors[selectedEstimate.status]}`}>
                                    {selectedEstimate.status}
                                </span>
                            </div>
                            <div className="text-xs text-text-secondary mb-2">
                                {new Date(estimate.date).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </div>
                            <div className="mb-3 flex min-w-0 flex-col items-stretch gap-2 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between min-[420px]:gap-3">
                                <VersionDropdown
                                    versions={versionHistory}
                                    selectedId={selectedVersions[groupKey] || (versionHistory[0] && versionHistory[0].id) || estimate.id}
                                    onSelect={(versionId) => handleVersionChange(groupKey, versionId)}
                                    onDelete={(estimateVersion) => deleteVersionAction?.(estimateVersion)}
                                />
                                <span className="shrink-0 self-end text-sm font-semibold text-text-primary min-[420px]:self-auto">{selectedEstimate.total.toLocaleString('ru-RU')} ₽</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <button onClick={() => editAction?.(selectedEstimate)} className="min-h-11 flex-1 rounded-lg bg-primary text-sm font-semibold text-white transition hover:bg-primary-hover">
                                    Открыть
                                </button>
                                <button onClick={() => generatePdfAction?.(selectedEstimate)} className="min-h-11 flex-1 rounded-lg border border-border bg-background/50 text-sm font-medium text-text-primary transition hover:bg-white/5">
                                    PDF клиенту
                                </button>
                                <button onClick={() => setArchivedAction?.(selectedEstimate, archiveView !== 'archive')} className="min-h-11 flex-1 rounded-lg border border-border bg-background/50 px-2 text-sm font-medium text-text-primary transition hover:bg-white/5">
                                    {archiveView === 'archive' ? 'Вернуть' : 'В архив'}
                                </button>
                                <button onClick={() => deleteAction?.(estimate)} aria-label={`Удалить смету ${estimate.estimateNumber}`} className="flex min-h-11 items-center justify-center rounded-lg border border-border text-sm font-medium text-text-secondary transition hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300">
                                    Удалить
                                </button>
                            </div>
                        </article>
                    );
                })}
                {filteredEstimates.length === 0 && (
                    <div className="py-8 text-center text-sm text-text-secondary">
                        <p>{hasActiveFilters ? 'По выбранным фильтрам смет не найдено' : 'Смет пока нет'}</p>
                        {hasActiveFilters && <button type="button" onClick={resetFilters} className="mt-2 min-h-11 rounded-lg border border-border px-3 font-medium text-text-primary">Сбросить фильтры</button>}
                    </div>
                )}
            </div>

            {showQuickStart && (
                <SmartEstimateWizard
                    isOpen={showQuickStart}
                    onClose={() => setShowQuickStart(false)}
                    onConfirm={(estimate) => {
                        estimateContext?.setCurrentEstimate(estimate);
                        estimateContext?.setView(View.EDITOR);
                        setShowQuickStart(false);
                    }}
                    estimates={estimateList}
                    materials={materialsList}
                    works={worksList}
                    existingEstimateNumbers={estimateList.map(e => e.estimateNumber)}
                />
            )}

            <EstimateDuplicateDialog
                isOpen={showDuplicateDialog}
                onClose={() => setShowDuplicateDialog(false)}
                duplicateGroups={duplicateGroups}
                onDelete={handleDeleteDuplicates}
            />
        </div>
    );
};

export default React.memo(EstimateHistory);
