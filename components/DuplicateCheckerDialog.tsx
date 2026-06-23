import React, { useState } from 'react';
import { DuplicateGroup, Material, Work, EstimateCategory, normalizeKey } from '../types';

interface DuplicateCheckerDialogProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    duplicateGroups: DuplicateGroup<Material | Work>[];
    onMerge: (keepId: string, deleteIds: string[]) => Promise<void>;
    onCreateInGeneral?: (item: Material | Work) => Promise<void>;
}

const DuplicateCheckerDialog: React.FC<DuplicateCheckerDialogProps> = ({
    isOpen,
    onClose,
    title,
    duplicateGroups,
    onMerge,
    onCreateInGeneral,
}) => {
    const [keptIds, setKeptIds] = useState<Set<string>>(new Set());
    const [isMerging, setIsMerging] = useState(false);
    const [mergeResult, setMergeResult] = useState<{ success: boolean; message: string } | null>(null);

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

    const selectBestInGroup = (group: DuplicateGroup<Material | Work>) => {
        const generalItem = group.items.find(
            item => 'category' in item && item.category === EstimateCategory.GENERAL
        );
        const bestItem = generalItem ?? group.items[0];
        setKeptIds(prev => {
            const next = new Set(prev);
            for (const item of group.items) {
                next.delete(item.id);
            }
            next.add(bestItem.id);
            return next;
        });
    };

    const handleMergeAll = async () => {
        setIsMerging(true);
        setMergeResult(null);
        let totalDeleted = 0;
        let totalCreated = 0;
        try {
            for (const group of duplicateGroups) {
                const itemsToKeep = group.items.filter(item => keptIds.has(item.id));
                const hasGeneral = itemsToKeep.some(
                    item => 'category' in item && item.category === EstimateCategory.GENERAL
                );

                if (hasGeneral || itemsToKeep.length > 0) {
                    const keepId = itemsToKeep[0].id;
                    const deleteIds = group.items
                        .filter(item => item.id !== keepId)
                        .map(item => item.id);
                    if (deleteIds.length > 0) {
                        await onMerge(keepId, deleteIds);
                        totalDeleted += deleteIds.length;
                    }
                } else if (onCreateInGeneral) {
                    const templateItem = group.items[0];
                    const newItem = {
                        ...templateItem,
                        id: `${'category' in templateItem ? 'material' : 'work'}-${Date.now()}`,
                        category: EstimateCategory.GENERAL,
                    };
                    await onCreateInGeneral(newItem);
                    const deleteIds = group.items.map(item => item.id);
                    await onMerge(newItem.id, deleteIds);
                    totalDeleted += deleteIds.length;
                    totalCreated++;
                }
            }
            const parts: string[] = [];
            if (totalDeleted > 0) parts.push(`удалено: ${totalDeleted}`);
            if (totalCreated > 0) parts.push(`создано в ОБЩАЯ: ${totalCreated}`);
            setMergeResult({ success: true, message: parts.join(', ') || 'Нечего удалять' });
            setTimeout(() => {
                setMergeResult(null);
                onClose();
            }, 1200);
        } catch {
            setMergeResult({ success: false, message: 'Ошибка при удалении' });
        } finally {
            setIsMerging(false);
        }
    };

    const totalToDelete = duplicateGroups.reduce((sum, g) => {
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
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold text-text-primary">{title}</h2>
                    <button onClick={onClose} className="text-text-secondary hover:text-text-primary text-2xl leading-none">&times;</button>
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
                            Найдено групп: {duplicateGroups.length}. Отметьте галочками что <strong className="text-text-primary">оставить</strong>.
                        </p>
                        <p className="text-text-secondary mb-4 text-sm">
                            Кнопка «Выбрать» автоматически оставляет позицию из раздела <strong className="text-text-primary">ОБЩАЯ</strong> (или первую).
                        </p>

                        <div className="flex gap-3 mb-4">
                            <button
                                onClick={handleMergeAll}
                                disabled={isMerging || totalToDelete === 0}
                                className="bg-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded-md transition"
                            >
                                {isMerging ? <><Spinner /> Удаление...</> : `Удалить выбранные (${totalToDelete})`}
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
                                const selectedCount = group.items.filter(item => keptIds.has(item.id)).length;
                                return (
                                    <div key={group.normalizedKey} className="bg-background rounded-lg p-4 border border-border">
                                        <div className="flex items-center justify-between mb-3">
                                            <h3 className="text-text-primary font-semibold">
                                                «{group.displayName}»
                                                <span className="ml-2 text-sm text-text-secondary">
                                                    ({group.items.length} шт.)
                                                    {selectedCount > 0 && (
                                                        <span className="ml-2 text-green-400">
                                                            — оставлено: {selectedCount}
                                                        </span>
                                                    )}
                                                </span>
                                                {hasGeneral && (
                                                    <span className="ml-2 text-xs bg-primary/20 text-primary px-2 py-0.5 rounded">
                                                        есть ОБЩАЯ
                                                    </span>
                                                )}
                                            </h3>
                                            <button
                                                onClick={() => selectBestInGroup(group)}
                                                disabled={isMerging}
                                                className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-sm font-bold py-1 px-3 rounded-md transition"
                                            >
                                                Выбрать
                                            </button>
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
                                                    const isKept = keptIds.has(item.id);
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
                                                                    type="checkbox"
                                                                    checked={isKept}
                                                                    onChange={() => toggleKeep(item.id)}
                                                                    className="accent-green-500"
                                                                    disabled={isMerging}
                                                                />
                                                            </td>
                                                            <td className="py-2 text-text-primary">{item.name}</td>
                                                            <td className="py-2 text-text-secondary">
                                                                {'category' in item ? (
                                                                    <span className={isGeneral ? 'text-primary font-semibold' : ''}>
                                                                        {item.category}
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
