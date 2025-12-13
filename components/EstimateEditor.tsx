import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { Estimate, EstimateItem, EstimateStatus, GenerationParams, EstimateCategory, EstimateSubgroup, ProjectTemplate, Material, Work, WorkBundle } from '../types';
import { ESTIMATE_CATEGORIES } from '../constants';
import { generateEstimateWithAI } from '../services/geminiService';
import { searchPrice } from '../services/priceService';
import VersionComparisonModal from './VersionComparisonModal';

interface EstimateEditorProps {
    initialEstimate: Estimate | null;
    templates: ProjectTemplate[];
    materials: Material[];
    works: Work[];
    bundles: WorkBundle[];
    onSave: (estimate: Estimate) => void;
    onSaveAsTemplate: (estimate: Estimate) => void;
    onDeleteTemplate: (templateId: string) => void;
    onBack: () => void;
    allEstimates: Estimate[];
}

const EstimateEditor: React.FC<EstimateEditorProps> = ({ initialEstimate, templates, materials, works, bundles, onSave, onSaveAsTemplate, onDeleteTemplate, onBack, allEstimates }) => {
    const [estimate, setEstimate] = useState<Estimate>(
        initialEstimate || {
            id: `sm-temp-${Date.now()}`,
            estimateNumber: `SM-${new Date().getFullYear()}-...`,
            client: '',
            date: new Date().toISOString().split('T')[0],
            status: EstimateStatus.DRAFT,
            version: 1,
            items: [],
            total: 0,
            buildingType: '',
            area: 0,
        }
    );
    const [genParams, setGenParams] = useState<GenerationParams>({
        area: 120,
        projectTemplateId: '3',
        region: 'Московская область',
    });
    const [isLoading, setIsLoading] = useState(false);
    const [showComparison, setShowComparison] = useState(false);
    const [visibleCategories, setVisibleCategories] = useState<EstimateCategory[]>([]);
    // Typeahead / debounce state
    const TYPEAHEAD_THRESHOLD = 10; // show typeahead only if more than 10 items
    const DEBOUNCE_MS = 300;
    const [suggestions, setSuggestions] = useState<Record<string, (Material | Work)[]>>({});
    const [showSuggestions, setShowSuggestions] = useState<Record<string, boolean>>({});
    const debounceTimers = useRef<Record<string, any>>({});
    const hideTimeouts = useRef<Record<string, any>>({});

    // Update genParams if selected template is deleted
    useEffect(() => {
        if (templates.length > 0 && !templates.find(t => t.id === genParams.projectTemplateId)) {
            setGenParams(prev => ({ ...prev, projectTemplateId: templates[0].id }));
        }
    }, [templates, genParams.projectTemplateId]);

    const clearDebounce = (itemId: string) => {
        const t = debounceTimers.current[itemId];
        if (t) {
            clearTimeout(t);
            delete debounceTimers.current[itemId];
        }
    };

    const scheduleSuggestions = (itemId: string, query: string, pool: (Material | Work)[]) => {
        clearDebounce(itemId);
        if (!query) {
            setSuggestions(prev => ({ ...prev, [itemId]: [] }));
            setShowSuggestions(prev => ({ ...prev, [itemId]: false }));
            return;
        }
        debounceTimers.current[itemId] = setTimeout(() => {
            const q = query.toLowerCase();
            const results = pool.filter(p => p.name.toLowerCase().includes(q)).slice(0, 20);
            setSuggestions(prev => ({ ...prev, [itemId]: results }));
            setShowSuggestions(prev => ({ ...prev, [itemId]: results.length > 0 }));
            delete debounceTimers.current[itemId];
        }, DEBOUNCE_MS);
    };

    // Render suggestions in a portal attached to document.body so the list can overflow outside scroll containers
    const renderSuggestionsPortal = (itemId: string, list: (Material | Work)[] | undefined, onSelect: (item: Material | Work) => void) => {
        if (!list || list.length === 0 || !showSuggestions[itemId]) return null;
        if (typeof window === 'undefined') return null;
        const inputEl = document.getElementById(`typeahead-input-${itemId}`) as HTMLElement | null;
        if (!inputEl) return null;
        const rect = inputEl.getBoundingClientRect();
        const style: React.CSSProperties = {
            position: 'absolute',
            left: rect.left + window.scrollX,
            top: rect.bottom + window.scrollY,
            width: rect.width,
            zIndex: 9999,
            maxHeight: 220,
            overflow: 'auto',
            background: 'var(--surface, #0b1220)',
            border: '1px solid var(--border, rgba(148,163,184,0.08))',
            borderRadius: 6,
            boxShadow: '0 6px 20px rgba(2,6,23,0.6)'
        };

        const listEl = (
            <ul style={style} className="typeahead-portal-list">
                {list.map(it => (
                    <li key={(it as any).id}
                        onMouseDown={e => { e.preventDefault(); if (hideTimeouts.current[itemId]) { clearTimeout(hideTimeouts.current[itemId]); delete hideTimeouts.current[itemId]; } clearDebounce(itemId); onSelect(it); }}
                        className="p-2 hover:bg-gray-700 cursor-pointer text-sm text-white"
                        style={{ color: 'var(--text-primary, #fff)' }}
                    >
                        {(it as any).name}
                    </li>
                ))}
            </ul>
        );

        return ReactDOM.createPortal(listEl, document.body);
    };

    const calculateTotal = (items: EstimateItem[]) => {
        return items.reduce((sum, item) => sum + (item.quantity * item.price), 0);
    };

    const groupedItems = useMemo(() => {
        const groups = new Map<EstimateCategory, EstimateItem[]>();
        ESTIMATE_CATEGORIES.forEach(cat => groups.set(cat, []));
        estimate.items.forEach(item => {
            const categoryItems = groups.get(item.category) || [];
            categoryItems.push(item);
            groups.set(item.category, categoryItems);
        });
        return groups;
    }, [estimate.items]);

    const categorySubtotals = useMemo(() => {
        const subtotals = new Map<EstimateCategory, number>();
        for (const [category, items] of groupedItems.entries()) {
            const subtotal = items.reduce((sum, item) => sum + item.total, 0);
            subtotals.set(category, subtotal);
        }
        return subtotals;
    }, [groupedItems]);

    // Update a single field on an item (safe: uses prev state)
    const updateItem = (itemId: string, field: keyof EstimateItem, value: string | number) => {
        setEstimate(prev => {
            const newItems = prev.items.map(item => {
                if (item.id === itemId) {
                    const updatedItem = { ...item } as any;
                    if (field === 'quantity' || field === 'price') {
                        const numValue = Number(value) || 0;
                        updatedItem[field] = numValue;
                        updatedItem.total = (updatedItem.quantity || 0) * (updatedItem.price || 0);
                    } else {
                        updatedItem[field] = String(value);
                    }
                    return updatedItem as EstimateItem;
                }
                return item;
            });
            return { ...prev, items: newItems, total: calculateTotal(newItems) };
        });
    };

    // Update multiple fields on an item atomically
    const updateItemFields = (itemId: string, fields: Partial<EstimateItem>) => {
        setEstimate(prev => {
            const newItems = prev.items.map(item => {
                if (item.id === itemId) {
                    const updatedItem: EstimateItem = { ...item, ...fields } as EstimateItem;
                    updatedItem.total = (updatedItem.quantity || 0) * (updatedItem.price || 0);
                    return updatedItem;
                }
                return item;
            });
            return { ...prev, items: newItems, total: calculateTotal(newItems) };
        });
    };

    const addItem = (category: EstimateCategory, subgroup: EstimateSubgroup = EstimateSubgroup.WORKS) => {
        const newItem: EstimateItem = {
            id: `item-new-${Date.now()}`,
            name: '',
            unit: 'шт',
            quantity: 1,
            price: 0,
            total: 0,
            category: category,
            subgroup: subgroup,
        };
        setEstimate(prev => ({ ...prev, items: [...prev.items, newItem] }));
    };

    const handleMaterialSelect = async (itemId: string, materialName: string) => {
        console.info('[EstimateEditor] handleMaterialSelect start', { itemId, materialName });
        const material = materials.find(m => m.name === materialName);
        if (!material) {
            console.warn('[EstimateEditor] material not found in pool', { materialName });
            return;
        }
        console.debug('[EstimateEditor] found material', material);

        // Check if price needs update (older than 24 hours)
        const lastUpdated = new Date(material.lastUpdated);
        const now = new Date();
        const hoursDiff = (now.getTime() - lastUpdated.getTime()) / (1000 * 60 * 60);
        let price = material.price;
        console.debug('[EstimateEditor] price age check', { currentPrice: material.price, lastUpdated: material.lastUpdated, hoursDiff });
        if (hoursDiff > 24) {
            try {
                console.info('[EstimateEditor] querying searchPrice for material', material.name);
                price = await searchPrice(material.name);
                console.info('[EstimateEditor] searchPrice returned', { material: material.name, price });
                // Update material in parent state? But since it's props, maybe not, or pass callback
                // For now, just use updated price locally
            } catch (error) {
                console.warn('[EstimateEditor] Failed to update price via searchPrice', { material: material.name, error });
            }
        } else {
            console.debug('[EstimateEditor] using existing material price (no search)', { price });
        }

        console.info('[EstimateEditor] applying price to item', { itemId, name: material.name, price, unit: 'шт' });
        updateItemFields(itemId, { name: material.name, price, unit: 'шт' }); // Assume unit шт
    };

    // Try to apply material by exact name (used on blur / Enter) so user can type freely
    const tryApplyMaterialByName = async (itemId: string, name: string) => {
        if (!name) return;
        const material = materials.find(m => m.name === name);
        if (!material) return;
        await handleMaterialSelect(itemId, name);
    };

    const selectMaterialSuggestion = async (itemId: string, material: Material) => {
        // Apply selected material, possibly updating price via searchPrice
        await handleMaterialSelect(itemId, material.name);
        setShowSuggestions(prev => ({ ...prev, [itemId]: false }));
        setSuggestions(prev => ({ ...prev, [itemId]: [] }));
    };

    const handleWorkSelect = (itemId: string, workName: string) => {
        const work = works.find(w => w.name === workName);
        if (!work) return;

        updateItemFields(itemId, { name: work.name, price: work.price, unit: 'шт' }); // Assume unit шт
    };


    // Try to apply work by exact name (used on blur / Enter) so user can type freely
    const tryApplyWorkByName = (itemId: string, name: string) => {
        if (!name) return;
        const work = works.find(w => w.name === name);
        if (!work) return;
        handleWorkSelect(itemId, name);
    };

    const selectWorkSuggestion = (itemId: string, work: Work) => {
        handleWorkSelect(itemId, work.name);
        setShowSuggestions(prev => ({ ...prev, [itemId]: false }));
        setSuggestions(prev => ({ ...prev, [itemId]: [] }));
    };
    const removeItem = (itemId: string) => {
        const newItems = estimate.items.filter(item => item.id !== itemId);
        setEstimate(prev => ({ ...prev, items: newItems, total: calculateTotal(newItems) }));
    };

    const handleGenerate = useCallback(async () => {
        setIsLoading(true);
        try {
            // Найти выбранный шаблон
            const selectedTemplate = templates.find(t => t.id === genParams.projectTemplateId);
            
            // Если в шаблоне есть элементы (это пользовательский шаблон), использовать их
            if (selectedTemplate && selectedTemplate.items && selectedTemplate.items.length > 0) {
                // Загружаем шаблон, присваивая новые ID элементам
                const newItems = selectedTemplate.items.map(item => ({
                    ...item,
                    id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                }));
                const total = calculateTotal(newItems);
                setEstimate(prev => ({ ...prev, items: newItems, total }));
            } else {
                // Если шаблон без элементов, используем AI генерацию
                const { items, total } = await generateEstimateWithAI(genParams);
                setEstimate(prev => ({ ...prev, items, total }));
            }
        } catch (error) {
            console.error("Failed to generate estimate", error);
            alert("Произошла ошибка при генерации сметы.");
        } finally {
            setIsLoading(false);
        }
    }, [genParams, templates]);

    // keep visibleCategories in sync with items present in estimate
    useEffect(() => {
        const cats = Array.from(new Set(estimate.items.map(i => i.category)));
        setVisibleCategories(prev => Array.from(new Set([...prev, ...cats])));
    }, [estimate.items]);

    const addCategory = (cat: EstimateCategory) => {
        if (!cat) return;
        setVisibleCategories(prev => prev.includes(cat) ? prev : [...prev, cat]);
    };

    const removeVisibleCategory = (cat: EstimateCategory) => {
        const itemsInCat = estimate.items.filter(it => it.category === cat);
        if (itemsInCat.length > 0) {
            if (!confirm('В разделе есть позиции. Удалить раздел и все позиции?')) return;
            setEstimate(prev => {
                const newItems = prev.items.filter(it => it.category !== cat);
                return { ...prev, items: newItems, total: calculateTotal(newItems) };
            });
        }
        setVisibleCategories(prev => prev.filter(c => c !== cat));
    };

    const handleApplyBundle = useCallback((bundleId: string) => {
        const bundle = bundles.find(b => b.id === bundleId);
        if (!bundle) return;

        // Создаем новые items из bundle, присваивая им уникальные id и категорию bundle
        const newItems = bundle.items.map(item => ({
            ...item,
            id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            category: bundle.category, // Переопределяем категорию на категорию bundle
        }));

        setEstimate(prev => {
            const updatedItems = [...prev.items, ...newItems];
            const newTotal = updatedItems.reduce((sum, item) => sum + item.total, 0);
            return { ...prev, items: updatedItems, total: newTotal };
        });
    }, [bundles]);

    const handleSave = () => {
        if (!estimate.client) {
            alert("Пожалуйста, укажите имя клиента.");
            return;
        }
        const finalEstimate = {
            ...estimate,
            id: initialEstimate ? estimate.id : `sm-id-${Date.now()}`,
            estimateNumber: initialEstimate ? estimate.estimateNumber : `SM-${new Date().getFullYear()}-${String(allEstimates.length + 1).padStart(3, '0')}`
        };
        onSave(finalEstimate);
    };

    const getPreviousVersion = (): Estimate | undefined => {
        if (!initialEstimate) return undefined;
        const parentId = initialEstimate.parentId || initialEstimate.id;
        return allEstimates.find(e => (e.id === parentId || e.parentId === parentId) && e.version === initialEstimate.version - 1);
    };

    const inputStyles = "p-2 bg-background border border-border rounded-md text-text-primary focus:ring-primary focus:border-primary w-full";

    return (
        <div className="space-y-6">
            <div className="bg-surface p-6 rounded-lg shadow-2xl">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-2xl font-bold text-text-primary">{initialEstimate ? `Редактирование сметы №${estimate.estimateNumber}` : 'Создание новой сметы'}</h2>
                    <button onClick={onBack} className="text-text-secondary hover:text-text-primary">&larr; Назад к истории</button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-7 gap-4 mb-6">
                    <input type="text" value={estimate.client} onChange={e => setEstimate({ ...estimate, client: e.target.value })} placeholder="Клиент" className={inputStyles} />
                    <input type="date" value={estimate.date} onChange={e => setEstimate({ ...estimate, date: e.target.value })} className={inputStyles} />
                    <select value={estimate.status} onChange={e => setEstimate({ ...estimate, status: e.target.value as EstimateStatus })} className={inputStyles}>
                        {Object.values(EstimateStatus).filter(s => s !== EstimateStatus.ARCHIVED).map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <input type="text" value={estimate.buildingType} onChange={e => setEstimate({ ...estimate, buildingType: e.target.value })} placeholder="Тип строения" className={inputStyles} />
                    <input type="number" value={estimate.area || ''} onChange={e => setEstimate({ ...estimate, area: +e.target.value || 0 })} placeholder="Площадь" className={inputStyles} />
                    <div className="flex gap-2">
                        <select value={genParams.projectTemplateId} onChange={e => setGenParams({ ...genParams, projectTemplateId: e.target.value })} className={inputStyles + " flex-1"}>
                            {templates.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}
                        </select>
                        <button onClick={() => onDeleteTemplate(genParams.projectTemplateId)} className="text-red-500 hover:text-red-400 transition-colors px-2">✖</button>
                    </div>
                    <button onClick={handleGenerate} disabled={isLoading} className="bg-primary hover:bg-primary-hover text-white font-bold py-2 px-4 rounded-md disabled:bg-gray-500 transition-colors">
                        {isLoading ? 'Генерация...' : 'Сгенерировать смету'}
                    </button>
                </div>

                <div className="flex gap-4 mt-4">
                    <div className="p-2 flex items-center justify-between bg-background border border-border rounded-md">
                        <div className="flex items-center gap-4">
                            <span className="font-semibold text-text-secondary">Версия: {estimate.version}</span>
                            {getPreviousVersion() && (
                                <button onClick={() => setShowComparison(true)} className="text-sm text-blue-400 hover:underline">Сравнить с v{estimate.version - 1}</button>
                            )}
                            {initialEstimate && (
                                <button onClick={() => onSaveAsTemplate(estimate)} className="text-sm text-green-400 hover:text-green-300 font-semibold transition-colors">Сохранить как шаблон</button>
                            )}
                        </div>
                    </div>
                    <div className="p-2 bg-background border border-border rounded-md">
                        <select
                            onChange={(e) => {
                                if (e.target.value) {
                                    handleApplyBundle(e.target.value);
                                    e.target.value = ''; // Reset select
                                }
                            }}
                            className="w-full p-1 bg-background border border-border rounded-md text-text-primary text-sm"
                            defaultValue=""
                        >
                            <option value="">Добавить комплект...</option>
                            {bundles.map(bundle => (
                                <option key={bundle.id} value={bundle.id}>{bundle.name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="p-2 bg-background border border-border rounded-md">
                        <select
                            onChange={(e) => {
                                const val = e.target.value as EstimateCategory;
                                if (val) {
                                    addCategory(val);
                                    e.target.value = '';
                                }
                            }}
                            className="w-full p-1 bg-background border border-border rounded-md text-text-primary text-sm"
                            defaultValue=""
                        >
                            <option value="">Добавить раздел...</option>
                            {Object.values(EstimateCategory).map(cat => (
                                <option key={cat} value={cat} disabled={visibleCategories.includes(cat)}>{cat}</option>
                            ))}
                        </select>
                    </div>
                    <div className="p-2 flex items-center justify-end gap-4 bg-background border border-border rounded-md">
                        <span className="text-lg font-bold text-primary">ИТОГ: {estimate.total.toLocaleString('ru-RU')} ₽</span>
                        <button onClick={handleSave} className="bg-primary hover:bg-primary-hover text-white font-bold py-2 px-4 rounded-md shadow-md transition duration-300">
                            Сохранить
                        </button>
                    </div>
                </div>

                <div className="space-y-8 mt-6">
                    {ESTIMATE_CATEGORIES.map((category, catIndex) => {
                        const items = groupedItems.get(category) || [];
                        if (items.length === 0 && !visibleCategories.includes(category)) return null;

                        return (
                            <div key={category} className="border border-border rounded-lg bg-background/30">
                                <div className="bg-gray-900/50 p-3 flex justify-between items-center rounded-t-lg border-b border-border">
                                    <h3 className="text-lg font-bold text-text-primary">{catIndex + 1}. {category}</h3>
                                    <div className="font-semibold text-text-secondary">
                                        Итого по разделу: {(categorySubtotals.get(category) || 0).toLocaleString('ru-RU')} ₽
                                    </div>
                                    {visibleCategories.includes(category) && (
                                        <div className="ml-4">
                                            <button onClick={() => removeVisibleCategory(category)} className="text-red-400 hover:text-red-300 text-sm">Удалить раздел</button>
                                        </div>
                                    )}
                                </div>
                                {/* Split into Работы и Материалы внутри раздела */}
                                <div className="p-3 space-y-4">
                                    {[EstimateSubgroup.WORKS, EstimateSubgroup.MATERIALS].map((subgroup) => {
                                        const subItems = items.filter(i => (i.subgroup || EstimateSubgroup.WORKS) === subgroup);
                                        const subTotal = subItems.reduce((s, it) => s + (it.total || it.quantity * it.price), 0);
                                        return (
                                            <div key={subgroup} className="border border-border rounded-md bg-background/20">
                                                <div className="flex justify-between items-center p-2 bg-gray-900/30 border-b border-border rounded-t-md">
                                                    <div className="font-semibold">{subgroup}</div>
                                                    <div className="text-sm font-medium text-text-secondary">Итого ({subgroup}): {subTotal.toLocaleString('ru-RU')} ₽</div>
                                                </div>
                                                <div className="overflow-x-auto">
                                                    <table className="min-w-full">
                                                        <thead className="bg-gray-900/30">
                                                            <tr>
                                                                <th className="p-2 text-left font-semibold text-sm text-text-secondary w-2/5">Наименование</th>
                                                                <th className="p-2 text-left font-semibold text-sm text-text-secondary">Ед. изм.</th>
                                                                <th className="p-2 text-right font-semibold text-sm text-text-secondary">Кол-во</th>
                                                                <th className="p-2 text-right font-semibold text-sm text-text-secondary">Цена</th>
                                                                <th className="p-2 text-right font-semibold text-sm text-text-secondary">Сумма</th>
                                                                <th className="p-2 w-12"></th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {subItems.length === 0 && (
                                                                <tr>
                                                                    <td className="p-2 text-sm text-text-secondary" colSpan={6}>Нет позиций</td>
                                                                </tr>
                                                            )}
                                                            {subItems.map((item) => {
                                                                const filteredMaterials = materials.filter(m => m.category === category || m.category === EstimateCategory.GENERAL);
                                                                const filteredWorks = works.filter(w => w.category === category || w.category === EstimateCategory.GENERAL);
                                                                const useTypeaheadMaterials = filteredMaterials.length > TYPEAHEAD_THRESHOLD;
                                                                const useTypeaheadWorks = filteredWorks.length > TYPEAHEAD_THRESHOLD;
                                                                return (
                                                                <tr key={item.id} className="border-b border-border last:border-b-0">
                                                                    <td className="p-1">
                                                                        {subgroup === EstimateSubgroup.MATERIALS ? (
                                                                            useTypeaheadMaterials ? (
                                                                                <div className="relative">
                                                                                    <input
                                                                                        type="text"
                                                                                        id={`typeahead-input-${item.id}`}
                                                                                        value={item.name}
                                                                                        onChange={e => {
                                                                                            updateItem(item.id, 'name', e.target.value);
                                                                                            scheduleSuggestions(item.id, e.currentTarget.value, filteredMaterials);
                                                                                        }}
                                                                                        onBlur={e => {
                                                                                            hideTimeouts.current[item.id] = setTimeout(() => {
                                                                                                setShowSuggestions(prev => ({ ...prev, [item.id]: false }));
                                                                                                delete hideTimeouts.current[item.id];
                                                                                            }, 150);
                                                                                            tryApplyMaterialByName(item.id, (e.currentTarget as HTMLInputElement).value);
                                                                                        }}
                                                                                        onFocus={e => {
                                                                                            const cur = (e.currentTarget as HTMLInputElement).value;
                                                                                            scheduleSuggestions(item.id, cur, filteredMaterials);
                                                                                        }}
                                                                                        onKeyDown={e => { if (e.key === 'Enter') { (e.currentTarget as HTMLInputElement).blur(); tryApplyMaterialByName(item.id, (e.currentTarget as HTMLInputElement).value); } }}
                                                                                        placeholder="Поиск материала"
                                                                                        className={inputStyles + " text-sm"}
                                                                                    />
                                                                                    {renderSuggestionsPortal(item.id, suggestions[item.id] as Material[] | undefined, (it) => selectMaterialSuggestion(item.id, it as Material))}
                                                                                </div>
                                                                            ) : (
                                                                                <select value={item.name} onChange={e => handleMaterialSelect(item.id, e.target.value)} className={inputStyles + " text-sm"}>
                                                                                    <option value="">— Выберите материал —</option>
                                                                                    {filteredMaterials.map(mat => <option key={mat.id} value={mat.name}>{mat.name}</option>)}
                                                                                </select>
                                                                            )
                                                                        ) : subgroup === EstimateSubgroup.WORKS ? (
                                                                            useTypeaheadWorks ? (
                                                                                <div className="relative">
                                                                                    <input
                                                                                        type="text"
                                                                                        id={`typeahead-input-${item.id}`}
                                                                                        value={item.name}
                                                                                        onChange={e => {
                                                                                            updateItem(item.id, 'name', e.target.value);
                                                                                            scheduleSuggestions(item.id, e.currentTarget.value, filteredWorks);
                                                                                        }}
                                                                                        onBlur={e => {
                                                                                            hideTimeouts.current[item.id] = setTimeout(() => {
                                                                                                setShowSuggestions(prev => ({ ...prev, [item.id]: false }));
                                                                                                delete hideTimeouts.current[item.id];
                                                                                            }, 150);
                                                                                            tryApplyWorkByName(item.id, (e.currentTarget as HTMLInputElement).value);
                                                                                        }}
                                                                                        onFocus={e => {
                                                                                            const cur = (e.currentTarget as HTMLInputElement).value;
                                                                                            scheduleSuggestions(item.id, cur, filteredWorks);
                                                                                        }}
                                                                                        onKeyDown={e => { if (e.key === 'Enter') { (e.currentTarget as HTMLInputElement).blur(); tryApplyWorkByName(item.id, (e.currentTarget as HTMLInputElement).value); } }}
                                                                                        placeholder="Поиск работы"
                                                                                        className={inputStyles + " text-sm"}
                                                                                    />
                                                                                    {renderSuggestionsPortal(item.id, suggestions[item.id] as Work[] | undefined, (it) => selectWorkSuggestion(item.id, it as Work))}
                                                                                </div>
                                                                            ) : (
                                                                                <select value={item.name} onChange={e => handleWorkSelect(item.id, e.target.value)} className={inputStyles + " text-sm"}>
                                                                                    <option value="">— Выберите работу —</option>
                                                                                    {filteredWorks.map(wrk => <option key={wrk.id} value={wrk.name}>{wrk.name}</option>)}
                                                                                </select>
                                                                            )
                                                                        ) : (
                                                                            <input type="text" value={item.name} onChange={e => updateItem(item.id, 'name', e.target.value)} placeholder="Новая позиция" className={inputStyles + " text-sm"} />
                                                                        )}
                                                                    </td>
                                                                    <td className="p-1 w-24">
                                                                        <select value={item.unit} onChange={e => updateItem(item.id, 'unit', e.target.value)} className={inputStyles + " text-sm"}>
                                                                            <option value="м2">м2</option>
                                                                            <option value="м/п">м/п</option>
                                                                            <option value="шт">шт</option>
                                                                            <option value="уп">уп</option>
                                                                            <option value="м3">м3</option>
                                                                        </select>
                                                                    </td>
                                                                    <td className="p-1 w-32"><input type="number" value={item.quantity} onChange={e => updateItem(item.id, 'quantity', e.target.value)} className={inputStyles + " text-right text-sm"} /></td>
                                                                    <td className="p-1 w-32"><input type="number" value={item.price} onChange={e => updateItem(item.id, 'price', e.target.value)} className={inputStyles + " text-right text-sm"} /></td>
                                                                    <td className="p-1 w-32 text-right font-medium text-text-primary">{item.total.toLocaleString('ru-RU')} ₽</td>
                                                                    <td className="p-1 text-center"><button onClick={() => removeItem(item.id)} className="text-red-500 hover:text-red-400 transition-colors">✖</button></td>
                                                                </tr>
                                                            ) })}
                                                        </tbody>
                                                    </table>
                                                </div>
                                                <div className="p-2 bg-gray-900/30 border-t border-border rounded-b-md flex justify-end">
                                                    <button onClick={() => addItem(category, subgroup)} className="text-sm bg-gray-600 hover:bg-gray-500 text-text-primary font-bold py-1 px-3 rounded transition-colors">+ Добавить {subgroup === EstimateSubgroup.WORKS ? 'позицию (Работы)' : 'позицию (Материалы)'}</button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="flex justify-end items-center mt-8 pt-6 border-t border-border">
                    <div className="text-right">
                        <div className="text-3xl font-bold text-text-primary">ОБЩИЙ ИТОГ: {estimate.total.toLocaleString('ru-RU')} ₽</div>
                    </div>
                </div>

                <div className="flex justify-end mt-8">
                    <button onClick={handleSave} className="bg-primary hover:bg-primary-hover text-white font-bold py-3 px-8 rounded-md shadow-md transition duration-300 text-lg">
                        Сохранить смету
                    </button>
                </div>
            </div>
            {showComparison && getPreviousVersion() && (
                <VersionComparisonModal
                    oldVersion={getPreviousVersion()!}
                    newVersion={estimate}
                    onClose={() => setShowComparison(false)}
                />
            )}
        </div>
    );
};

export default EstimateEditor;