import React, { useState, useMemo } from 'react';
import { Estimate, EstimateCategory, EstimateItem } from '../types';
import { ESTIMATE_CATEGORIES } from '../types';

interface PasteFromEstimateModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (items: EstimateItem[], targetCategory: EstimateCategory) => void;
    estimates: Estimate[];
    currentEstimateId: string;
    targetCategory: EstimateCategory;
}

const PasteFromEstimateModal: React.FC<PasteFromEstimateModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    estimates,
    currentEstimateId,
    targetCategory,
}) => {
    const [selectedEstimateId, setSelectedEstimateId] = useState('');
    const [selectedSourceCategory, setSelectedSourceCategory] = useState<EstimateCategory | ''>('');
    const [scaleFactor, setScaleFactor] = useState(1);

    const availableEstimates = useMemo(() =>
        estimates.filter(e => e.id !== currentEstimateId && (e.items?.length ?? 0) > 0),
        [estimates, currentEstimateId]
    );

    const selectedEstimate = useMemo(() =>
        estimates.find(e => e.id === selectedEstimateId) ?? null,
        [estimates, selectedEstimateId]
    );

    const availableCategories = useMemo(() => {
        if (!selectedEstimate) return [];
        return ESTIMATE_CATEGORIES.filter(cat =>
            (selectedEstimate.items ?? []).some(item => item.category === cat)
        );
    }, [selectedEstimate]);

    const previewItems = useMemo(() => {
        if (!selectedEstimate || !selectedSourceCategory) return [];
        return (selectedEstimate.items ?? []).filter(item => item.category === selectedSourceCategory);
    }, [selectedEstimate, selectedSourceCategory]);

    const handleConfirm = () => {
        if (previewItems.length === 0) return;
        const scaledItems = previewItems.map(item => ({
            ...item,
            id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            quantity: +(item.quantity * scaleFactor).toFixed(2),
            total: +(item.quantity * scaleFactor * item.price).toFixed(2),
        }));
        onConfirm(scaledItems, targetCategory);
        resetAndClose();
    };

    const resetAndClose = () => {
        setSelectedEstimateId('');
        setSelectedSourceCategory('');
        setScaleFactor(1);
        onClose();
    };

    if (!isOpen) return null;

    const previewTotal = previewItems.reduce((sum, item) => sum + item.quantity * item.price, 0);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
            <div className="bg-surface p-6 rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold text-text-primary">Вставить из другой сметы</h2>
                    <button onClick={resetAndClose} className="text-text-secondary hover:text-text-primary text-2xl leading-none">&times;</button>
                </div>

                <div className="text-sm text-text-secondary mb-4">
                    Целевой раздел: <span className="font-semibold text-text-primary">{targetCategory}</span>
                </div>

                <div className="mb-4">
                    <label className="block text-sm font-semibold text-text-secondary mb-2">Выберите смету</label>
                    <select
                        value={selectedEstimateId}
                        onChange={e => { setSelectedEstimateId(e.target.value); setSelectedSourceCategory(''); }}
                        className="w-full p-2 bg-background border border-border rounded-md text-text-primary focus:ring-primary focus:border-primary"
                    >
                        <option value="">— Смета —</option>
                        {availableEstimates.map(e => (
                            <option key={e.id} value={e.id}>
                                {e.estimateNumber} — {e.client || 'Без клиента'} ({e.items?.length ?? 0} поз.)
                            </option>
                        ))}
                    </select>
                    {availableEstimates.length === 0 && (
                        <p className="text-xs text-text-secondary mt-1">Нет других смет с позициями</p>
                    )}
                </div>

                {selectedEstimate && (
                    <div className="mb-4">
                        <label className="block text-sm font-semibold text-text-secondary mb-2">Раздел-источник</label>
                        <select
                            value={selectedSourceCategory}
                            onChange={e => setSelectedSourceCategory(e.target.value as EstimateCategory)}
                            className="w-full p-2 bg-background border border-border rounded-md text-text-primary focus:ring-primary focus:border-primary"
                        >
                            <option value="">— Раздел —</option>
                            {availableCategories.map(cat => {
                                const count = (selectedEstimate.items ?? []).filter(i => i.category === cat).length;
                                return <option key={cat} value={cat}>{cat} ({count} поз.)</option>;
                            })}
                        </select>
                    </div>
                )}

                {selectedSourceCategory && (
                    <div className="mb-4">
                        <label className="block text-sm font-semibold text-text-secondary mb-2">
                            Коэффициент: <span className="font-normal text-text-primary">×{scaleFactor}</span>
                        </label>
                        <input
                            type="range"
                            min={0.1}
                            max={10}
                            step={0.1}
                            value={scaleFactor}
                            onChange={e => setScaleFactor(Number(e.target.value))}
                            className="w-full accent-primary"
                        />
                        <div className="flex justify-between text-xs text-text-secondary mt-1">
                            <span>×0.1</span>
                            <button type="button" onClick={() => setScaleFactor(1)} className="text-primary hover:underline">Сброс</button>
                            <span>×10</span>
                        </div>
                    </div>
                )}

                {previewItems.length > 0 && (
                    <div className="mb-4">
                        <label className="block text-sm font-semibold text-text-secondary mb-2">Предпросмотр ({previewItems.length} поз.)</label>
                        <div className="max-h-48 overflow-y-auto border border-border rounded-md p-2 space-y-0.5">
                            {previewItems.map(item => {
                                const scaledQty = +(item.quantity * scaleFactor).toFixed(2);
                                return (
                                    <div key={item.id} className="flex justify-between text-xs py-0.5">
                                        <span className="text-text-secondary truncate mr-2">{item.name} <span className="text-text-border">({item.subgroup})</span></span>
                                        <span className="text-text-primary whitespace-nowrap">{scaledQty} {item.unit} × {item.price.toLocaleString('ru-RU')} ₽</span>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="mt-2 text-sm text-text-secondary">
                            Сумма: <span className="font-semibold text-primary">{(previewTotal * scaleFactor).toLocaleString('ru-RU')} ₽</span>
                        </div>
                    </div>
                )}

                <div className="flex gap-3">
                    <button onClick={resetAndClose} className="flex-1 py-2 px-4 border border-border rounded-md text-text-primary hover:bg-background transition font-medium">
                        Отмена
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={previewItems.length === 0}
                        className="flex-1 py-2 px-4 bg-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-md transition"
                    >
                        Вставить ({previewItems.length})
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PasteFromEstimateModal;
