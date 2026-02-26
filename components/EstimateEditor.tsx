import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { Estimate, EstimateItem, EstimateStatus, GenerationParams, EstimateCategory, EstimateSubgroup, ProjectTemplate, Material, Work, WorkBundle } from '../types';
import { ESTIMATE_CATEGORIES } from '../constants';
import { generateEstimateWithAI } from '../services/geminiService';
import type { EstimateValidationResult } from '../services/estimateValidation';
import VersionComparisonModal from './VersionComparisonModal';
import AILoadingIndicator from './AILoadingIndicator';
import AIMissingItemsModal from './AIMissingItemsModal';
import AIGenerationModal from './AIGenerationModal';
import { aiAutocomplete, analyzeMissingItems } from '../services/openRouterService';
import { hasOpenRouterKey } from '../services/aiConfig';
import { maybeRecordCorrectionFromSession } from '../services/aiLearning';
import { aiCache } from '../services/aiCache';
import { generateEstimateNumber } from '../services/estimateNumber';

interface EstimateEditorProps {
    initialEstimate: Estimate | null;
    templates: ProjectTemplate[];
    materials: Material[];
    works: Work[];
    bundles: WorkBundle[];
    onRequestSave: (estimate: Estimate) => void;
    onDraftChange?: (estimate: Estimate) => void;
    onDirtyChange?: (dirty: boolean) => void;
    onSaveAsTemplate: (estimate: Estimate) => void;
    onDeleteTemplate: (templateId: string) => void;
    onBack: () => void;
    allEstimates: Estimate[];
    validationResult?: EstimateValidationResult | null;
    aiAccess?: {
        canUseAi: boolean;
        remaining?: number | null;
        onConsume?: (reason: 'autocomplete' | 'generation' | 'analysis') => void;
    };
    onUpgradeRequest?: () => void;
}

