import React, { useState, useEffect } from 'react';
import { IconClose, IconRefresh } from '@devigner-ui/icons';
import { DuplicateGroup, Material, Work, EstimateCategory, type SectionId } from '../types';
import { getCatalogDuplicateFingerprint, selectPreferredCatalogDuplicate, type CatalogDuplicateDecision } from '../services/duplicateManagement';
import { formatCatalogItemClipboard } from '../services/estimateClipboard';
import { getSectionLabel } from '../services/estimateSections';
import { useOptionalEstimateSections } from '../contexts/EstimateSectionsContext';
import { CopyButton } from './ui/copy-button';

interface DuplicateCheckerDialogProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    duplicateGroups: DuplicateGroup<Material | Work>[];
    onMerge: (decisions: CatalogDuplicateDecision[]) => Promise<number>;
}

const DuplicateCheckerDialog: React.FC<DuplicateCheckerDialogProps> = ({
    isOpen,
    onClose,
    title,
    duplicateGroups,
    onMerge,
}) => {
    const sectionsContext = useOptionalEstimateSections();
    const [survivorByKey, setSurvivorByKey] = useState<Record<string, string>>({});
    const [isMerging, setIsMerging] = useState(false);
    const [mergeResult, setMergeResult] = useState<{ success: boolean; message: string } | null>(null);

    // Auto-select best item in each group on open
    useEffect(() => {
        if (!isOpen || duplicateGroups.length === 0) return;
        const initial: Record<string, string> = {};
        for (const group of duplicateGroups) {
            const best = selectPreferredCatalogDuplicate(group.items);
            if (best) initial[group.normalizedKey] = best.id;
        }
        setSurvivorByKey(initial);
        setMergeResult(null);
    }, [isOpen, duplicateGroups]);

    if (!isOpen) return null;

    const selectSurvivor = (normalizedKey: string, itemId: string) => {
        setSurvivorByKey(prev => ({ ...prev, [normalizedKey]: itemId }));
    };

    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    const selectBestInGroup = (group: DuplicateGroup<Material | Work>) => {
        const bestItem = selectPreferredCatalogDuplicate(group.items);
        if (bestItem) selectSurvivor(group.normalizedKey, bestItem.id);
    };

    const handleMergeAll = async () => {
        setIsMerging(true);
        setMergeResult(null);
        try {
            const decisions: CatalogDuplicateDecision[] = duplicateGroups.map(group => {
                const survivorId = survivorByKey[group.normalizedKey] ?? selectPreferredCatalogDuplicate(group.items)?.id;
                if (!survivorId) throw new Error('Не удалось выбрать сохраняемую запись.');
                return {
                    normalizedKey: group.normalizedKey,
                    survivorId,
                    expectedItems: group.items.map(item => ({
                        id: item.id,
                        fingerprint: getCatalogDuplicateFingerprint(item),
                    })),
                };
            });
            const totalDeleted = await onMerge(decisions);
            const parts: string[] = [];
            if (totalDeleted > 0) parts.push(`удалено: ${totalDeleted}`);
            setMergeResult({ success: true, message: parts.join(', ') || 'Нечего удалять' });
            setTimeout(() => {
                setMergeResult(null);
                onClose();
            }, 1200);
        } catch (error) {
            setMergeResult({ success: false, message: error instanceof Error ? error.message : 'Ошибка при удалении' });
        } finally {
            setIsMerging(false);
        }
    };

    const totalToDelete = duplicateGroups.reduce((sum, g) => {
        return sum + Math.max(0, g.items.length - 1);
    }, 0);

    const formatPrice = (price: number) => {
        return new Intl.NumberFormat('ru-RU').format(price) + ' ₽';
    };

    // Спиннера в @devigner-ui/icons нет — ближайшая по смыслу IconRefresh c animate-spin (R01.1).
    const Spinner = () => (
        <IconRefresh aria-hidden="true" className="animate-spin mr-1 h-4 w-4 inline-block" />
    );

    // Копия группы: «имя — цена» выжившего (формат из estimateClipboard) + его ID (R09.2).
    const groupCopyText = (group: DuplicateGroup<Material | Work>): string => {
        const survivorId = survivorByKey[group.normalizedKey] ?? selectPreferredCatalogDuplicate(group.items)?.id;
        const survivor = group.items.find(item => item.id === survivorId) ?? group.items[0];
        if (!survivor) return '';
        return `${formatCatalogItemClipboard({ name: survivor.name, price: survivor.price })}\nID: ${survivor.id}`;
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
            onClick={handleBackdropClick}
        >
            <div className="bg-surface p-6 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold text-text-primary">{title}</h2>
                    <button
                        onClick={onClose}
                        className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:text-text-primary transition-colors"
                        aria-label="Закрыть"
                    >
                        <IconClose aria-hidden="true" className="size-5" />
                    </button>
                </div>

                {mergeResult && (
                    <div className={`mb-4 p-3 rounded-lg text-sm font-semibold ${
                        mergeResult.success
                            ? 'bg-green-500/20 border border-green-500/40 text-green-300'
                            : 'bg-red-500/20 border border-red-500/40 text-red-300'
                    }`}>
                        {mergeResult.message}
                    </div>
                )}

                {duplicateGroups.length === 0 ? (
                    <div className="text-center py-8">
                        <div className="text-4xl mb-4">✅</div>
                        <p className="text-text-secondary text-lg">Дубликатов не найдено</p>
                    </div>
                ) : (
                    <>
                        <p className="text-text-secondary mb-2 text-sm">
                            Найдено групп: {duplicateGroups.length}. Автоматически выбран элемент из каждой группы.
                        </p>
                        <p className="text-text-secondary mb-4 text-sm">
                            Сохранится ровно одна наиболее полная и свежая запись. При необходимости выберите другую.
                        </p>

                        <div className="flex gap-3 mb-4">
                            <button
                                onClick={handleMergeAll}
                                disabled={isMerging || totalToDelete === 0}
                                className="bg-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded-md transition"
                            >
                                {isMerging ? <><Spinner /> Удаление...</> : `Удалить дубли (${totalToDelete})`}
                            </button>
                            <button
                                onClick={onClose}
                                disabled={isMerging}
                                className="bg-border hover:bg-border/80 disabled:opacity-50 text-text-primary font-bold py-2 px-4 rounded-md transition"
                            >
                                Отмена
                            </button>
                        </div>

                        <div className="space-y-4">
                            {duplicateGroups.map(group => {
                                const hasGeneral = group.items.some(
                                    item => 'category' in item && item.category === EstimateCategory.GENERAL
                                );
                                return (
                                    <div key={group.normalizedKey} className="bg-background rounded-lg p-4 border border-border">
                                        <div className="flex items-center justify-between gap-2 mb-3">
                                            <h3 className="min-w-0 text-text-primary font-semibold">
                                                «{group.displayName}»
                                                <span className="ml-2 text-sm text-text-secondary">
                                                    ({group.items.length} шт.)
                                                    <span className="ml-2 text-green-400">— останется: 1</span>
                                                </span>
                                                {hasGeneral && (
                                                    <span className="ml-2 text-xs bg-primary/20 text-primary px-2 py-0.5 rounded">
                                                        есть ОБЩАЯ
                                                    </span>
                                                )}
                                            </h3>
                                            <div className="flex shrink-0 items-center gap-2">
                                                <CopyButton
                                                    label="Копировать позицию каталога"
                                                    getValue={() => groupCopyText(group)}
                                                />
                                                <button
                                                    onClick={() => selectBestInGroup(group)}
                                                    disabled={isMerging}
                                                    className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-sm font-bold py-1 px-3 rounded-md transition"
                                                >
                                                    Лучший вариант
                                                </button>
                                            </div>
                                        </div>
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="text-text-secondary border-b border-border">
                                                    <th className="text-left py-2 w-8">✓</th>
                                                    <th className="text-left py-2">Название</th>
                                                    <th className="text-left py-2">Категория</th>
                                                    <th className="text-right py-2">Цена</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {group.items.map(item => {
                                                    const isKept = survivorByKey[group.normalizedKey] === item.id;
                                                    const isGeneral = 'category' in item && item.category === EstimateCategory.GENERAL;
                                                    return (
                                                        <tr
                                                            key={item.id}
                                                            className={`border-b border-border/50 ${
                                                                isKept ? 'bg-green-500/10' : 'opacity-50'
                                                            }`}
                                                        >
                                                            <td className="py-2">
                                                                <input
                                                                    type="radio"
                                                                    name={`duplicate-survivor-${group.normalizedKey}`}
                                                                    checked={isKept}
                                                                    onChange={() => selectSurvivor(group.normalizedKey, item.id)}
                                                                    className="accent-green-500"
                                                                    disabled={isMerging}
                                                                />
                                                            </td>
                                                            <td className="py-2 text-text-primary">{item.name}</td>
                                                            <td className="py-2 text-text-secondary">
                                                                {'category' in item ? (
                                                                    <span className={isGeneral ? 'text-primary font-semibold' : ''}>
                                                                        {getSectionLabel(item.category as SectionId, [], sectionsContext?.document)}
                                                                    </span>
                                                                ) : '—'}
                                                            </td>
                                                            <td className="py-2 text-text-primary text-right">
                                                                {formatPrice(item.price)}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default DuplicateCheckerDialog;
