import React, { Dispatch, SetStateAction } from 'react';
import { BoardInventoryState } from '../../services/boardMaterialSwitch';
import { BoardMoisture, Estimate, SectionId } from '../../types';
import {
    IconArrowSwapHorizontal,
    IconBookmark,
    IconBox,
    IconDiskette,
    IconEye,
    IconLayers,
    IconSettingSlidersHorizontal,
    IconSledgehammer,
    IconTruck,
} from '@devigner-ui/icons';

interface EstimateToolbarProps {
    estimate: Estimate;
    canCompare: boolean;
    setShowComparison: (open: boolean) => void;
    canSaveAsTemplate: boolean;
    onSaveAsTemplateAction?: (estimate: Estimate) => void;
    setBundlePickerOpen: (open: boolean) => void;
    boardInventoryState: BoardInventoryState;
    setBoardSwitchTarget: (target: BoardMoisture | null) => void;
    isArchived: boolean;
    addableCategoryIds: SectionId[];
    visibleCategories: SectionId[];
    sectionLabel: (category: SectionId) => string;
    addCategory: (category: SectionId) => void;
    onManageSectionsAction?: () => void;
    showActuals: boolean;
    setShowActuals: Dispatch<SetStateAction<boolean>>;
    subgroupTotals: { works: number; materials: number; delivery: number };
    handleSave: () => void;
}

