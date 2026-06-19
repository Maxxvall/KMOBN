import React, { useState, useMemo } from 'react';
import { Estimate, EstimateItem, EstimateCategory, EstimateStatus, ProjectTemplate, WorkBundle } from '../types';
import { ESTIMATE_CATEGORIES } from '../constants';
import { generateEstimateNumber } from '../services/estimateNumber';

interface QuickStartModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (estimate: Estimate) => void;
    templates: ProjectTemplate[];
    bundles: WorkBundle[];
    existingEstimateNumbers: string[];
}

const BUILDING_TYPES = [
    { label: 'Каркасный дом', defaultArea: 120 },
    { label: 'Кирпичный дом', defaultArea: 150 },
    { label: 'Баня', defaultArea: 24 },
    { label: 'Гараж', defaultArea: 40 },
    { label: 'Пристройка', defaultArea: 30 },
];

const QuickStartModal: React.FC<QuickStartModalProps> = ({ isOpen, onClose, onConfirm, templates, bundles, existingEstimateNumbers }) => {
    const [clientName, setClientName] = useState('');
    const [buildingType, setBuildingType] = useState(BUILDING_TYPES[0].label);
    const [customBuildingType, setCustomBuildingType] = useState('');
    const [area, setArea] = useState(BUILDING_TYPES[0].defaultArea);
    const [selectedSections, setSelectedSections] = useState<EstimateCategory[]>([...ESTIMATE_CATEGORIES]);
    const [selectedBundleIds, setSelectedBundleIds] = useState<Set<string>>(new Set());
    const [selectedTemplateId, setSelectedTemplateId] = useState('');

    const isCustomType = buildingType === 'Другое';
    const effectiveBuildingType = isCustomType ? customBuildingType : buildingType;

    const handleBuildingTypeSelect = (label: string) => {
        if (label === 'Другое') {
            setBuildingType('Другое');
            setCustomBuildingType('');
            return;
        }
        const preset = BUILDING_TYPES.find(b => b.label === label);
        if (preset) {
            setBuildingType(label);
            setArea(preset.defaultArea);
        }
    };

    const toggleSection = (cat: EstimateCategory) => {
        setSelectedSections(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]);
    };

    const toggleBundle = (id: string) => {
        setSelectedBundleIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const preview = useMemo(() => {
        let templateCount = 0;
        let bundleCount = 0;
        let estimatedTotal = 0;

        if (selectedTemplateId) {
            const template = templates.find(t => t.id === selectedTemplateId);
            if (template?.items) {
                const baseArea = template.baseArea || 1;
                const factor = area / baseArea;
                for (const item of template.items) {
                    if (!selectedSections.includes(item.category)) continue;
                    templateCount++;
                    estimatedTotal += ((item.quantity || 0) * factor) * (item.price || 0);
                }
            }
        }

        for (const bundleId of selectedBundleIds) {
            const bundle = bundles.find(b => b.id === bundleId);
            if (!bundle) continue;
            for (const item of (bundle.items ?? [])) {
                if (!selectedSections.includes(item.category)) continue;
                bundleCount++;
                estimatedTotal += (item.quantity || 0) * (item.price || 0);
            }
        }

        return { templateCount, bundleCount, total: templateCount + bundleCount, estimatedTotal };
    }, [selectedTemplateId, selectedBundleIds, selectedSections, area, templates, bundles]);

    const handleConfirm = () => {
        if (!effectiveBuildingType.trim()) { alert('Укажите тип строения'); return; }
        if (area <= 0) { alert('Укажите площадь'); return; }
        if (selectedSections.length === 0) { alert('Выберите хотя бы один раздел'); return; }

        const items: EstimateItem[] = [];

        if (selectedTemplateId) {
            const template = templates.find(t => t.id === selectedTemplateId);
            if (template?.items) {
                const baseArea = template.baseArea || 1;
                const factor = area / baseArea;
                for (const item of template.items) {
                    if (!selectedSections.includes(item.category)) continue;
                    const quantity = Number(((item.quantity || 0) * factor).toFixed(2));
                    items.push({
                        ...item,
                        id: `item-qs-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                        quantity,
                        total: quantity * (item.price || 0),
                    });
                }
            }
        }

        for (const bundleId of selectedBundleIds) {
            const bundle = bundles.find(b => b.id === bundleId);
            if (!bundle) continue;
            for (const item of (bundle.items ?? [])) {
                if (!selectedSections.includes(item.category)) continue;
                items.push({
                    ...item,
                    id: `item-qs-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    category: bundle.category,
                    total: (item.quantity || 0) * (item.price || 0),
                });
            }
        }

        const total = items.reduce((sum, item) => sum + (item.quantity * item.price), 0);

        const estimate: Estimate = {
            id: `sm-id-${Date.now()}`,
            estimateNumber: generateEstimateNumber(existingEstimateNumbers, new Date()),
            client: clientName,
            date: new Date().toISOString().split('T')[0],
            status: EstimateStatus.DRAFT,
            version: 1,
            items,
            total,
            buildingType: effectiveBuildingType,
            area,
            selectedSections,
            needsPriceUpdate: false,
            sortOrder: Date.now(),
        };

        onConfirm(estimate);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
            <div className="bg-surface p-6 rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold text-text-primary">Быстрый старт</h2>
                    <button onClick={onClose} className="text-text-secondary hover:text-text-primary text-2xl leading-none">&times;</button>
                </div>

                <div className="mb-4">
                    <label className="block text-sm font-semibold text-text-secondary mb-2">Имя клиента</label>
                    <input
                        type="text"
                        value={clientName}
                        onChange={e => setClientName(e.target.value)}
                        placeholder="Введите имя клиента"
                        className="w-full p-2 bg-background border border-border rounded-md text-text-primary focus:ring-primary focus:border-primary"
                    />
                </div>

                <div className="mb-4">
                    <label className="block text-sm font-semibold text-text-secondary mb-2">Тип строения</label>
                    <div className="flex flex-wrap gap-2">
                        {BUILDING_TYPES.map(bt => (
                            <button
                                key={bt.label}
                                onClick={() => handleBuildingTypeSelect(bt.label)}
                                className={`px-3 py-1.5 rounded-full text-sm font-medium border transition ${
                                    buildingType === bt.label
                                        ? 'bg-primary text-white border-primary'
                                        : 'bg-background border-border text-text-primary hover:border-primary'
                                }`}
                            >
                                {bt.label}
                            </button>
                        ))}
                        <button
                            onClick={() => handleBuildingTypeSelect('Другое')}
                            className={`px-3 py-1.5 rounded-full text-sm font-medium border transition ${
                                isCustomType
                                    ? 'bg-primary text-white border-primary'
                                    : 'bg-background border-border text-text-primary hover:border-primary'
                            }`}
                        >
                            Другое
                        </button>
                    </div>
                    {isCustomType && (
                        <input
                            type="text"
                            value={customBuildingType}
                            onChange={e => setCustomBuildingType(e.target.value)}
                            placeholder="Введите тип строения"
                            className="mt-2 w-full p-2 bg-background border border-border rounded-md text-text-primary focus:ring-primary focus:border-primary"
                        />
                    )}
                </div>

                <div className="mb-4">
                    <label className="block text-sm font-semibold text-text-secondary mb-2">Площадь (м²)</label>
                    <input
                        type="number"
                        value={area}
                        onChange={e => setArea(Number(e.target.value) || 0)}
                        className="w-full p-2 bg-background border border-border rounded-md text-text-primary focus:ring-primary focus:border-primary"
                    />
                </div>

                {templates.length > 0 && (
                    <div className="mb-4">
                        <label className="block text-sm font-semibold text-text-secondary mb-2">Шаблон (опционально)</label>
                        <select
                            value={selectedTemplateId}
                            onChange={e => setSelectedTemplateId(e.target.value)}
                            className="w-full p-2 bg-background border border-border rounded-md text-text-primary focus:ring-primary focus:border-primary"
                        >
                            <option value="">Без шаблона</option>
                            {templates.map(t => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                        </select>
                    </div>
                )}

                <div className="mb-4">
                    <label className="block text-sm font-semibold text-text-secondary mb-2">Разделы</label>
                    <div className="grid grid-cols-2 gap-2">
                        {ESTIMATE_CATEGORIES.map(cat => (
                            <label key={cat} className="flex items-center gap-2 p-2 bg-background/50 rounded-md cursor-pointer hover:bg-background/80 transition">
                                <input
                                    type="checkbox"
                                    checked={selectedSections.includes(cat)}
                                    onChange={() => toggleSection(cat)}
                                    className="rounded border-border"
                                />
                                <span className="text-sm text-text-primary">{cat}</span>
                            </label>
                        ))}
                    </div>
                </div>

                {bundles.length > 0 && (
                    <div className="mb-4">
                        <label className="block text-sm font-semibold text-text-secondary mb-2">Комплекты</label>
                        <div className="space-y-1 max-h-40 overflow-y-auto border border-border rounded-md p-2">
                            {bundles.map(bundle => (
                                <label key={bundle.id} className="flex items-center gap-2 p-1.5 rounded cursor-pointer hover:bg-background/50 transition">
                                    <input
                                        type="checkbox"
                                        checked={selectedBundleIds.has(bundle.id)}
                                        onChange={() => toggleBundle(bundle.id)}
                                        className="rounded border-border"
                                    />
                                    <span className="text-sm text-text-primary flex-1">{bundle.name}</span>
                                    <span className="text-xs text-text-secondary">{(bundle.items ?? []).length} поз.</span>
                                </label>
                            ))}
                        </div>
                    </div>
                )}

                {preview.total > 0 && (
                    <div className="mb-6 p-3 bg-background/50 rounded-md border border-border">
                        <div className="text-sm text-text-secondary">
                            Будет создано: <span className="font-semibold text-text-primary">{preview.total} поз.</span>
                            {preview.templateCount > 0 && <span> (шаблон: {preview.templateCount})</span>}
                            {preview.bundleCount > 0 && <span> (комплекты: {preview.bundleCount})</span>}
                        </div>
                        {preview.estimatedTotal > 0 && (
                            <div className="text-sm text-text-secondary mt-1">
                                Примерная сумма: <span className="font-semibold text-primary">{preview.estimatedTotal.toLocaleString('ru-RU')} ₽</span>
                            </div>
                        )}
                    </div>
                )}

                <div className="flex gap-3">
                    <button onClick={onClose} className="flex-1 py-2 px-4 border border-border rounded-md text-text-primary hover:bg-background transition font-medium">
                        Отмена
                    </button>
                    <button onClick={handleConfirm} className="flex-1 py-2 px-4 bg-primary hover:bg-primary-hover text-white font-bold rounded-md transition">
                        Создать смету
                    </button>
                </div>
            </div>
        </div>
    );
};

export default QuickStartModal;
