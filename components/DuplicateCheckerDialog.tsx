import React, { useState } from 'react';
import { DuplicateGroup, Material, Work } from '../types';

interface DuplicateCheckerDialogProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    duplicateGroups: DuplicateGroup<Material | Work>[];
    onMerge: (keepId: string, deleteIds: string[]) => Promise<void>;
    totalCount?: number;
}

const DuplicateCheckerDialog: React.FC<DuplicateCheckerDialogProps> = ({
    isOpen,
    onClose,
    title,
    duplicateGroups,
    onMerge,
    totalCount,
}) => {
    const [keptIds, setKeptIds] = useState<Set<string>>(new Set());
    const [isMerging, setIsMerging] = useState(false);
    const [mergeResult, setMergeResult] = useState<{ success: boolean; message: string; details?: { removedFromGroup: number; remainingInGroups: number; percentOfTotal: number } } | null>(null);

    if (!isOpen) return null;

    const toggleKeep = (itemId: string) => {
        setKeptIds(prev => {
            const next = new Set(prev);
            if (next.has(itemId)) {
                next.delete(itemId);
            } else {
                next.add(itemId);
            }
            return next;
        });
    };

    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    const handleMergeAll = async () => {
        setIsMerging(true);
        setMergeResult(null);
        let totalDeleted = 0;
        let totalItemsInProcessedGroups = 0;
        let groupsProcessed = 0;
        try {
            for (const group of duplicateGroups) {
                const hasSelection = group.items.some(item => keptIds.has(item.id));
                if (!hasSelection) continue;

                groupsProcessed++;
                totalItemsInProcessedGroups += group.items.length;
                const deleteIds = group.items
                    .filter(item => !keptIds.has(item.id))
                    .map(item => item.id);
                if (deleteIds.length > 0) {
                    const keepId = group.items.find(item => keptIds.has(item.id))?.id ?? group.items[0].id;
                    await onMerge(keepId, deleteIds);
                    totalDeleted += deleteIds.length;
                }
            }
            const remainingInGroups = totalItemsInProcessedGroups - totalDeleted;
            const effectiveTotal = typeof totalCount === 'number' ? totalCount : totalItemsInProcessedGroups;
            const percentOfTotal = effectiveTotal > 0 ? Math.round((totalDeleted / effectiveTotal) * 100) : 0;
            setMergeResult({
                success: true,
                message: `Обработано групп: ${groupsProcessed}. Удалено дубликатов: ${totalDeleted}`,
                details: { removedFromGroup: totalDeleted, remainingInGroups, percentOfTotal },
            });
            setTimeout(() => {
                setMergeResult(null);
                onClose();
            }, 3000);
        } catch {
            setMergeResult({ success: false, message: 'Ошибка при удалении' });
        } finally {
            setIsMerging(false);
        }
    };

    const totalDuplicates = duplicateGroups.reduce((sum, g) => sum + g.items.length, 0);
    const selectedGroupsCount = duplicateGroups.filter(g => g.items.some(item => keptIds.has(item.id))).length;
    const totalToDelete = duplicateGroups.reduce((sum, g) => {
        const hasSelection = g.items.some(item => keptIds.has(item.id));
        if (!hasSelection) return sum;
        return sum + g.items.filter(item => !keptIds.has(item.id)).length;
    }, 0);

    const formatPrice = (price: number) => {
        return new Intl.NumberFormat('ru-RU').format(price) + ' ₽';
    };

    const Spinner = () => (
        <svg className="animate-spin h-4 w-4 inline-block mr-1" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
    );

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
            onClick={handleBackdropClick}
        >
            <div className="bg-surface p-6 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold text-text-primary">{title}</h2>
                    <button onClick={onClose} className="text-text-secondary hover:text-text-primary text-2xl leading-none">&times;</button>
                </div>

                {mergeResult && (
                    <div className={`mb-4 p-3 rounded-lg text-sm font-semibold ${
                        mergeResult.success
                            ? 'bg-green-500/20 border border-green-500/40 text-green-300'
                            : 'bg-red-500/20 border border-red-500/40 text-red-300'
                    }`}>
                        <div>{mergeResult.message}</div>
                        {mergeResult.details && (
                            <div className="mt-2 text-xs font-normal opacity-90 space-y-0.5">
                                <div>Удалено из выбранных групп: <strong>{mergeResult.details.removedFromGroup}</strong></div>
                                <div>Осталось в группах: <strong>{mergeResult.details.remainingInGroups}</strong></div>
                                <div>Удалено от общего списка: <strong>{mergeResult.details.percentOfTotal}%</strong></div>
                            </div>
                        )}
                    </div>
                )}

                {duplicateGroups.length === 0 ? (
                    <div className="text-center py-8">
                        <div className="text-4xl mb-4">✅</div>
                        <p className="text-text-secondary text-lg">Дубликатов не найдено</p>
                    </div>
                ) : (
                    <>
                        <p className="text-text-secondary mb-2">
                            Найдено групп: {duplicateGroups.length}, позиций: {totalDuplicates}.
                        </p>
                        <p className="text-text-secondary mb-4 text-sm">
                            Отметьте галочками позиции, которые хотите <strong className="text-text-primary">оставить</strong>.
                            Остальные будут удалены.
                        </p>

                        <div className="space-y-4 mb-6">
                            {duplicateGroups.map(group => (
                                <div key={group.normalizedKey} className="bg-background rounded-lg p-4 border border-border">
                                    <h3 className="text-text-primary font-semibold mb-3">
                                        «{group.displayName}»
                                        <span className="ml-2 text-sm text-text-secondary">
                                            ({group.items.length} шт.)
                                        </span>
                                    </h3>
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
                                                const isKept = keptIds.has(item.id);
                                                return (
                                                    <tr
                                                        key={item.id}
                                                        className={`border-b border-border/50 ${isKept ? 'bg-green-500/10' : 'opacity-50'}`}
                                                    >
                                                        <td className="py-2">
                                                            <input
                                                                type="checkbox"
                                                                checked={isKept}
                                                                onChange={() => toggleKeep(item.id)}
                                                                className="accent-green-500"
                                                                disabled={isMerging}
                                                            />
                                                        </td>
                                                        <td className="py-2 text-text-primary">{item.name}</td>
                                                        <td className="py-2 text-text-secondary">
                                                            {'category' in item ? item.category : '—'}
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
                            ))}
                        </div>

                        <div className="flex justify-between items-center">
                            <span className="text-text-secondary text-sm">
                                Отмечено групп: <strong className="text-primary">{selectedGroupsCount}</strong> из {duplicateGroups.length}.
                                Будет удалено: <strong className="text-red-400">{totalToDelete}</strong>
                            </span>
                            <div className="flex gap-3">
                                <button
                                    onClick={onClose}
                                    disabled={isMerging}
                                    className="bg-border hover:bg-border/80 disabled:opacity-50 text-text-primary font-bold py-2 px-4 rounded-md transition"
                                >
                                    Отмена
                                </button>
                                <button
                                    onClick={handleMergeAll}
                                    disabled={isMerging || totalToDelete === 0}
                                    className="bg-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded-md transition"
                                >
                                    {isMerging ? <><Spinner /> Удаление...</> : `Удалить (${totalToDelete})`}
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default DuplicateCheckerDialog;