// Нижняя панель инструментов редактора (юнит 1, interfaces.md). Главные
// действия — иконка + подпись, второстепенные — icon-only с title/aria-label
// (R13, R12i). Красный остаётся только у ИТОГО и «Сохранить».
export const EstimateToolbar: React.FC<EstimateToolbarProps> = ({
    estimate,
    canCompare,
    setShowComparison,
    canSaveAsTemplate,
    onSaveAsTemplateAction,
    setBundlePickerOpen,
    boardInventoryState,
    setBoardSwitchTarget,
    isArchived,
    addableCategoryIds,
    visibleCategories,
    sectionLabel,
    addCategory,
    onManageSectionsAction,
    showActuals,
    setShowActuals,
    subgroupTotals,
    handleSave,
}) => {
    const iconOnlyBtn =
        'flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 md:min-h-9 md:min-w-9';

    return (
        <div className="grid min-w-0 gap-2 rounded-lg border border-border/70 bg-background/25 p-2 xl:grid-cols-[minmax(200px,auto)_minmax(330px,1fr)_minmax(460px,auto)] xl:items-center">
            <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
                <span className="text-xs font-semibold tabular-nums text-text-secondary">
                    v{estimate.version} · {new Date(estimate.date).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                </span>
                {canCompare && (
                    <button
                        onClick={() => setShowComparison(true)}
                        aria-label="Сравнить с предыдущей версией"
                        title="Сравнить с предыдущей версией"
                        className={`${iconOnlyBtn} text-blue-400 hover:bg-white/5 hover:text-blue-300`}
                    >
                        <IconArrowSwapHorizontal aria-hidden="true" className="size-4" />
                    </button>
                )}
                {canSaveAsTemplate && (
                    <button
                        onClick={() => onSaveAsTemplateAction?.(estimate)}
                        aria-label="Сохранить как шаблон"
                        title="Сохранить как шаблон"
                        className={`${iconOnlyBtn} text-green-400 hover:bg-white/5 hover:text-green-300`}
                    >
                        <IconBookmark aria-hidden="true" className="size-4" />
                    </button>
                )}
            </div>
            <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4">
                <button
                    onClick={() => setBundlePickerOpen(true)}
                    className="flex min-h-[44px] min-w-0 items-center justify-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-sm text-text-primary transition hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary/50 md:min-h-9"
                >
                    <IconBox aria-hidden="true" className="size-4 shrink-0" />
                    Комплекты
                </button>
                <div
                    role="group"
                    aria-label="Выбрать тип доски во всей смете"
                    className="grid min-h-[44px] grid-cols-[auto_1fr_1fr] items-stretch overflow-hidden rounded-md border border-border bg-background md:min-h-9"
                    title={boardInventoryState === 'none' ? 'Сначала укажите параметры досок в разделе «Цены»' : 'Массовая замена доски во всей смете'}
                >
                    <span className="flex items-center px-2 text-[11px] font-semibold text-text-secondary">Доска</span>
                    {([
                        ['dry-planed', 'СС', 'Сухостроганая доска'],
                        ['natural-moisture', 'ЕВ', 'Естественной влажности'],
                    ] as Array<[BoardMoisture, string, string]>).map(([moisture, label, fullLabel]) => {
                        const isCurrent = boardInventoryState === moisture;
                        const disabled = boardInventoryState === 'none' || isCurrent || isArchived;
                        return (
                            <button
                                key={moisture}
                                type="button"
                                onClick={() => setBoardSwitchTarget(moisture)}
                                disabled={disabled}
                                aria-pressed={isCurrent}
                                title={fullLabel}
                                className={`min-w-[44px] border-l border-border px-2 text-xs font-bold transition focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary/60 ${isCurrent ? 'bg-primary text-white' : 'text-text-primary hover:bg-white/5'} disabled:cursor-not-allowed disabled:opacity-50`}
                            >
                                {label}
                            </button>
                        );
                    })}
                </div>
                <div className="flex min-w-0 items-center gap-1">
                    <select
                        aria-label="Добавить раздел"
                        onChange={(e) => {
                            const val = e.target.value as SectionId;
                            if (val) {
                                addCategory(val);
                                e.target.value = '';
                            }
                        }}
                        className="min-h-[44px] min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/50 md:min-h-9"
                        defaultValue=""
                    >
                        <option value="">+ Раздел...</option>
                        {addableCategoryIds.map((cat) => (
                            <option key={cat} value={cat} disabled={visibleCategories.includes(cat)}>{sectionLabel(cat)}</option>
                        ))}
                    </select>
                    {onManageSectionsAction && (
                        <button
                            type="button"
                            onClick={onManageSectionsAction}
                            aria-label="Управлять разделами"
                            title="Управлять разделами"
                            className={`${iconOnlyBtn} text-blue-400 hover:bg-white/5 hover:text-blue-300`}
                        >
                            <IconSettingSlidersHorizontal aria-hidden="true" className="size-4" />
                        </button>
                    )}
                </div>
                <button
                    type="button"
                    onClick={() => setShowActuals((prev) => !prev)}
                    aria-pressed={showActuals}
                    title="Показать фактические количество, цену и отклонения"
                    className={`flex min-h-[44px] min-w-0 items-center justify-center gap-1.5 rounded-md border px-2 py-1 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-primary/50 md:min-h-9 ${showActuals ? 'border-primary bg-primary text-white' : 'border-border bg-transparent text-text-secondary hover:border-primary hover:bg-background hover:text-text-primary'}`}
                >
                    <IconEye aria-hidden="true" className="size-4 shrink-0" />
                    Факт
                </button>
            </div>
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
                <div className="grid min-w-0 grid-cols-3 gap-x-2 gap-y-1 text-[11px] tabular-nums">
                    <span className="flex min-w-0 items-center gap-1 whitespace-nowrap text-text-secondary" title="Работы">
                        <IconSledgehammer aria-hidden="true" className="size-3.5 shrink-0" />
                        Р: <span className="font-semibold text-text-primary">{subgroupTotals.works.toLocaleString('ru-RU')}&nbsp;₽</span>
                    </span>
                    <span className="flex min-w-0 items-center gap-1 whitespace-nowrap text-text-secondary" title="Материалы">
                        <IconLayers aria-hidden="true" className="size-3.5 shrink-0" />
                        М: <span className="font-semibold text-text-primary">{subgroupTotals.materials.toLocaleString('ru-RU')}&nbsp;₽</span>
                    </span>
                    <span className="flex min-w-0 items-center gap-1 whitespace-nowrap text-text-secondary" title="Доставка">
                        <IconTruck aria-hidden="true" className="size-3.5 shrink-0" />
                        Д: <span className="font-semibold text-text-primary">{subgroupTotals.delivery.toLocaleString('ru-RU')}&nbsp;₽</span>
                    </span>
                    <span className="col-span-3 whitespace-nowrap text-sm font-bold text-primary">ИТОГО: {estimate.total.toLocaleString('ru-RU')}&nbsp;₽</span>
                </div>
                <button
                    onClick={handleSave}
                    className="flex min-h-[44px] items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-primary px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary/50 active:scale-95 md:min-h-9"
                >
                    <IconDiskette aria-hidden="true" className="size-4 shrink-0" />
                    Сохранить
                </button>
            </div>
        </div>
    );
};
