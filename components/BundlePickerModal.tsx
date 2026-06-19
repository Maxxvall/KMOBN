import React, { useState, useMemo, useCallback } from 'react';
import { EstimateItem, EstimateSubgroup, WorkBundle } from '../types';

interface BundlePickerModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (order: string[], scaleFactor: number) => void;
    bundles: WorkBundle[];
    currentArea: number;
}

type BundlePreview = {
    bundle: WorkBundle;
    worksCount: number;
    materialsCount: number;
    scaledTotal: number;
};

const BundlePickerModal: React.FC<BundlePickerModalProps> = ({ isOpen, onClose, onConfirm, bundles, currentArea }) => {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bundleOrder, setBundleOrder] = useState<string[]>([]);
    const [scaleArea, setScaleArea] = useState(currentArea);
    const [dragId, setDragId] = useState<string | null>(null);
    const [expandedBundles, setExpandedBundles] = useState<Set<string>>(new Set());

    const toggleSelect = useCallback((id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
                setBundleOrder(prev => prev.filter(x => x !== id));
                setExpandedBundles(prev2 => { const n = new Set(prev2); n.delete(id); return n; });
            } else {
                next.add(id);
                setBundleOrder(prev => prev.includes(id) ? prev : [...prev, id]);
            }
            return next;
        });
    }, []);

    const toggleExpand = useCallback((id: string) => {
        setExpandedBundles(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    }, []);

    const previews: BundlePreview[] = useMemo(() => {
        return bundleOrder.map(id => {
            const bundle = bundles.find(b => b.id === id);
            if (!bundle) return null;
            const baseArea = (bundle as any).baseArea || 1;
            const factor = scaleArea / baseArea;
            let worksCount = 0;
            let materialsCount = 0;
            let scaledTotal = 0;
            for (const item of (bundle.items ?? [])) {
                const qty = (item.quantity || 0) * factor;
                scaledTotal += qty * (item.price || 0);
                if (item.subgroup === EstimateSubgroup.WORKS) worksCount++;
                else if (item.subgroup === EstimateSubgroup.MATERIALS) materialsCount++;
                else worksCount++;
            }
            return { bundle, worksCount, materialsCount, scaledTotal };
        }).filter(Boolean) as BundlePreview[];
    }, [bundleOrder, scaleArea, bundles]);

    const totalPositions = useMemo(() => {
        return previews.reduce((sum, p) => sum + (p.bundle.items ?? []).length, 0);
    }, [previews]);

    const totalCost = useMemo(() => {
        return previews.reduce((sum, p) => sum + p.scaledTotal, 0);
    }, [previews]);

    const onDragStart = useCallback((id: string) => (e: React.DragEvent) => {
        setDragId(id);
        e.dataTransfer.effectAllowed = 'move';
    }, []);

    const onDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    }, []);

    const onDrop = useCallback((targetId: string) => (e: React.DragEvent) => {
        e.preventDefault();
        if (!dragId || dragId === targetId) return;
        setBundleOrder(prev => {
            const items = [...prev];
            const fromIdx = items.indexOf(dragId);
            const toIdx = items.indexOf(targetId);
            if (fromIdx === -1 || toIdx === -1) return prev;
            items.splice(fromIdx, 1);
            items.splice(toIdx, 0, dragId);
            return items;
        });
        setDragId(null);
    }, [dragId]);

    const handleConfirm = useCallback(() => {
        if (bundleOrder.length === 0) return;
        onConfirm(bundleOrder, scaleArea);
    }, [bundleOrder, scaleArea, onConfirm]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
            <div className="bg-surface p-6 rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold text-text-primary">Выбор комплектов</h2>
                    <button onClick={onClose} className="text-text-secondary hover:text-text-primary text-2xl leading-none">&times;</button>
                </div>

                {bundles.length === 0 ? (
                    <div className="text-text-secondary text-sm py-8 text-center">Нет доступных комплектов</div>
                ) : (
                    <>
                        <div className="mb-4">
                            <label className="block text-sm font-semibold text-text-secondary mb-2">Доступные комплекты</label>
                            <div className="space-y-1">
                                {bundles.map(bundle => {
                                    const isSelected = selectedIds.has(bundle.id);
                                    let worksCount = 0;
                                    let materialsCount = 0;
                                    for (const item of (bundle.items ?? [])) {
                                        if (item.subgroup === EstimateSubgroup.WORKS) worksCount++;
                                        else materialsCount++;
                                    }
                                    return (
                                        <div key={bundle.id} className={`border rounded-md transition ${isSelected ? 'border-primary bg-primary/5' : 'border-border bg-background/50'}`}>
                                            <label className="flex items-center gap-2 p-2 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={() => toggleSelect(bundle.id)}
                                                    className="rounded border-border"
                                                />
                                                <span className="text-sm font-medium text-text-primary flex-1">{bundle.name}</span>
                                                <span className="text-xs text-text-secondary">{(bundle.items ?? []).length} поз.</span>
                                                {worksCount > 0 && <span className="text-xs text-blue-400">{worksCount} р.</span>}
                                                {materialsCount > 0 && <span className="text-xs text-green-400">{materialsCount} м.</span>}
                                                {isSelected && (
                                                    <button
                                                        type="button"
                                                        onClick={(e) => { e.preventDefault(); toggleExpand(bundle.id); }}
                                                        className="text-xs text-text-secondary hover:text-text-primary"
                                                    >
                                                        {expandedBundles.has(bundle.id) ? '▾' : '▸'}
                                                    </button>
                                                )}
                                            </label>
                                            {isSelected && expandedBundles.has(bundle.id) && (
                                                <div className="px-2 pb-2 border-t border-border/50">
                                                    <div className="max-h-32 overflow-y-auto mt-1 space-y-0.5">
                                                        {(bundle.items ?? []).map((item, idx) => (
                                                            <div key={idx} className="flex justify-between text-xs py-0.5">
                                                                <span className="text-text-secondary truncate mr-2">{item.name || '(пусто)'}</span>
                                                                <span className="text-text-primary whitespace-nowrap">{item.quantity} {item.unit} × {item.price.toLocaleString('ru-RU')} ₽</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="mb-4">
                            <label className="block text-sm font-semibold text-text-secondary mb-2">
                                Масштаб по площади: <span className="font-normal">{scaleArea} м²</span>
                            </label>
                            <input
                                type="range"
                                min={10}
                                max={1000}
                                step={10}
                                value={scaleArea}
                                onChange={e => setScaleArea(Number(e.target.value))}
                                className="w-full accent-primary"
                            />
                            <div className="flex justify-between text-xs text-text-secondary mt-1">
                                <span>10 м²</span>
                                <button
                                    type="button"
                                    onClick={() => setScaleArea(currentArea)}
                                    className="text-primary hover:underline"
                                >
                                    Текущая: {currentArea} м²
                                </button>
                                <span>1000 м²</span>
                            </div>
                        </div>

                        {bundleOrder.length > 0 && (
                            <div className="mb-4">
                                <label className="block text-sm font-semibold text-text-secondary mb-2">
                                    Порядок добавления (перетащите для изменения)
                                </label>
                                <div className="space-y-1">
                                    {previews.map(p => (
                                        <div
                                            key={p.bundle.id}
                                            draggable
                                            onDragStart={onDragStart(p.bundle.id)}
                                            onDragOver={onDragOver}
                                            onDrop={onDrop(p.bundle.id)}
                                            className={`flex items-center gap-2 p-2 border rounded-md bg-background/50 cursor-move transition ${
                                                dragId === p.bundle.id ? 'opacity-50 border-primary' : 'border-border hover:border-primary/50'
                                            }`}
                                        >
                                            <span className="text-text-secondary text-sm cursor-grab">☰</span>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm font-medium text-text-primary truncate">{p.bundle.name}</div>
                                                <div className="text-xs text-text-secondary">
                                                    {p.worksCount > 0 && <span>{p.worksCount} р.</span>}
                                                    {p.worksCount > 0 && p.materialsCount > 0 && <span> + </span>}
                                                    {p.materialsCount > 0 && <span>{p.materialsCount} м.</span>}
                                                    <span className="ml-2">({(p.bundle.items ?? []).length} поз.)</span>
                                                </div>
                                            </div>
                                            <span className="text-sm font-semibold text-primary whitespace-nowrap">
                                                {p.scaledTotal.toLocaleString('ru-RU')} ₽
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => toggleSelect(p.bundle.id)}
                                                className="text-text-secondary hover:text-red-400 text-sm"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </>
                )}

                <div className="flex items-center justify-between p-3 bg-background/50 rounded-md border border-border mb-4">
                    <div className="text-sm text-text-secondary">
                        Итого: <span className="font-semibold text-text-primary">{totalPositions} поз.</span>
                    </div>
                    <div className="text-sm text-text-secondary">
                        Сумма: <span className="font-semibold text-primary">{totalCost.toLocaleString('ru-RU')} ₽</span>
                    </div>
                </div>

                <div className="flex gap-3">
                    <button onClick={onClose} className="flex-1 py-2 px-4 border border-border rounded-md text-text-primary hover:bg-background transition font-medium">
                        Отмена
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={bundleOrder.length === 0}
                        className="flex-1 py-2 px-4 bg-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-md transition"
                    >
                        Добавить ({totalPositions})
                    </button>
                </div>
            </div>
        </div>
    );
};

export default BundlePickerModal;
