import React, { useMemo } from 'react';
import { Estimate, EstimateItem, EstimateCategory } from '../types';
import { ESTIMATE_CATEGORIES } from '../constants';

interface VersionComparisonModalProps {
    oldVersion: Estimate;
    newVersion: Estimate;
    onClose: () => void;
}

interface DiffItem {
    name: string;
    oldValue: string;
    newValue: string;
    type: 'added' | 'removed' | 'changed';
    category: EstimateCategory;
}

const VersionComparisonModal: React.FC<VersionComparisonModalProps> = ({ oldVersion, newVersion, onClose }) => {

    const groupedDiffs = useMemo(() => {
        const changes: DiffItem[] = [];
        const oldItemsMap = new Map<string, EstimateItem>(oldVersion.items.map(i => [i.name, i]));
        const newItemsMap = new Map<string, EstimateItem>(newVersion.items.map(i => [i.name, i]));

        for (const [name, oldItem] of oldItemsMap.entries()) {
            const newItem = newItemsMap.get(name);
            if (!newItem) {
                changes.push({ name, oldValue: `${oldItem.quantity} x ${oldItem.price} ₽`, newValue: '-', type: 'removed', category: oldItem.category });
            } else {
                if (oldItem.quantity !== newItem.quantity || oldItem.price !== newItem.price) {
                    changes.push({
                        name,
                        oldValue: `${oldItem.quantity} x ${oldItem.price} ₽`,
                        newValue: `${newItem.quantity} x ${newItem.price} ₽`,
                        type: 'changed',
                        category: newItem.category,
                    });
                }
            }
        }

        for (const [name, newItem] of newItemsMap.entries()) {
            if (!oldItemsMap.has(name)) {
                changes.push({ name, oldValue: '-', newValue: `${newItem.quantity} x ${newItem.price} ₽`, type: 'added', category: newItem.category });
            }
        }

        const groups = new Map<EstimateCategory, DiffItem[]>();
        ESTIMATE_CATEGORIES.forEach(cat => groups.set(cat, []));
        changes.forEach(change => {
            const categoryChanges = groups.get(change.category) || [];
            categoryChanges.push(change);
            groups.set(change.category, categoryChanges);
        });
        return groups;
        
    }, [oldVersion, newVersion]);
    
    const totalDiff = newVersion.total - oldVersion.total;
    const hasChanges = Array.from(groupedDiffs.values()).some(arr => Array.isArray(arr) && arr.length > 0);

    const diffStyles = {
        added: 'bg-green-900/50 border-green-600',
        removed: 'bg-red-900/50 border-red-600',
        changed: 'bg-yellow-900/50 border-yellow-600',
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex justify-center items-center" onClick={onClose}>
            <div className="bg-surface rounded-lg shadow-2xl p-6 w-full max-w-4xl border border-border" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center border-b border-border pb-3 mb-4">
                    <h3 className="text-xl font-bold text-text-primary">Сравнение версий: v{oldVersion.version} и v{newVersion.version}</h3>
                    <button onClick={onClose} className="text-text-secondary hover:text-text-primary text-2xl">&times;</button>
                </div>
                
                <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                    {!hasChanges && <p className="text-text-secondary">Нет изменений в позициях сметы.</p>}
                    {ESTIMATE_CATEGORIES.map(category => {
                        const diffs = groupedDiffs.get(category) || [];
                        if (diffs.length === 0) return null;
                        
                        return (
                            <div key={category}>
                                <h4 className="font-bold text-md text-text-secondary mb-2 mt-4">{category}</h4>
                                {diffs.map((diff, index) => (
                                    <div key={index} className={`p-3 rounded-md border grid grid-cols-3 gap-4 text-sm mb-2 ${diffStyles[diff.type]}`}>
                                        <div className="col-span-3 sm:col-span-1 font-semibold text-text-primary">{diff.name}</div>
                                        <div className="text-text-secondary line-through">{diff.oldValue}</div>
                                        <div className="font-bold text-text-primary">{diff.newValue}</div>
                                    </div>
                                ))}
                            </div>
                        )
                    })}
                </div>

                <div className="mt-6 pt-4 border-t border-border flex justify-between items-center">
                    <div>
                        <div className="text-sm text-text-secondary">Итого v{oldVersion.version}: {oldVersion.total.toLocaleString('ru-RU')} ₽</div>
                        <div className="text-sm text-text-primary">Итого v{newVersion.version}: {newVersion.total.toLocaleString('ru-RU')} ₽</div>
                    </div>
                    <div className="text-right">
                        <div className="text-lg font-bold">Изменение: 
                            <span className={totalDiff >= 0 ? 'text-green-400' : 'text-red-400'}>
                                {totalDiff >= 0 ? '+' : ''}{totalDiff.toLocaleString('ru-RU')} ₽
                            </span>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default VersionComparisonModal;