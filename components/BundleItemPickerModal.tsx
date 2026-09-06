import React, { useState, useMemo, useCallback } from 'react';
import { EstimateItem, EstimateSubgroup, Work, Material, SectionId } from '../types';
import { getSectionLabel } from '../services/estimateSections';
import { useOptionalEstimateSections } from '../contexts/EstimateSectionsContext';

interface BundleItemPickerModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (items: EstimateItem[]) => void;
    category: SectionId;
    works: Work[];
    materials: Material[];
}

const BundleItemPickerModal: React.FC<BundleItemPickerModalProps> = ({ isOpen, onClose, onConfirm, category, works, materials }) => {
    const sectionsContext = useOptionalEstimateSections();
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [searchQuery, setSearchQuery] = useState('');
    const [tab, setTab] = useState<'works' | 'materials'>('works');

    const filteredWorks = useMemo(() => {
        const list = works.filter(w => w.category === category || w.category === 'ОБЩАЯ');
        if (!searchQuery.trim()) return list;
        const q = searchQuery.toLowerCase();
        return list.filter(w => w.name.toLowerCase().includes(q));
    }, [works, category, searchQuery]);

    const filteredMaterials = useMemo(() => {
        const list = materials.filter(m => m.category === category || m.category === 'ОБЩАЯ');
        if (!searchQuery.trim()) return list;
        const q = searchQuery.toLowerCase();
        return list.filter(m => m.name.toLowerCase().includes(q));
    }, [materials, category, searchQuery]);

    const toggleItem = useCallback((id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    }, []);

    const toggleAllWorks = useCallback(() => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            const allSelected = filteredWorks.every(w => next.has(w.id));
            if (allSelected) {
                filteredWorks.forEach(w => next.delete(w.id));
            } else {
                filteredWorks.forEach(w => next.add(w.id));
            }
            return next;
        });
    }, [filteredWorks]);

    const toggleAllMaterials = useCallback(() => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            const allSelected = filteredMaterials.every(m => next.has(m.id));
            if (allSelected) {
                filteredMaterials.forEach(m => next.delete(m.id));
            } else {
                filteredMaterials.forEach(m => next.add(m.id));
            }
            return next;
        });
    }, [filteredMaterials]);

    const handleConfirm = useCallback(() => {
        const items: EstimateItem[] = [];
        for (const w of works) {
            if (selectedIds.has(w.id)) {
                items.push({
                    id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    name: w.name,
                    unit: 'шт',
                    quantity: 1,
                    price: w.price || 0,
                    total: w.price || 0,
                    category,
                    subgroup: EstimateSubgroup.WORKS,
                });
            }
        }
        for (const m of materials) {
            if (selectedIds.has(m.id)) {
                items.push({
                    id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    name: m.name,
                    unit: 'шт',
                    quantity: 1,
                    price: m.price || 0,
                    total: m.price || 0,
                    category,
                    subgroup: EstimateSubgroup.MATERIALS,
                });
            }
        }
        onConfirm(items);
        setSelectedIds(new Set());
        setSearchQuery('');
    }, [selectedIds, works, materials, category, onConfirm]);

    if (!isOpen) return null;

    const totalSelected = selectedIds.size;
    const currentList = tab === 'works' ? filteredWorks : filteredMaterials;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
            <div className="bg-surface p-6 rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold text-text-primary">Добавить элементы</h2>
                    <button onClick={onClose} className="text-text-secondary hover:text-text-primary text-2xl leading-none">&times;</button>
                </div>

                <div className="text-sm text-text-secondary mb-3">
                    Категория: <span className="font-semibold text-text-primary">{getSectionLabel(category, [], sectionsContext?.document)}</span>
                </div>

                <input
                    type="text"
                    placeholder="Поиск..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full p-2 mb-3 bg-background border border-border rounded-md text-text-primary focus:ring-primary focus:border-primary"
                />

                <div className="flex gap-2 mb-3">
                    <button
                        onClick={() => setTab('works')}
                        className={`flex-1 py-2 text-sm font-semibold rounded-md transition ${tab === 'works' ? 'bg-primary text-white' : 'bg-background border border-border text-text-primary hover:border-primary'}`}
                    >
                        Работы ({filteredWorks.length})
                    </button>
                    <button
                        onClick={() => setTab('materials')}
                        className={`flex-1 py-2 text-sm font-semibold rounded-md transition ${tab === 'materials' ? 'bg-primary text-white' : 'bg-background border border-border text-text-primary hover:border-primary'}`}
                    >
                        Материалы ({filteredMaterials.length})
                    </button>
                </div>

                {currentList.length > 0 && (
                    <label className="flex items-center gap-2 p-2 mb-2 bg-background/50 rounded-md cursor-pointer hover:bg-background/80 transition border border-border">
                        <input
                            type="checkbox"
                            checked={tab === 'works' ? filteredWorks.every(w => selectedIds.has(w.id)) : filteredMaterials.every(m => selectedIds.has(m.id))}
                            onChange={tab === 'works' ? toggleAllWorks : toggleAllMaterials}
                            className="rounded border-border"
                        />
                        <span className="text-sm font-semibold text-text-primary">Выбрать все</span>
                    </label>
                )}

                <div className="space-y-1 max-h-64 overflow-y-auto mb-4 border border-border rounded-md p-2">
                    {currentList.length === 0 ? (
                        <div className="text-sm text-text-secondary py-4 text-center">Нет элементов{searchQuery ? ' по запросу' : ''}</div>
                    ) : (
                        currentList.map(item => (
                            <label key={item.id} className="flex items-center gap-2 p-1.5 rounded cursor-pointer hover:bg-background/50 transition">
                                <input
                                    type="checkbox"
                                    checked={selectedIds.has(item.id)}
                                    onChange={() => toggleItem(item.id)}
                                    className="rounded border-border"
                                />
                                <span className="text-sm text-text-primary flex-1 truncate">{item.name}</span>
                                <span className="text-xs text-text-secondary whitespace-nowrap">{item.price.toLocaleString('ru-RU')} ₽</span>
                            </label>
                        ))
                    )}
                </div>

                <div className="flex items-center justify-between p-3 bg-background/50 rounded-md border border-border mb-4">
                    <span className="text-sm text-text-secondary">
                        Выбрано: <span className="font-semibold text-text-primary">{totalSelected}</span>
                    </span>
                    <span className="text-sm text-text-secondary">
                        Сумма: <span className="font-semibold text-primary">
                            {(() => {
                                let total = 0;
                                for (const w of works) {
                                    if (selectedIds.has(w.id)) total += w.price || 0;
                                }
                                for (const m of materials) {
                                    if (selectedIds.has(m.id)) total += m.price || 0;
                                }
                                return total.toLocaleString('ru-RU');
                            })()} ₽
                        </span>
                    </span>
                </div>

                <div className="flex gap-3">
                    <button onClick={onClose} className="flex-1 py-2 px-4 border border-border rounded-md text-text-primary hover:bg-background transition font-medium">
                        Отмена
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={totalSelected === 0}
                        className="flex-1 py-2 px-4 bg-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-md transition"
                    >
                        Добавить ({totalSelected})
                    </button>
                </div>
            </div>
        </div>
    );
};

export default BundleItemPickerModal;
