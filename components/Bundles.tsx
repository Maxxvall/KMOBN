import React, { useState, useMemo, useCallback } from 'react';
import { WorkBundle, EstimateCategory, EstimateItem, Work, Material } from '../types';

import { useOptionalCatalogContext } from '../contexts/CatalogContext';
import BundleItemPickerModal from './BundleItemPickerModal';

interface BundlesProps {
    bundles?: WorkBundle[];
    works?: Work[];
    materials?: Material[];
    onAddBundle?: (bundle: WorkBundle) => void | Promise<void>;
    onUpdateBundle?: (bundle: WorkBundle) => void | Promise<void>;
    onDeleteBundle?: (bundleId: string) => void | Promise<void>;
}

const Bundles: React.FC<BundlesProps> = ({ bundles, works, materials, onAddBundle, onUpdateBundle, onDeleteBundle }) => {
    const catalogContext = useOptionalCatalogContext();
    const bundleList = useMemo(() =>
        (bundles ?? catalogContext?.bundles ?? []).map(b => ({
            ...b,
            items: Array.isArray(b.items) ? b.items : [],
        })),
        [bundles, catalogContext?.bundles]
    );
    const worksList = useMemo(() => works ?? catalogContext?.works ?? [], [works, catalogContext?.works]);
    const materialList = useMemo(() => materials ?? catalogContext?.materials ?? [], [materials, catalogContext?.materials]);
    const totalBundlesCount = bundles ? bundleList.length : (catalogContext?.bundlesTotalCount ?? bundleList.length);
    const hiddenBundlesCount = Math.max(0, totalBundlesCount - bundleList.length);
    const addBundleAction = onAddBundle ?? catalogContext?.onAddBundle;
    const updateBundleAction = onUpdateBundle ?? catalogContext?.onUpdateBundle;
    const deleteBundleAction = onDeleteBundle ?? catalogContext?.onDeleteBundle;

    const [newBundleName, setNewBundleName] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<EstimateCategory>(EstimateCategory.FOUNDATION);
    const [filterCategory, setFilterCategory] = useState<EstimateCategory | 'all'>('all');
    const [expandedBundles, setExpandedBundles] = useState<Set<string>>(new Set());
    const [editingBundleName, setEditingBundleName] = useState<{ id: string; name: string } | null>(null);

    const [pickerOpen, setPickerOpen] = useState(false);
    const [pickerCategory, setPickerCategory] = useState<EstimateCategory>(EstimateCategory.FOUNDATION);
    const [pickerBundleId, setPickerBundleId] = useState<string | null>(null);

    const filteredBundles = useMemo(() => {
        return filterCategory === 'all' ? bundleList : bundleList.filter(b => b.category === filterCategory);
    }, [bundleList, filterCategory]);

    const handleAddBundle = useCallback(() => {
        if (!newBundleName.trim()) return;
        const newBundle: WorkBundle = {
            id: `bundle-${Date.now()}`,
            name: newBundleName.trim(),
            items: [],
            category: selectedCategory,
            sortOrder: Date.now(),
        };
        if (addBundleAction) {
            void addBundleAction(newBundle);
        }
        setNewBundleName('');
        setPickerCategory(selectedCategory);
        setPickerBundleId(newBundle.id);
        setPickerOpen(true);
    }, [newBundleName, selectedCategory, addBundleAction]);

    const handleOpenPicker = useCallback((bundle: WorkBundle) => {
        setPickerCategory(bundle.category);
        setPickerBundleId(bundle.id);
        setPickerOpen(true);
    }, []);

    const handlePickerConfirm = useCallback((newItems: EstimateItem[]) => {
        if (!pickerBundleId || newItems.length === 0) return;
        const bundle = bundleList.find(b => b.id === pickerBundleId);
        if (!bundle) return;
        const merged = [...(bundle.items ?? []), ...newItems];
        if (updateBundleAction) {
            void updateBundleAction({ ...bundle, items: merged });
        }
        setPickerOpen(false);
        setPickerBundleId(null);
    }, [pickerBundleId, bundleList, updateBundleAction]);

    const handleDeleteItem = useCallback((bundleId: string, itemId: string) => {
        const bundle = bundleList.find(b => b.id === bundleId);
        if (!bundle) return;
        const updated = (bundle.items ?? []).filter(item => item.id !== itemId);
        if (updateBundleAction) {
            void updateBundleAction({ ...bundle, items: updated });
        }
    }, [bundleList, updateBundleAction]);

    const handleSaveBundleName = useCallback(() => {
        if (!editingBundleName) return;
        const bundle = bundleList.find(b => b.id === editingBundleName.id);
        if (!bundle) return;
        if (updateBundleAction && editingBundleName.name.trim()) {
            void updateBundleAction({ ...bundle, name: editingBundleName.name.trim() });
        }
        setEditingBundleName(null);
    }, [editingBundleName, bundleList, updateBundleAction]);

    const toggleBundleExpansion = useCallback((bundleId: string) => {
        setExpandedBundles(prev => {
            const next = new Set(prev);
            if (next.has(bundleId)) next.delete(bundleId); else next.add(bundleId);
            return next;
        });
    }, []);

    return (
        <div className="bg-surface p-3 sm:p-4 md:p-6 rounded-lg shadow-2xl">
            <h2 className="text-2xl font-bold text-text-primary mb-6">Комплекты работ</h2>

            {hiddenBundlesCount > 0 && (
                <div className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                    Показана часть данных по текущему тарифу: {bundleList.length} из {totalBundlesCount} комплектов.
                </div>
            )}

            <div className="flex gap-4 mb-6">
                <input
                    type="text"
                    placeholder="Название комплекта"
                    className="flex-1 p-2 bg-background border border-border rounded-md text-text-primary focus:ring-primary focus:border-primary"
                    value={newBundleName}
                    onChange={e => setNewBundleName(e.target.value)}
                    onKeyPress={e => e.key === 'Enter' && handleAddBundle()}
                />
                <select
                    className="p-2 bg-background border border-border rounded-md text-text-primary focus:ring-primary focus:border-primary"
                    value={selectedCategory}
                    onChange={e => setSelectedCategory(e.target.value as EstimateCategory)}
                >
                    {Object.values(EstimateCategory).map(category => (
                        <option key={category} value={category}>{category}</option>
                    ))}
                </select>
                <button
                    onClick={handleAddBundle}
                    className="bg-primary hover:bg-primary-hover text-white font-bold py-2 px-4 rounded-md shadow-md transition duration-300"
                >
                    Создать
                </button>
            </div>

            <div className="flex gap-4 mb-6">
                <select
                    className="p-2 bg-background border border-border rounded-md text-text-primary focus:ring-primary focus:border-primary"
                    value={filterCategory}
                    onChange={e => setFilterCategory(e.target.value as EstimateCategory | 'all')}
                >
                    <option value="all">Все категории</option>
                    {Object.values(EstimateCategory).map(category => (
                        <option key={category} value={category}>{category}</option>
                    ))}
                </select>
            </div>

            <div className="space-y-4">
                {filteredBundles.map(bundle => {
                    const isExpanded = expandedBundles.has(bundle.id);
                    const isEditing = editingBundleName?.id === bundle.id;
                    const itemCount = (bundle.items ?? []).length;

                    return (
                        <div key={bundle.id} className="border border-border rounded-lg bg-background/30">
                            <div className="p-3 sm:p-4">
                                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                                    {isEditing ? (
                                        <input
                                            type="text"
                                            value={editingBundleName?.name ?? ''}
                                            onChange={e => setEditingBundleName(prev => prev ? { ...prev, name: e.target.value } : null)}
                                            onKeyDown={e => { if (e.key === 'Enter') handleSaveBundleName(); if (e.key === 'Escape') setEditingBundleName(null); }}
                                            className="flex-1 min-h-[44px] p-2 bg-background border border-border rounded-md text-text-primary focus:ring-primary focus:border-primary"
                                            autoFocus
                                        />
                                    ) : (
                                        <div className="flex items-center cursor-pointer flex-1 min-w-0" onClick={() => toggleBundleExpansion(bundle.id)}>
                                            <span className={`mr-2 transform transition-transform ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                                            <div className="min-w-0">
                                                <h3 className="text-sm sm:text-lg font-bold text-text-primary truncate">{bundle.name}</h3>
                                                <p className="text-xs sm:text-sm text-text-secondary">{bundle.category} | {itemCount} эл.</p>
                                            </div>
                                        </div>
                                    )}
                                    <div className="flex gap-2 flex-wrap">
                                    {isEditing ? (
                                        <>
                                            <button onClick={handleSaveBundleName} className="flex-1 min-h-[44px] bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-bold py-1 px-3 rounded-md transition text-sm">Сохранить</button>
                                            <button onClick={() => setEditingBundleName(null)} className="min-h-[44px] min-w-[44px] bg-gray-600 hover:bg-gray-700 active:bg-gray-800 text-white font-bold py-1 px-3 rounded-md transition flex items-center justify-center text-sm">✕</button>
                                        </>
                                    ) : (
                                        <>
                                            <button
                                                onClick={() => handleOpenPicker(bundle)}
                                                className="flex-1 min-h-[44px] bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-bold py-1 px-3 rounded-md transition text-sm"
                                            >
                                                + Элементы
                                            </button>
                                            <button
                                                onClick={() => setEditingBundleName({ id: bundle.id, name: bundle.name })}
                                                className="min-h-[44px] min-w-[44px] bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold py-1 px-3 rounded-md transition flex items-center justify-center text-sm"
                                            >
                                                ✎
                                            </button>
                                            <button
                                                onClick={() => deleteBundleAction && void deleteBundleAction(bundle.id)}
                                                className="min-h-[44px] min-w-[44px] bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-bold py-1 px-3 rounded-md transition flex items-center justify-center text-sm"
                                            >
                                                ✕
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                            </div>

                            {isExpanded && (
                                <div className="p-4 border-t border-border">
                                    <h4 className="text-md font-semibold text-text-primary mb-2">Элементы ({itemCount}):</h4>
                                    {itemCount === 0 ? (
                                        <div className="text-sm text-text-secondary py-2">Нет элементов. Нажмите "+ Элементы" чтобы добавить.</div>
                                    ) : (
                                        <div className="space-y-1">
                                            {(bundle.items ?? []).map(item => (
                                                <div key={item.id} className="flex items-center justify-between p-2 bg-background/50 rounded-md">
                                                    <span className="text-sm text-text-primary">
                                                        {item.name} <span className="text-text-secondary">({item.subgroup})</span>
                                                    </span>
                                                    <button
                                                        onClick={() => handleDeleteItem(bundle.id, item.id)}
                                                        className="min-h-[44px] min-w-[44px] flex items-center justify-center text-red-400 hover:text-red-300 text-sm font-bold rounded"
                                                    >
                                                        ✕
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
                {filteredBundles.length === 0 && (
                    <div className="text-center py-8 text-text-secondary">Нет комплектов. Создайте первый выше.</div>
                )}
            </div>

            <BundleItemPickerModal
                isOpen={pickerOpen}
                onClose={() => { setPickerOpen(false); setPickerBundleId(null); }}
                onConfirm={handlePickerConfirm}
                category={pickerCategory}
                works={worksList}
                materials={materialList}
            />
        </div>
    );
};

export default React.memo(Bundles);