const EstimateEditor: React.FC<EstimateEditorProps> = ({ initialEstimate, templates, materials, works, bundles, onRequestSave, onDraftChange, onDirtyChange, onSaveAsTemplate, onDeleteTemplate, onBack, allEstimates, validationResult, aiAccess, onUpgradeRequest }) => {
    const createEmptyEstimate = useCallback((): Estimate => ({
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
        needsPriceUpdate: false,
    }), []);
    const baselineEstimate = useMemo(() => initialEstimate ?? createEmptyEstimate(), [initialEstimate, createEmptyEstimate]);
    const [estimate, setEstimate] = useState<Estimate>(baselineEstimate);
    useEffect(() => {
        setEstimate(baselineEstimate);
    }, [baselineEstimate]);
    const [genParams, setGenParams] = useState<GenerationParams>({
        area: 120,
        projectTemplateId: '3',
        region: 'Московская область',
    });
    const [isLoading, setIsLoading] = useState(false);
    const [aiBusyMessage, setAiBusyMessage] = useState<string | null>(null);
    const [aiWarnings, setAiWarnings] = useState<string[]>([]);
    const [aiTextSuggestions, setAiTextSuggestions] = useState<string[]>([]);
    const [aiAnalysisOpen, setAiAnalysisOpen] = useState(false);
    const [aiAnalysisMissing, setAiAnalysisMissing] = useState<EstimateItem[]>([]);
    const [aiAnalysisOptional, setAiAnalysisOptional] = useState<EstimateItem[]>([]);
    const [aiAnalysisReasoning, setAiAnalysisReasoning] = useState<string[]>([]);
    const [aiGenModalOpen, setAiGenModalOpen] = useState(false);
    const [aiGenDescription, setAiGenDescription] = useState('');
    const [aiGenEnableAiPriceSearch, setAiGenEnableAiPriceSearch] = useState(true);
    const [aiAddedItemIds, setAiAddedItemIds] = useState<Set<string>>(new Set());
    const [showComparison, setShowComparison] = useState(false);
    const [visibleCategories, setVisibleCategories] = useState<EstimateCategory[]>([]);
    // Typeahead / debounce state
    const TYPEAHEAD_THRESHOLD = 10; // show typeahead only if more than 10 items
    const DEBOUNCE_MS = 700; // increased to reduce AI calls and UI jank
    const [suggestions, setSuggestions] = useState<Record<string, (Material | Work)[]>>({});
    const [showSuggestions, setShowSuggestions] = useState<Record<string, boolean>>({});
    const debounceTimers = useRef<Record<string, any>>({});
    const suggestionPoolCacheRef = useRef<Record<string, { poolRef: (Material | Work)[]; entries: Array<{ item: Material | Work; key: string }> }>>({});
    const hideTimeouts = useRef<Record<string, any>>({});
    const [loadingPrices, setLoadingPrices] = useState<Record<string, boolean>>({});

    const aiSessionRef = useRef<null | {
        baselineItems: EstimateItem[];
        cacheKey: string;
        context: { area: number; region?: string; buildingType?: string; projectTemplateId?: string; projectTemplateName?: string; scopeDescription?: string };
    }>(null);

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

    const baselineSnapshot = useMemo(() => JSON.stringify(baselineEstimate), [baselineEstimate]);
    useEffect(() => {
        const currentSnapshot = JSON.stringify(estimate);
        const dirty = currentSnapshot !== baselineSnapshot;
        onDirtyChange?.(dirty);
    }, [baselineSnapshot, estimate, onDirtyChange]);

    useEffect(() => {
        onDraftChange?.(estimate);
    }, [estimate, onDraftChange]);

    const materialsIndex = useMemo(() => {
        const index = new Map<string, Material>();
        materials.forEach(material => index.set(material.name, material));
        return index;
    }, [materials]);

    const worksIndex = useMemo(() => {
        const index = new Map<string, Work>();
        works.forEach(work => index.set(work.name, work));
        return index;
    }, [works]);

    const filteredMaterialsByCategory = useMemo(() => {
        const map = new Map<EstimateCategory, Material[]>();
        Object.values(EstimateCategory).forEach(category => {
            map.set(category, materials.filter(material => material.category === category || material.category === EstimateCategory.GENERAL));
        });
        return map;
    }, [materials]);

    const filteredWorksByCategory = useMemo(() => {
        const map = new Map<EstimateCategory, Work[]>();
        Object.values(EstimateCategory).forEach(category => {
            map.set(category, works.filter(work => work.category === category || work.category === EstimateCategory.GENERAL));
        });
        return map;
    }, [works]);

    const scheduleSuggestions = (itemId: string, query: string, pool: (Material | Work)[]) => {
        clearDebounce(itemId);
        if (!query) {
            setSuggestions(prev => ({ ...prev, [itemId]: [] }));
            setShowSuggestions(prev => ({ ...prev, [itemId]: false }));
            return;
        }
        // Use precomputed lowercase cache for pool names to avoid repeated toLowerCase overhead
        const cachedPool = suggestionPoolCacheRef.current[itemId];
        if (!cachedPool || cachedPool.poolRef !== pool) {
            suggestionPoolCacheRef.current[itemId] = {
                poolRef: pool || [],
                entries: (pool || []).map(item => ({ item, key: String(item.name || '').toLowerCase() })),
            };
        }

        debounceTimers.current[itemId] = setTimeout(() => {
            const q = query.toLowerCase();
            const cached = suggestionPoolCacheRef.current[itemId]?.entries || [];
            const results = (cached || []).filter(p => p.key.includes(q)).map(p => p.item).slice(0, 20);
            setSuggestions(prev => ({ ...prev, [itemId]: results }));
            setShowSuggestions(prev => ({ ...prev, [itemId]: results.length > 0 }));

            // AI autocomplete as a fallback when local results are weak.
            // IMPORTANT: never blocks typing; runs after local results are shown.
            if (query.length >= 3 && results.length < 5) {
                if (aiAccess && !aiAccess.canUseAi) {
                    if (onUpgradeRequest) onUpgradeRequest();
                    return;
                }
                // run AI autocomplete in idle time to avoid blocking typing/render
                const runAi = () => {
                    (async () => {
                        try {
                            aiAccess?.onConsume?.('autocomplete');
                            const isMaterialPool = pool.length > 0 && (pool[0] as any).lastUpdated !== undefined;
                            const category = estimate.items.find(i => i.id === itemId)?.category;
                            if (!category) return;
                            const aiItems = await aiAutocomplete(query, category, estimate.items, materials, works, estimate.area);
                            if (!aiItems || aiItems.length === 0) return;

                            const mapped = aiItems.map((it, idx) => {
                                const id = `ai-suggest-${itemId}-${idx}`;
                                if (isMaterialPool) {
                                    const m: Material = {
                                        id,
                                        name: it.name,
                                        price: it.price,
                                        lastUpdated: new Date().toISOString(),
                                        category: it.category,
                                        isManualPrice: true,
                                    };
                                    return m;
                                }
                                const w: Work = {
                                    id,
                                    name: it.name,
                                    price: it.price,
                                    category: it.category,
                                };
                                return w;
                            });

                            setSuggestions(prev => ({ ...prev, [itemId]: mapped }));
                            setShowSuggestions(prev => ({ ...prev, [itemId]: mapped.length > 0 }));
                        } catch (e) {
                            console.debug('[EstimateEditor] aiAutocomplete failed', e);
                        }
                    })();
                };

                if (typeof (window as any).requestIdleCallback === 'function') {
                    (window as any).requestIdleCallback(runAi, { timeout: 2000 });
                } else {
                    // fallback
                    setTimeout(runAi, 250);
                }
            }
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

    // Totals by subgroup for summary (Работы / Материалы / Доставка)
    const subgroupTotals = useMemo(() => {
        const works = estimate.items.filter(i => (i.subgroup || EstimateSubgroup.WORKS) === EstimateSubgroup.WORKS).reduce((s, it) => s + (it.total || it.quantity * it.price), 0);
        const materials = estimate.items.filter(i => i.subgroup === EstimateSubgroup.MATERIALS).reduce((s, it) => s + (it.total || it.quantity * it.price), 0);
        const delivery = estimate.items.filter(i => i.subgroup === EstimateSubgroup.DELIVERY).reduce((s, it) => s + (it.total || it.quantity * it.price), 0);
        return { works, materials, delivery };
    }, [estimate.items]);

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
        const material = materialsIndex.get(materialName);
        if (!material) {
            // Allow AI suggestions that are not in the catalog
            const aiSuggested = (suggestions[itemId] as any[] | undefined)?.find(s => s?.name === materialName);
            if (aiSuggested && typeof aiSuggested.price === 'number') {
                console.info('[EstimateEditor] applying AI-suggested material', { itemId, name: materialName, price: aiSuggested.price });
                updateItemFields(itemId, { name: materialName, price: aiSuggested.price, unit: 'шт' });
                setShowSuggestions(prev => ({ ...prev, [itemId]: false }));
                setSuggestions(prev => ({ ...prev, [itemId]: [] }));
                return;
            }
            console.warn('[EstimateEditor] material not found in pool', { materialName });
            return;
        }
        console.debug('[EstimateEditor] found material', material);

        const price = material.price;

        console.info('[EstimateEditor] applying price to item', { itemId, name: material.name, price, unit: 'шт' });
        updateItemFields(itemId, { name: material.name, price, unit: 'шт' }); // Assume unit шт
    };

    // Try to apply material by exact name (used on blur / Enter) so user can type freely
    const tryApplyMaterialByName = async (itemId: string, name: string) => {
        if (!name) return;
        const material = materialsIndex.get(name);
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
        const work = worksIndex.get(workName);
        if (!work) {
            // Allow AI suggestions that are not in the catalog
            const aiSuggested = (suggestions[itemId] as any[] | undefined)?.find(s => s?.name === workName);
            if (aiSuggested && typeof aiSuggested.price === 'number') {
                updateItemFields(itemId, { name: workName, price: aiSuggested.price, unit: 'шт' });
            }
            return;
        }

        updateItemFields(itemId, { name: work.name, price: work.price, unit: 'шт' }); // Assume unit шт
    };


    // Try to apply work by exact name (used on blur / Enter) so user can type freely
    const tryApplyWorkByName = (itemId: string, name: string) => {
        if (!name) return;
        const work = worksIndex.get(name);
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

            // Основная кнопка: ВСЕГДА берем за основу выбранный шаблон и копируем его
            const templateItems = selectedTemplate?.items || [];
            const newItems = templateItems.map(item => ({
                ...item,
                id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                total: (item.quantity || 0) * (item.price || 0),
            }));
            const total = calculateTotal(newItems);
            setEstimate(prev => ({ ...prev, items: newItems, total }));

            if (!selectedTemplate) {
                alert('Шаблон не найден.');
            } else if (!selectedTemplate.items || selectedTemplate.items.length === 0) {
                alert('В выбранном шаблоне нет позиций. Используйте кнопку "Сгенерировать с помощью AI" для автозаполнения.');
            }
        } catch (error) {
            console.error("Failed to generate estimate", error);
            alert("Произошла ошибка при генерации сметы.");
        } finally {
            setIsLoading(false);
        }
    }, [genParams, templates]);

    const handleGenerateWithAI = useCallback(async (opts?: { scopeDescription?: string; enableAiPriceSearch?: boolean }) => {
        if (aiAccess && !aiAccess.canUseAi) {
            alert('Лимит AI-запросов исчерпан. Перейдите на платный план для продолжения.');
            if (onUpgradeRequest) onUpgradeRequest();
            return;
        }
        if (!hasOpenRouterKey()) {
            alert('AI не настроен: заполните VITE_OPENROUTER_API_KEY в .env');
            return;
        }
        if (!estimate.buildingType || !estimate.buildingType.trim()) {
            alert('Укажите тип строения перед AI-генерацией.');
            return;
        }
        if (!estimate.area || estimate.area <= 0) {
            alert('Укажите площадь перед AI-генерацией.');
            return;
        }
        setIsLoading(true);
        setAiBusyMessage('Генерирую смету с помощью AI');
        setAiWarnings([]);
        setAiTextSuggestions([]);
        try {
            aiAccess?.onConsume?.('generation');
            const latestOnlyEstimates = (() => {
                const byRoot = new Map<string, Estimate>();
                for (const e of (allEstimates || [])) {
                    if (!e || e.isArchived) continue;
                    const rootId = e.parentId || e.id;
                    const prev = byRoot.get(rootId);
                    if (!prev) {
                        byRoot.set(rootId, e);
                        continue;
                    }
                    const vA = typeof prev.version === 'number' ? prev.version : 0;
                    const vB = typeof e.version === 'number' ? e.version : 0;
                    if (vB > vA) {
                        byRoot.set(rootId, e);
                        continue;
                    }
                    if (vB === vA) {
                        const dA = Date.parse(prev.date || '');
                        const dB = Date.parse(e.date || '');
                        if (Number.isFinite(dB) && (!Number.isFinite(dA) || dB > dA)) byRoot.set(rootId, e);
                    }
                }
                return Array.from(byRoot.values());
            })();

            const selectedTemplate = templates.find(t => t.id === genParams.projectTemplateId);
            const templateItems = selectedTemplate?.items || [];
            // Для AI-режима: масштабируем базу шаблона под введённую площадь (если у шаблона задана baseArea).
            const baseArea = selectedTemplate?.baseArea || 0;
            const factor = baseArea > 0 && estimate.area > 0 ? (estimate.area / baseArea) : 1;

            const baseItems: EstimateItem[] = templateItems.map(item => {
                const quantity = Number(((item.quantity || 0) * factor).toFixed(2));
                const price = item.price || 0;
                return {
                ...item,
                id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                quantity,
                total: quantity * price,
                };
            });

            // AI дополняет базу (шаблон) и учитывает тип строения/шаблон
            const callParams = { ...genParams, area: estimate.area };
            const scopeDescription = (opts?.scopeDescription ?? aiGenDescription) || '';
            const enableAiPriceSearch = typeof opts?.enableAiPriceSearch === 'boolean'
                ? opts.enableAiPriceSearch
                : aiGenEnableAiPriceSearch;

            const { items: aiItems, suggestions, warnings } = await generateEstimateWithAI(
                callParams,
                latestOnlyEstimates,
                materials,
                works,
                baseItems,
                {
                    buildingType: estimate.buildingType,
                    projectTemplateId: selectedTemplate?.id,
                    projectTemplateName: selectedTemplate?.name,
                    templateItems: baseItems,
                    scopeDescription,
                    enableAiPriceSearch,
                },
            );

            const existingNames = new Set(baseItems.map(i => i.name.trim().toLowerCase()).filter(Boolean));
            const merged = [...baseItems];
            for (const it of aiItems) {
                const key = (it.name || '').trim().toLowerCase();
                if (!key) continue;
                if (existingNames.has(key)) continue;
                existingNames.add(key);
                merged.push({
                    ...it,
                    id: `item-ai-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                    total: (it.quantity || 0) * (it.price || 0),
                });
            }

            const total = calculateTotal(merged);
            setEstimate(prev => ({ ...prev, items: merged, total }));

            // Save baseline for learning on future user edits.
            // Cache key must match openRouterService.ts logic.
            const cacheKey = aiCache.generateKey(
                'estimate',
                genParams.area,
                genParams.region,
                estimate.buildingType,
                selectedTemplate?.id || genParams.projectTemplateId || null,
                selectedTemplate?.name || null,
                (baseItems || []).map(i => i.name).sort(),
            );
            aiSessionRef.current = {
                baselineItems: merged,
                cacheKey,
                context: {
                    area: genParams.area,
                    region: genParams.region,
                    buildingType: estimate.buildingType,
                    projectTemplateId: selectedTemplate?.id,
                    projectTemplateName: selectedTemplate?.name,
                    scopeDescription,
                },
            };

            if (suggestions && suggestions.length > 0) setAiTextSuggestions(suggestions);
            if (warnings && warnings.length > 0) setAiWarnings(warnings);
        } catch (error) {
            console.error('Failed to generate estimate with AI', error);
            alert('Произошла ошибка при AI-генерации сметы.');
        } finally {
            setAiBusyMessage(null);
            setIsLoading(false);
        }
    }, [genParams, templates, allEstimates, materials, works, estimate.buildingType, estimate.area, aiGenDescription, aiGenEnableAiPriceSearch, aiAccess, onUpgradeRequest]);

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
            estimateNumber: initialEstimate ? estimate.estimateNumber : generateEstimateNumber(allEstimates.map(item => item.estimateNumber), new Date())
        };

        // Learning: record user corrections vs last AI baseline (if any)
        if (aiSessionRef.current) {
            try {
                maybeRecordCorrectionFromSession({
                    baselineItems: aiSessionRef.current.baselineItems,
                    finalItems: finalEstimate.items,
                    context: aiSessionRef.current.context,
                    cacheKey: aiSessionRef.current.cacheKey,
                });
            } catch (e) {
                console.debug('[EstimateEditor] learning capture failed', e);
            }
        }

        setEstimate(finalEstimate);
        onRequestSave(finalEstimate);
    };

    const getPreviousVersion = (): Estimate | undefined => {
        if (!initialEstimate) return undefined;
        const parentId = initialEstimate.parentId || initialEstimate.id;
        return allEstimates.find(e => (e.id === parentId || e.parentId === parentId) && e.version === initialEstimate.version - 1);
    };

    const inputStyles = "p-2 bg-background border border-border rounded-md text-text-primary focus:ring-primary focus:border-primary w-full";

    const hasValidationIssues = Boolean(validationResult && validationResult.issues.length > 0);
    const getFieldClass = (itemId: string, field: 'name' | 'quantity' | 'price', base: string) => {
        const invalid = Boolean(validationResult?.invalidFieldsByItemId?.[itemId]?.[field]);
        return invalid ? `${base} border-red-500` : base;
    };

    const getItemIssueMessages = (itemId: string) => {
        const issues = (validationResult?.issues || []).filter(i => i.itemId === itemId);
        return Array.from(new Set(issues.map(i => i.message)));
    };

    return (
        <div className="space-y-6">
            <div className="bg-surface p-6 rounded-lg shadow-2xl">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-2xl font-bold text-text-primary">{initialEstimate ? `Редактирование сметы №${estimate.estimateNumber}` : 'Создание новой сметы'}</h2>
                    <button onClick={onBack} className="text-text-secondary hover:text-text-primary">&larr; Назад к истории</button>
                </div>

                {hasValidationIssues && (
                    <div className="mb-4 p-3 border border-red-500/40 bg-background/40 rounded-md">
                        <div className="font-semibold text-red-400">Есть ошибки в смете — исправьте перед PDF/отправкой</div>
                        <div className="text-sm text-text-secondary">Проблемных строк: {validationResult!.invalidItemIds.size}. Ошибок: {validationResult!.issues.length}.</div>
                    </div>
                )}

                {aiBusyMessage && (
                    <div className="mb-4">
                        <AILoadingIndicator message={aiBusyMessage} />
                    </div>
                )}

                {aiWarnings.length > 0 && (
                    <div className="mb-4 p-3 border border-red-500/40 bg-background/40 rounded-md">
                        <div className="font-semibold text-red-400">Предупреждения AI</div>
                        <ul className="list-disc pl-5 text-sm text-text-secondary">
                            {aiWarnings.map((w, idx) => (
                                <li key={idx}>{w}</li>
                            ))}
                        </ul>
                    </div>
                )}

                {aiTextSuggestions.length > 0 && (
                    <div className="mb-4 p-3 border border-border bg-background/30 rounded-md">
                        <div className="font-semibold text-text-primary">Рекомендации AI</div>
                        <ul className="list-disc pl-5 text-sm text-text-secondary">
                            {aiTextSuggestions.map((s, idx) => (
                                <li key={idx}>{s}</li>
                            ))}
                        </ul>
                    </div>
                )}

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
                    <div className="flex gap-2 items-center">
                        <button onClick={handleGenerate} disabled={isLoading} className="bg-primary hover:bg-primary-hover text-white font-bold py-2 px-4 rounded-md disabled:bg-gray-500 transition-colors">
                            {isLoading ? 'Генерация...' : 'Сгенерировать по шаблону'}
                        </button>
                        <button
                            onClick={() => {
                                if (aiAccess && !aiAccess.canUseAi) {
                                    alert('Лимит AI-запросов исчерпан. Перейдите на платный план для продолжения.');
                                    if (onUpgradeRequest) onUpgradeRequest();
                                    return;
                                }
                                if (!hasOpenRouterKey()) {
                                    alert('AI не настроен: заполните VITE_OPENROUTER_API_KEY в .env');
                                    return;
                                }
                                if (!estimate.buildingType || !estimate.buildingType.trim()) {
                                    alert('Укажите тип строения перед AI-генерацией.');
                                    return;
                                }
                                if (!estimate.area || estimate.area <= 0) {
                                    alert('Укажите площадь перед AI-генерацией.');
                                    return;
                                }
                                setAiGenModalOpen(true);
                            }}
                            disabled={isLoading}
                            className="text-sm bg-gray-600 hover:bg-gray-500 text-text-primary font-bold py-2 px-3 rounded transition-colors disabled:bg-gray-500"
                        >
                            AI
                        </button>
                    </div>
                </div>

                <div className="flex gap-2 mb-4">
                    <button
                        onClick={async () => {
                                if (aiAccess && !aiAccess.canUseAi) {
                                    alert('Лимит AI-запросов исчерпан. Перейдите на платный план для продолжения.');
                                    if (onUpgradeRequest) onUpgradeRequest();
                                    return;
                                }
                            setIsLoading(true);
                            setAiBusyMessage('Анализирую смету');
                            try {
                                    aiAccess?.onConsume?.('analysis');
                                const similar = allEstimates.filter(e =>
                                    e.buildingType === estimate.buildingType &&
                                    estimate.area > 0 &&
                                    Math.abs(e.area - estimate.area) / estimate.area < 0.3,
                                );

                                const presentCategories = Array.from(new Set((estimate.items || []).map(i => i.category)));
                                const analysis = await analyzeMissingItems(estimate, similar, materials, works, presentCategories);
                                setAiAnalysisMissing(analysis.missing);
                                setAiAnalysisOptional(analysis.optional);
                                setAiAnalysisReasoning(analysis.reasoning);
                                setAiAnalysisOpen(true);
                            } catch (e) {
                                console.error('[EstimateEditor] AI analysis failed', e);
                                alert('Не удалось выполнить AI-анализ сметы.');
                            } finally {
                                setAiBusyMessage(null);
                                setIsLoading(false);
                            }
                        }}
                        disabled={isLoading}
                        className="text-sm bg-gray-600 hover:bg-gray-500 text-text-primary font-bold py-2 px-4 rounded transition-colors disabled:bg-gray-500"
                    >
                        🤖 AI-анализ сметы
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
                        <div className="flex flex-col items-end mr-4">
                            <div className="text-sm text-text-secondary">Работы: {subgroupTotals.works.toLocaleString('ru-RU')} ₽</div>
                            <div className="text-sm text-text-secondary">Материалы: {subgroupTotals.materials.toLocaleString('ru-RU')} ₽</div>
                            <div className="text-sm text-text-secondary">Доставка: {subgroupTotals.delivery.toLocaleString('ru-RU')} ₽</div>
                            <div className="text-lg font-bold text-primary mt-1">ИТОГ: {estimate.total.toLocaleString('ru-RU')} ₽</div>
                        </div>
                        <div>
                            <button onClick={handleSave} className="bg-primary hover:bg-primary-hover text-white font-bold py-2 px-4 rounded-md shadow-md transition duration-300">
                                Сохранить
                            </button>
                        </div>
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
                                                {(() => {
                                                    const catTotal = categorySubtotals.get(category) || 0;
                                                    const catItems = items;
                                                    const worksTotal = catItems.filter(i => (i.subgroup || EstimateSubgroup.WORKS) === EstimateSubgroup.WORKS).reduce((s, it) => s + (it.total || it.quantity * it.price), 0);
                                                    const materialsTotal = catItems.filter(i => i.subgroup === EstimateSubgroup.MATERIALS).reduce((s, it) => s + (it.total || it.quantity * it.price), 0);
                                                    const deliveryTotal = catItems.filter(i => i.subgroup === EstimateSubgroup.DELIVERY).reduce((s, it) => s + (it.total || it.quantity * it.price), 0);
                                                    if (category === EstimateCategory.LOGISTICS) {
                                                        return (
                                                            <div className="font-semibold text-text-secondary">Итого по разделу: {catTotal.toLocaleString('ru-RU')} ₽ (Работы: {worksTotal.toLocaleString('ru-RU')} ₽, Доставка: {deliveryTotal.toLocaleString('ru-RU')} ₽)</div>
                                                        );
                                                    }
                                                    return (
                                                        <div className="font-semibold text-text-secondary">Итого по разделу: {catTotal.toLocaleString('ru-RU')} ₽ (Работы: {worksTotal.toLocaleString('ru-RU')} ₽, Материалы: {materialsTotal.toLocaleString('ru-RU')} ₽)</div>
                                                    );
                                                })()}
                                    {visibleCategories.includes(category) && (
                                        <div className="ml-4">
                                            <button onClick={() => removeVisibleCategory(category)} className="text-red-400 hover:text-red-300 text-sm">Удалить раздел</button>
                                        </div>
                                    )}
                                </div>
                                {/* Split into Работы и Материалы/Доставка внутри раздела */}
                                <div className="p-3 space-y-4">
                                    {((category: EstimateCategory) => {
                                        return (category === EstimateCategory.LOGISTICS) ? [EstimateSubgroup.WORKS, EstimateSubgroup.DELIVERY] : [EstimateSubgroup.WORKS, EstimateSubgroup.MATERIALS];
                                    })(category).map((subgroup) => {
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
                                                                const filteredMaterials = filteredMaterialsByCategory.get(category) || [];
                                                                const filteredWorks = filteredWorksByCategory.get(category) || [];
                                                                const useTypeaheadMaterials = filteredMaterials.length > TYPEAHEAD_THRESHOLD;
                                                                const useTypeaheadWorks = filteredWorks.length > TYPEAHEAD_THRESHOLD;
                                                                return (
                                                                <tr key={item.id} className={"border-b border-border last:border-b-0" + (validationResult?.invalidItemIds?.has(item.id) ? " bg-red-500/5" : "")}>
                                                                    <td className="p-1">
                                                                        { (subgroup === EstimateSubgroup.MATERIALS || subgroup === EstimateSubgroup.DELIVERY) ? (
                                                                            useTypeaheadMaterials ? (
                                                                                <div className="relative">
                                                                                    <input
                                                                                        type="text"
                                                                                        id={`typeahead-input-${item.id}`}
                                                                                        disabled={!!loadingPrices[item.id]}
                                                                                        style={{ cursor: loadingPrices[item.id] ? 'wait' : undefined }}
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
                                                                                        className={getFieldClass(item.id, 'name', inputStyles + " text-sm")}
                                                                                    />
                                                                                    {renderSuggestionsPortal(item.id, suggestions[item.id] as Material[] | undefined, (it) => selectMaterialSuggestion(item.id, it as Material))}
                                                                                </div>
                                                                            ) : (
                                                                                <select
                                                                                    value={item.name}
                                                                                    onChange={e => handleMaterialSelect(item.id, e.target.value)}
                                                                                    disabled={!!loadingPrices[item.id]}
                                                                                    style={{ cursor: loadingPrices[item.id] ? 'wait' : undefined }}
                                                                                    className={getFieldClass(item.id, 'name', inputStyles + " text-sm")}
                                                                                >
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
                                                                                        className={getFieldClass(item.id, 'name', inputStyles + " text-sm")}
                                                                                    />
                                                                                    {renderSuggestionsPortal(item.id, suggestions[item.id] as Work[] | undefined, (it) => selectWorkSuggestion(item.id, it as Work))}
                                                                                </div>
                                                                            ) : (
                                                                                <select value={item.name} onChange={e => handleWorkSelect(item.id, e.target.value)} className={getFieldClass(item.id, 'name', inputStyles + " text-sm")}>
                                                                                    <option value="">— Выберите работу —</option>
                                                                                    {filteredWorks.map(wrk => <option key={wrk.id} value={wrk.name}>{wrk.name}</option>)}
                                                                                </select>
                                                                            )
                                                                        ) : (
                                                                            <input type="text" value={item.name} onChange={e => updateItem(item.id, 'name', e.target.value)} placeholder="Новая позиция" className={getFieldClass(item.id, 'name', inputStyles + " text-sm")} />
                                                                        )}

                                                                        {validationResult?.invalidItemIds?.has(item.id) && getItemIssueMessages(item.id).length > 0 && (
                                                                            <div className="mt-1 text-xs text-red-400">
                                                                                {getItemIssueMessages(item.id).join(' • ')}
                                                                            </div>
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
                                                                    <td className="p-1 w-32"><input type="number" value={item.quantity} onChange={e => updateItem(item.id, 'quantity', e.target.value)} className={getFieldClass(item.id, 'quantity', inputStyles + " text-right text-sm")} /></td>
                                                                    <td className="p-1 w-32"><input type="number" value={item.price} onChange={e => updateItem(item.id, 'price', e.target.value)} className={getFieldClass(item.id, 'price', inputStyles + " text-right text-sm")} /></td>
                                                                    <td className="p-1 w-32 text-right font-medium text-text-primary">{item.total.toLocaleString('ru-RU')} ₽</td>
                                                                    <td className="p-1 text-center"><button onClick={() => removeItem(item.id)} className="text-red-500 hover:text-red-400 transition-colors">✖</button></td>
                                                                </tr>
                                                            ) })}
                                                        </tbody>
                                                    </table>
                                                </div>
                                                <div className="p-2 bg-gray-900/30 border-t border-border rounded-b-md flex justify-end">
                                                    <button onClick={() => addItem(category, subgroup)} className="text-sm bg-gray-600 hover:bg-gray-500 text-text-primary font-bold py-1 px-3 rounded transition-colors">+ Добавить {subgroup === EstimateSubgroup.WORKS ? 'позицию (Работы)' : subgroup === EstimateSubgroup.DELIVERY ? 'позицию (Доставка)' : 'позицию (Материалы)'}</button>
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
                    <div className="flex flex-col items-end mr-6">
                        <div className="text-sm text-text-secondary">Работы: {subgroupTotals.works.toLocaleString('ru-RU')} ₽</div>
                        <div className="text-sm text-text-secondary">Материалы: {subgroupTotals.materials.toLocaleString('ru-RU')} ₽</div>
                        <div className="text-sm text-text-secondary">Доставка: {subgroupTotals.delivery.toLocaleString('ru-RU')} ₽</div>
                        <div className="text-3xl font-bold text-text-primary mt-1">ОБЩИЙ ИТОГ: {estimate.total.toLocaleString('ru-RU')} ₽</div>
                    </div>
                </div>

                <div className="flex justify-end mt-8">
                    <button onClick={handleSave} className="bg-primary hover:bg-primary-hover text-white font-bold py-3 px-8 rounded-md shadow-md transition duration-300 text-lg">
                        Сохранить смету
                    </button>
                </div>
            </div>

            <AIMissingItemsModal
                isOpen={aiAnalysisOpen}
                onClose={() => setAiAnalysisOpen(false)}
                missing={aiAnalysisMissing}
                optional={aiAnalysisOptional}
                reasoning={aiAnalysisReasoning}
                onAddItem={(item) => {
                    setEstimate(prev => {
                        const newItem: EstimateItem = {
                            ...item,
                            id: `item-ai-add-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                            total: (item.quantity || 0) * (item.price || 0),
                        };
                        const newItems = [...prev.items, newItem];
                        return { ...prev, items: newItems, total: calculateTotal(newItems) };
                    });
                    setAiAnalysisMissing(prev => prev.filter(({ id }) => id !== item.id));
                    setAiAnalysisOptional(prev => prev.filter(({ id }) => id !== item.id));
                    setAiAddedItemIds(prev => {
                        const next = new Set(prev);
                        next.add(item.id);
                        return next;
                    });
                }}
                addedItemIds={aiAddedItemIds}
            />

            <AIGenerationModal
                isOpen={aiGenModalOpen}
                initialValue={aiGenDescription}
                initialEnableAiPriceSearch={aiGenEnableAiPriceSearch}
                onCancel={() => setAiGenModalOpen(false)}
                onConfirm={(payload) => {
                    setAiGenDescription(payload.description);
                    setAiGenEnableAiPriceSearch(payload.enableAiPriceSearch);
                    setAiGenModalOpen(false);
                    handleGenerateWithAI({ scopeDescription: payload.description, enableAiPriceSearch: payload.enableAiPriceSearch });
                }}
            />
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
