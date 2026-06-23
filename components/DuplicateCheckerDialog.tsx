import React, { useState } from 'react';
import { DuplicateGroup, Material, Work } from '../types';

interface DuplicateCheckerDialogProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    duplicateGroups: DuplicateGroup<Material | Work>[];
    onMerge: (keepId: string, deleteIds: string[]) => void;
}

const DuplicateCheckerDialog: React.FC<DuplicateCheckerDialogProps> = ({
    isOpen,
    onClose,
    title,
    duplicateGroups,
    onMerge,
}) => {
    const [selectedKeepIds, setSelectedKeepIds] = useState<Record<string, string>>({});

    if (!isOpen) return null;

    const getKeepId = (groupKey: string, items: { id: string }[]): string => {
        return selectedKeepIds[groupKey] ?? items[0].id;
    };

    const handleSelectKeep = (groupKey: string, itemId: string) => {
        setSelectedKeepIds(prev => ({ ...prev, [groupKey]: itemId }));
    };

    const handleMergeGroup = (group: DuplicateGroup<Material | Work>) => {
        const keepId = getKeepId(group.normalizedKey, group.items);
        const deleteIds = group.items.filter(i => i.id !== keepId).map(i => i.id);
        onMerge(keepId, deleteIds);
        setSelectedKeepIds(prev => {
            const next = { ...prev };
            delete next[group.normalizedKey];
            return next;
        });
    };

    const handleMergeAll = () => {
        for (const group of duplicateGroups) {
            const keepId = getKeepId(group.normalizedKey, group.items);
            const deleteIds = group.items.filter(i => i.id !== keepId).map(i => i.id);
            onMerge(keepId, deleteIds);
        }
        setSelectedKeepIds({});
    };

    const formatPrice = (price: number) => {
        return new Intl.NumberFormat('ru-RU').format(price) + ' ₽';
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
            <div className="bg-surface p-6 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold text-text-primary">{title}</h2>
                    <button onClick={onClose} className="text-text-secondary hover:text-text-primary text-2xl leading-none">&times;</button>
                </div>

                {duplicateGroups.length === 0 ? (
                    <div className="text-center py-8">
                        <div className="text-4xl mb-4">✅</div>
                        <p className="text-text-secondary text-lg">Дубликатов не найдено</p>
                    </div>
                ) : (
                    <>
                        <p className="text-text-secondary mb-4">
                            Найдено групп дубликатов: {duplicateGroups.length}. Выберите, какой элемент оставить в каждой группе.
                        </p>

                        <div className="space-y-4 mb-6">
                            {duplicateGroups.map(group => {
                                const keepId = getKeepId(group.normalizedKey, group.items);
                                return (
                                    <div key={group.normalizedKey} className="bg-background rounded-lg p-4 border border-border">
                                        <div className="flex items-center justify-between mb-3">
                                            <h3 className="text-text-primary font-semibold">
                                                «{group.displayName}»
                                                <span className="ml-2 text-sm text-text-secondary">
                                                    ({group.items.length} шт.)
                                                </span>
                                            </h3>
                                            <button
                                                onClick={() => handleMergeGroup(group)}
                                                className="bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold py-1 px-3 rounded-md transition"
                                            >
                                                Удалить дубликаты
                                            </button>
                                        </div>
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="text-text-secondary border-b border-border">
                                                    <th className="text-left py-2 w-8"></th>
                                                    <th className="text-left py-2">Название</th>
                                                    <th className="text-left py-2">Категория</th>
                                                    <th className="text-right py-2">Цена</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {group.items.map(item => (
                                                    <tr
                                                        key={item.id}
                                                        className={`border-b border-border/50 ${keepId === item.id ? 'bg-primary/10' : ''}`}
                                                    >
                                                        <td className="py-2">
                                                            <input
                                                                type="radio"
                                                                name={`keep-${group.normalizedKey}`}
                                                                checked={keepId === item.id}
                                                                onChange={() => handleSelectKeep(group.normalizedKey, item.id)}
                                                                className="accent-primary"
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
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="flex justify-end gap-3">
                            <button
                                onClick={onClose}
                                className="bg-border hover:bg-border/80 text-text-primary font-bold py-2 px-4 rounded-md transition"
                            >
                                Отмена
                            </button>
                            <button
                                onClick={handleMergeAll}
                                className="bg-primary hover:bg-primary-hover text-white font-bold py-2 px-4 rounded-md transition"
                            >
                                Объединить все
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default DuplicateCheckerDialog;
