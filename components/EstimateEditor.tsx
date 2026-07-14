import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { Estimate, EstimateItem, EstimateStatus, GenerationParams, EstimateCategory, EstimateSubgroup, ProjectTemplate, Material, Work, WorkBundle } from '../types';
import { ESTIMATE_CATEGORIES } from '../types';
import { generateEstimateWithAI } from '../services/geminiService';
import type { EstimateValidationResult } from '../services/estimateValidation';
import VersionComparisonModal from './VersionComparisonModal';
import AILoadingIndicator from './AILoadingIndicator';
import AIMissingItemsModal from './AIMissingItemsModal';
import AIGenerationModal from './AIGenerationModal';
import BundlePickerModal from './BundlePickerModal';
import PasteFromEstimateModal from './PasteFromEstimateModal';
import { aiAutocomplete, analyzeMissingItems, applySmartPackagingRules, sanitizeQuantities } from '../services/openRouterService';
import { hasOpenRouterKey } from '../services/aiConfig';
import { maybeRecordCorrectionFromSession } from '../services/aiLearning';
import { aiCache } from '../services/aiCache';
import { generateEstimateNumber } from '../services/estimateNumber';
import { useOptionalEstimateContext } from '../contexts/EstimateContext';
import { useOptionalCatalogContext } from '../contexts/CatalogContext';
import { useOptionalSubscriptionContext } from '../contexts/SubscriptionContext';
import {
    ActualFilter,
    calculateActualSummary,
    calculateActualItemTotal,
    copyPlanToActual,
    shouldShowActualRow,
} from '../services/estimateActuals';

interface EstimateEditorProps {
    initialEstimate?: Estimate | null;
    templates?: ProjectTemplate[];
    materials?: Material[];
    works?: Work[];
    bundles?: WorkBundle[];
    onRequestSave?: (estimate: Estimate) => void;
    onDraftChange?: (estimate: Estimate) => void;
    onDirtyChange?: (dirty: boolean) => void;
    onSaveAsTemplate?: (estimate: Estimate) => void;
    onDeleteTemplate?: (templateId: string) => void;
    onBack?: () => void;
    allEstimates?: Estimate[];
    validationResult?: EstimateValidationResult | null;
    aiAccess?: {
        canUseAi: boolean;
        remaining?: number | null;
        onConsume?: (reason: 'autocomplete' | 'generation' | 'analysis') => void;
    };
    onUpgradeRequest?: () => void;
}

type NonUrgentTaskHandle =
    | { kind: 'idle'; id: number }
    | { kind: 'timeout'; id: number };

const MAX_RENDERED_SUBITEMS = 50;

const isAbortError = (error: unknown): boolean => {
    return error instanceof DOMException
        ? error.name === 'AbortError'
        : error instanceof Error && error.name === 'AbortError';
};

const hashText = (seed: number, value: string): number => {
    let next = seed;
    for (let index = 0; index < value.length; index += 1) {
        next = (next * 31 + value.charCodeAt(index)) | 0;
    }
    return (next * 31 + 124) | 0;
};

const hashNumber = (seed: number, value: number): number => {
    return (seed * 31 + Math.round(value * 1000)) | 0;
};

const hashBoolean = (seed: number, value: boolean): number => {
    return (seed * 31 + (value ? 1 : 0)) | 0;
};

const buildEstimateDirtySignature = (value: Estimate): number => {
    let hash = 17;
    hash = hashText(hash, value.client);
    hash = hashText(hash, value.date);
    hash = hashText(hash, value.status);
    hash = hashText(hash, value.buildingType);
    hash = hashNumber(hash, value.area || 0);
    hash = hashNumber(hash, value.total || 0);
    hash = hashBoolean(hash, Boolean(value.needsPriceUpdate));

    for (const item of value.items) {
        hash = hashText(hash, item.name);
        hash = hashText(hash, item.unit);
        hash = hashNumber(hash, item.quantity || 0);
        hash = hashNumber(hash, item.price || 0);
        hash = hashNumber(hash, item.total || 0);
        hash = hashText(hash, item.category);
        hash = hashText(hash, item.subgroup || EstimateSubgroup.WORKS);
        hash = hashBoolean(hash, Boolean(item.isActualOnly));
        hash = hashText(hash, item.actual?.unit || '');
        hash = hashNumber(hash, item.actual?.quantity ?? 0);
        hash = hashNumber(hash, item.actual?.price ?? 0);
        hash = hashText(hash, item.actual?.note || '');
    }

    return hash;
};

const groupCatalogByCategory = <T extends Material | Work>(items: T[]): Map<EstimateCategory, T[]> => {
    const grouped = new Map<EstimateCategory, T[]>();
    const generalItems: T[] = [];

    for (const item of items) {
        if (item.category === EstimateCategory.GENERAL) {
            generalItems.push(item);
            continue;
        }

        const existing = grouped.get(item.category) ?? [];
        existing.push(item);
        grouped.set(item.category, existing);
    }

    for (const category of Object.values(EstimateCategory)) {
        const existing = grouped.get(category) ?? [];
        grouped.set(category, generalItems.length > 0 ? [...existing, ...generalItems] : existing);
    }

    return grouped;
};

const isMaterialCatalogItem = (item: Material | Work | undefined): item is Material => {
    return Boolean(item && 'lastUpdated' in item);
};

const scheduleNonUrgentTask = (task: () => void): NonUrgentTaskHandle => {
    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
        return {
            kind: 'idle',
            id: window.requestIdleCallback(() => {
                task();
            }, { timeout: 2000 }),
        };
    }

    return {
        kind: 'timeout',
        id: window.setTimeout(task, 250),
    };
};

const cancelNonUrgentTask = (handle?: NonUrgentTaskHandle): void => {
    if (!handle) {
        return;
    }

    if (handle.kind === 'idle') {
        if (typeof window !== 'undefined' && typeof window.cancelIdleCallback === 'function') {
            window.cancelIdleCallback(handle.id);
        }
        return;
    }

    clearTimeout(handle.id);
};

const EstimateEditor: React.FC<EstimateEditorProps> = ({ initialEstimate, templates, materials, works, bundles, onRequestSave, onDraftChange, onDirtyChange, onSaveAsTemplate, onDeleteTemplate, onBack, allEstimates, validationResult, aiAccess, onUpgradeRequest }) => {
    const estimateContext = useOptionalEstimateContext();
    const catalogContext = useOptionalCatalogContext();
    const subscriptionContext = useOptionalSubscriptionContext();

    const initialEstimateValue = initialEstimate ?? estimateContext?.currentEstimate ?? null;
    const templatesValue = useMemo(() => templates ?? estimateContext?.templates ?? [], [templates, estimateContext?.templates]);
    const visibleEstimatesValue = useMemo(() => estimateContext?.estimates ?? [], [estimateContext?.estimates]);
    const materialsValue = useMemo(() => materials ?? catalogContext?.materials ?? [], [materials, catalogContext?.materials]);
    const worksValue = useMemo(() => works ?? catalogContext?.works ?? [], [works, catalogContext?.works]);
    const bundlesValue = useMemo(() => bundles ?? catalogContext?.bundles ?? [], [bundles, catalogContext?.bundles]);
    const allEstimatesValue = useMemo(() => allEstimates ?? estimateContext?.allEstimates ?? visibleEstimatesValue, [allEstimates, estimateContext?.allEstimates, visibleEstimatesValue]);
    const onRequestSaveAction = onRequestSave ?? estimateContext?.actions.onRequestSave;
    const onDraftChangeAction = onDraftChange ?? estimateContext?.actions.onDraftChange;
    const onDirtyChangeAction = onDirtyChange ?? estimateContext?.actions.onDirtyChange;
    const onSaveAsTemplateAction = onSaveAsTemplate ?? estimateContext?.actions.onSaveAsTemplate;
    const onDeleteTemplateAction = onDeleteTemplate ?? estimateContext?.actions.onDeleteTemplate;
    const onBackAction = onBack ?? estimateContext?.actions.onBack;
    const validationResultValue = validationResult ?? estimateContext?.validationResult ?? null;
    const aiAccessValue = aiAccess ?? subscriptionContext?.aiAccess;

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
    const baselineEstimate = useMemo(() => initialEstimateValue ?? createEmptyEstimate(), [initialEstimateValue, createEmptyEstimate]);
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
    const [aiNotInDbItems, setAiNotInDbItems] = useState<import('./AIMissingItemsModal').NotInDbItem[]>([]);
    const [aiAddedToCatalogNames, setAiAddedToCatalogNames] = useState<Set<string>>(new Set());
    const [showComparison, setShowComparison] = useState(false);
    const [bundlePickerOpen, setBundlePickerOpen] = useState(false);
    const [quickBundleWorkId, setQuickBundleWorkId] = useState<string | null>(null);
    const [quickBundleItemIds, setQuickBundleItemIds] = useState<Set<string>>(new Set());
    const [quickBundleName, setQuickBundleName] = useState('');
    const [quickBundleModalOpen, setQuickBundleModalOpen] = useState(false);
    const [quickBundleNotice, setQuickBundleNotice] = useState<string | null>(null);
    const [pasteModalOpen, setPasteModalOpen] = useState(false);
    const [pasteTargetCategory, setPasteTargetCategory] = useState<EstimateCategory>(EstimateCategory.FOUNDATION);
    const [visibleCategories, setVisibleCategories] = useState<EstimateCategory[]>(baselineEstimate.selectedSections ?? []);
    const [showActuals, setShowActuals] = useState(false);
    const [actualFilter, setActualFilter] = useState<ActualFilter>('all');
    const [expandedSubgroups, setExpandedSubgroups] = useState<Record<string, boolean>>({});
    const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>(() => {
        if (typeof window !== 'undefined' && window.innerWidth < 640) {
            const initial: Record<string, boolean> = {};
            ESTIMATE_CATEGORIES.forEach(c => { initial[c] = true; });
            return initial;
        }
        return {};
    });
    const toggleCategoryCollapse = (cat: string) => {
        setCollapsedCategories(prev => ({ ...prev, [cat]: !prev[cat] }));
    };
    const [openNotes, setOpenNotes] = useState<Record<string, boolean>>({});
    // Typeahead / debounce state
    const TYPEAHEAD_THRESHOLD = 10; // show typeahead only if more than 10 items
    const DEBOUNCE_MS = 700; // increased to reduce AI calls and UI jank
    const [suggestions, setSuggestions] = useState<Record<string, (Material | Work)[]>>({});
    const [showSuggestions, setShowSuggestions] = useState<Record<string, boolean>>({});
    const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
    const suggestionPoolCacheRef = useRef<Record<string, { poolRef: (Material | Work)[]; entries: Array<{ item: Material | Work; key: string }> }>>({});
    const hideTimeouts = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
    const scheduledAutocompleteTasksRef = useRef<Record<string, NonUrgentTaskHandle>>({});
    const autocompleteAbortControllerRef = useRef<AbortController | null>(null);
    const generationAbortControllerRef = useRef<AbortController | null>(null);
    const analysisAbortControllerRef = useRef<AbortController | null>(null);
    const [loadingPrices, _setLoadingPrices] = useState<Record<string, boolean>>({});

    const aiSessionRef = useRef<null | {
        baselineItems: EstimateItem[];
        cacheKey: string;
        context: { area: number; region?: string; buildingType?: string; projectTemplateId?: string; projectTemplateName?: string; scopeDescription?: string };
    }>(null);

    useEffect(() => {
        return () => {
            Object.values(debounceTimers.current).forEach(timerId => clearTimeout(timerId));
            debounceTimers.current = {};

            Object.values(hideTimeouts.current).forEach(timerId => clearTimeout(timerId));
            hideTimeouts.current = {};

            Object.values(scheduledAutocompleteTasksRef.current).forEach(handle => cancelNonUrgentTask(handle));
            scheduledAutocompleteTasksRef.current = {};

            autocompleteAbortControllerRef.current?.abort();
            generationAbortControllerRef.current?.abort();
            analysisAbortControllerRef.current?.abort();
        };
    }, []);

    useEffect(() => {
        setExpandedSubgroups({});
    }, [baselineEstimate]);

    // Update genParams if selected template is deleted
    useEffect(() => {
        if (templatesValue.length > 0 && !templatesValue.find(t => t.id === genParams.projectTemplateId)) {
            setGenParams(prev => ({ ...prev, projectTemplateId: templatesValue[0].id }));
        }
    }, [templatesValue, genParams.projectTemplateId]);

    const clearDebounce = (itemId: string) => {
        const t = debounceTimers.current[itemId];
        if (t) {
            clearTimeout(t);
            delete debounceTimers.current[itemId];
        }
    };

    const clearScheduledAutocompleteTask = (itemId: string) => {
        const handle = scheduledAutocompleteTasksRef.current[itemId];
        if (!handle) {
            return;
        }

        cancelNonUrgentTask(handle);
        delete scheduledAutocompleteTasksRef.current[itemId];
    };

    const baselineSnapshot = useMemo(() => buildEstimateDirtySignature(baselineEstimate), [baselineEstimate]);
    useEffect(() => {
        const currentSnapshot = buildEstimateDirtySignature(estimate);
        const dirty = currentSnapshot !== baselineSnapshot;
        onDirtyChangeAction?.(dirty);
    }, [baselineSnapshot, estimate, onDirtyChangeAction]);

    useEffect(() => {
        onDraftChangeAction?.(estimate);
    }, [estimate, onDraftChangeAction]);

    const materialsIndex = useMemo(() => {
        const index = new Map<string, Material>();
        materialsValue.forEach(material => index.set(material.name, material));
        return index;
    }, [materialsValue]);

    const worksIndex = useMemo(() => {
        const index = new Map<string, Work>();
        worksValue.forEach(work => index.set(work.name, work));
        return index;
    }, [worksValue]);

    const filteredMaterialsByCategory = useMemo(() => groupCatalogByCategory(materialsValue), [materialsValue]);

    const filteredWorksByCategory = useMemo(() => groupCatalogByCategory(worksValue), [worksValue]);

    const scheduleSuggestions = (itemId: string, query: string, pool: (Material | Work)[]) => {
        clearDebounce(itemId);
        clearScheduledAutocompleteTask(itemId);
        autocompleteAbortControllerRef.current?.abort();
        autocompleteAbortControllerRef.current = null;
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
                if (aiAccessValue && !aiAccessValue.canUseAi) {
                    if (onUpgradeRequest) onUpgradeRequest();
                    return;
                }
                // run AI autocomplete in idle time to avoid blocking typing/render
                const runAi = () => {
                    delete scheduledAutocompleteTasksRef.current[itemId];
                    (async () => {
                        const controller = new AbortController();
                        autocompleteAbortControllerRef.current?.abort();
                        autocompleteAbortControllerRef.current = controller;

                        try {
                            aiAccessValue?.onConsume?.('autocomplete');
                            const isMaterialPool = isMaterialCatalogItem(pool[0]);
                            const category = estimate.items.find(i => i.id === itemId)?.category;
                            if (!category) return;
                            const aiItems = await aiAutocomplete(query, category, estimate.items, materialsValue, worksValue, estimate.area, controller.signal);
                            if (controller.signal.aborted) return;
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
                            if (isAbortError(e)) {
                                return;
                            }
                            console.debug('[EstimateEditor] aiAutocomplete failed', e);
                        } finally {
                            if (autocompleteAbortControllerRef.current === controller) {
                                autocompleteAbortControllerRef.current = null;
                            }
                        }
                    })();
                };

                scheduledAutocompleteTasksRef.current[itemId] = scheduleNonUrgentTask(runAi);
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
                    <li key={it.id}
                        onMouseDown={e => { e.preventDefault(); if (hideTimeouts.current[itemId]) { clearTimeout(hideTimeouts.current[itemId]); delete hideTimeouts.current[itemId]; } clearDebounce(itemId); onSelect(it); }}
                        className="p-2 hover:bg-gray-700 cursor-pointer text-sm text-white"
                        style={{ color: 'var(--text-primary, #fff)' }}
                    >
                        {it.name}
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

    const actualSummary = useMemo(() => calculateActualSummary(estimate), [estimate]);

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

    const updateActualItem = (itemId: string, field: 'unit' | 'quantity' | 'price' | 'note', value: string | number) => {
        setEstimate(prev => {
            const newItems = prev.items.map(item => {
                if (item.id !== itemId) return item;
                const actual = { ...item.actual };
                if (field === 'quantity' || field === 'price') {
                    actual[field] = value === '' ? null : Number(value) || 0;
                } else {
                    actual[field] = String(value);
                }
                const nextItem: EstimateItem = {
                    ...item,
                    actual: {
                        ...actual,
                        updatedAt: new Date().toISOString(),
                    },
                };
                const actualTotal = calculateActualItemTotal(nextItem);
                if (actualTotal !== null) {
                    nextItem.actual = { ...nextItem.actual, total: actualTotal };
                }
                return nextItem;
            });
            return { ...prev, items: newItems };
        });
    };

    const copyAllPlanToActual = () => {
        setEstimate(prev => ({
            ...prev,
            items: prev.items.map(item => item.isActualOnly ? item : copyPlanToActual(item)),
        }));
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

    const addActualOnlyItem = (category: EstimateCategory, subgroup: EstimateSubgroup = EstimateSubgroup.MATERIALS) => {
        const newItem: EstimateItem = {
            id: `item-actual-${Date.now()}`,
            name: '',
            unit: 'шт',
            quantity: 0,
            price: 0,
            total: 0,
            category,
            subgroup,
            isActualOnly: true,
            actual: {
                unit: 'шт',
                quantity: 1,
                price: 0,
                total: 0,
                updatedAt: new Date().toISOString(),
            },
        };
        setEstimate(prev => ({ ...prev, items: [...prev.items, newItem] }));
        setShowActuals(true);
        setActualFilter('all');
    };

    const handleMaterialSelect = async (itemId: string, materialName: string) => {
        console.info('[EstimateEditor] handleMaterialSelect start', { itemId, materialName });
        const material = materialsIndex.get(materialName);
        if (!material) {
            // Allow AI suggestions that are not in the catalog
            const aiSuggested = suggestions[itemId]?.find(suggestion => suggestion.name === materialName);
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
            const aiSuggested = suggestions[itemId]?.find(suggestion => suggestion.name === workName);
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
            const selectedTemplate = templatesValue.find(t => t.id === genParams.projectTemplateId);

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
    }, [genParams, templatesValue]);

    const handleGenerateWithAI = useCallback(async (opts?: {
        scopeDescription?: string;
        enableAiPriceSearch?: boolean;
        area?: number;
        buildingType?: string;
        selectedSections?: EstimateCategory[];
        referenceEstimateId?: string;
        windowCount?: number;
        doorCount?: number;
    }) => {
        if (aiAccessValue && !aiAccessValue.canUseAi) {
            alert('Лимит AI-запросов исчерпан. Перейдите на платный план для продолжения.');
            if (onUpgradeRequest) onUpgradeRequest();
            return;
        }
        if (!hasOpenRouterKey()) {
            alert('AI не настроен: заполните VITE_OPENROUTER_API_KEY в .env');
            return;
        }
        // Apply wizard overrides to the current estimate
        const wizardArea = opts?.area ?? estimate.area;
        const wizardBuildingType = opts?.buildingType ?? estimate.buildingType;

        if (!wizardBuildingType || !wizardBuildingType.trim()) {
            alert('Укажите тип строения перед AI-генерацией.');
            return;
        }
        if (!wizardArea || wizardArea <= 0) {
            alert('Укажите площадь перед AI-генерацией.');
            return;
        }
        // Update estimate with wizard-provided area/buildingType
        if (opts?.area || opts?.buildingType) {
            setEstimate(prev => ({
                ...prev,
                ...(opts.area ? { area: opts.area } : {}),
                ...(opts.buildingType ? { buildingType: opts.buildingType } : {}),
            }));
        }
        generationAbortControllerRef.current?.abort();
        const generationController = new AbortController();
        generationAbortControllerRef.current = generationController;
        setIsLoading(true);
        setAiBusyMessage('Генерирую смету с помощью AI');
        setAiWarnings([]);
        setAiTextSuggestions([]);
        try {
            aiAccessValue?.onConsume?.('generation');
            const latestOnlyEstimates = (() => {
                const byRoot = new Map<string, Estimate>();
                for (const e of (visibleEstimatesValue || [])) {
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

            const selectedTemplate = templatesValue.find(t => t.id === genParams.projectTemplateId);
            const templateItems = selectedTemplate?.items || [];
            // Для AI-режима: масштабируем базу шаблона под введённую площадь (если у шаблона задана baseArea).
            const baseArea = selectedTemplate?.baseArea || 0;
            const factor = baseArea > 0 && wizardArea > 0 ? (wizardArea / baseArea) : 1;

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
            const callParams = { ...genParams, area: wizardArea };
            const scopeDescription = (opts?.scopeDescription ?? aiGenDescription) || '';
            const enableAiPriceSearch = typeof opts?.enableAiPriceSearch === 'boolean'
                ? opts.enableAiPriceSearch
                : aiGenEnableAiPriceSearch;

            const { items: aiItems, suggestions, warnings, notInDbItems: generatedNotInDb } = await generateEstimateWithAI(
                callParams,
                latestOnlyEstimates,
                materialsValue,
                worksValue,
                baseItems,
                {
                    buildingType: wizardBuildingType,
                    signal: generationController.signal,
                    projectTemplateId: selectedTemplate?.id,
                    projectTemplateName: selectedTemplate?.name,
                    templateItems: baseItems,
                    scopeDescription,
                    enableAiPriceSearch,
                    referenceEstimateId: opts?.referenceEstimateId,
                    selectedSections: opts?.selectedSections,
                    windowCount: opts?.windowCount,
                    doorCount: opts?.doorCount,
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
                wizardArea,
                genParams.region,
                wizardBuildingType,
                selectedTemplate?.id || genParams.projectTemplateId || null,
                selectedTemplate?.name || null,
                opts?.referenceEstimateId || null,
                opts?.selectedSections?.sort() || null,
                (baseItems || []).map(i => i.name).sort(),
            );
            aiSessionRef.current = {
                baselineItems: merged,
                cacheKey,
                context: {
                    area: wizardArea,
                    region: genParams.region,
                    buildingType: wizardBuildingType,
                    projectTemplateId: selectedTemplate?.id,
                    projectTemplateName: selectedTemplate?.name,
                    scopeDescription,
                },
            };

            if (suggestions && suggestions.length > 0) setAiTextSuggestions(suggestions);
            if (warnings && warnings.length > 0) setAiWarnings(warnings);

            // Warn user if AI generated 0 items
            if (aiItems.length === 0 && baseItems.length === 0) {
                setAiWarnings(prev => [...prev, 'AI не смог сгенерировать позиции сметы. Попробуйте изменить параметры (тип объекта, площадь, описание) или добавить больше материалов/работ в справочники.']);
            }

            // Show "Not in DB" items if any after generation
            if (generatedNotInDb && generatedNotInDb.length > 0) {
                setAiNotInDbItems(generatedNotInDb);
                setAiAddedToCatalogNames(new Set());
                // Also open the analysis modal to show the "Not in DB" tab
                setAiAnalysisOpen(true);
                setAiAnalysisMissing([]);
                setAiAnalysisOptional([]);
                setAiAnalysisReasoning([`AI-генерация завершена. ${generatedNotInDb.length} позиций не найдено в справочниках.`]);
            }
        } catch (error) {
            if (isAbortError(error)) {
                return;
            }
            console.error('Failed to generate estimate with AI', error);
            alert('Произошла ошибка при AI-генерации сметы.');
        } finally {
            if (generationAbortControllerRef.current === generationController) {
                generationAbortControllerRef.current = null;
            }
            setAiBusyMessage(null);
            setIsLoading(false);
        }
    }, [genParams, templatesValue, visibleEstimatesValue, materialsValue, worksValue, estimate.buildingType, estimate.area, aiGenDescription, aiGenEnableAiPriceSearch, aiAccessValue, onUpgradeRequest]);

    const handleAnalyzeEstimate = useCallback(async () => {
        if (aiAccessValue && !aiAccessValue.canUseAi) {
            alert('Лимит AI-запросов исчерпан. Перейдите на платный план для продолжения.');
            if (onUpgradeRequest) onUpgradeRequest();
            return;
        }

        analysisAbortControllerRef.current?.abort();
        const analysisController = new AbortController();
        analysisAbortControllerRef.current = analysisController;

        setIsLoading(true);
        setAiBusyMessage('Анализирую смету');

        try {
            aiAccessValue?.onConsume?.('analysis');
            const similar = visibleEstimatesValue.filter(e =>
                e.buildingType === estimate.buildingType &&
                estimate.area > 0 &&
                Math.abs(e.area - estimate.area) / estimate.area < 0.3,
            );

            const presentCategories = Array.from(new Set((estimate.items || []).map(item => item.category)));
            const analysis = await analyzeMissingItems(
                estimate,
                similar,
                materialsValue,
                worksValue,
                presentCategories,
                analysisController.signal,
            );

            if (analysisController.signal.aborted) {
                return;
            }

            setAiAnalysisMissing(analysis.missing);
            setAiAnalysisOptional(analysis.optional);
            setAiAnalysisReasoning(analysis.reasoning);
            setAiAnalysisOpen(true);
        } catch (error) {
            if (isAbortError(error)) {
                return;
            }
            console.error('[EstimateEditor] AI analysis failed', error);
            alert('Не удалось выполнить AI-анализ сметы.');
        } finally {
            if (analysisAbortControllerRef.current === analysisController) {
                analysisAbortControllerRef.current = null;
            }
            setAiBusyMessage(null);
            setIsLoading(false);
        }
    }, [aiAccessValue, estimate, materialsValue, onUpgradeRequest, visibleEstimatesValue, worksValue]);

    const toggleSubgroupExpansion = (subgroupKey: string) => {
        setExpandedSubgroups(prev => ({
            ...prev,
            [subgroupKey]: !prev[subgroupKey],
        }));
    };

    // Reset visibleCategories when estimate changes (new estimate opened)
    useEffect(() => {
        const fromSections = estimate.selectedSections ?? [];
        const fromItems = Array.from(new Set(estimate.items.map(i => i.category)));
        setVisibleCategories(Array.from(new Set([...fromSections, ...fromItems])));
    }, [estimate.id]);

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

    const handleDuplicateSection = useCallback((cat: EstimateCategory) => {
        const itemsInCat = estimate.items.filter(it => it.category === cat);
        if (itemsInCat.length === 0) {
            alert('В разделе нет позиций для дублирования.');
            return;
        }
        const coefficient = prompt(`Коэффициент для масштабирования (1 = без изменений):`, '1');
        if (coefficient === null) return;
        const factor = parseFloat(coefficient) || 1;
        const newItems = itemsInCat.map(item => ({
            ...item,
            id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            quantity: +(item.quantity * factor).toFixed(2),
            total: +(item.quantity * factor * item.price).toFixed(2),
        }));
        setEstimate(prev => {
            const updatedItems = [...prev.items, ...newItems];
            return { ...prev, items: updatedItems, total: calculateTotal(updatedItems) };
        });
    }, [estimate.items]);

    const handleOpenPasteModal = useCallback((cat: EstimateCategory) => {
        setPasteTargetCategory(cat);
        setPasteModalOpen(true);
    }, []);

    const handlePasteFromEstimate = useCallback((items: EstimateItem[], _targetCategory: EstimateCategory) => {
        setEstimate(prev => {
            const updatedItems = [...prev.items, ...items];
            return { ...prev, items: updatedItems, total: calculateTotal(updatedItems) };
        });
        setPasteModalOpen(false);
    }, []);

    const handleApplyBundles = useCallback((order: string[], scaleFactor: number) => {
        const rawItems: EstimateItem[] = [];
        for (const id of order) {
            const bundle = bundlesValue.find(b => b.id === id);
            if (!bundle) continue;
            for (const item of (bundle.items ?? [])) {
                rawItems.push({
                    ...item,
                    id: `item-bundle-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    category: bundle.category,
                });
            }
        }
        const smartItems = sanitizeQuantities(
            applySmartPackagingRules(rawItems, scaleFactor),
            scaleFactor,
        );
        setEstimate(prev => {
            const updatedItems = [...prev.items, ...smartItems];
            return { ...prev, items: updatedItems, total: calculateTotal(updatedItems) };
        });
        setBundlePickerOpen(false);
    }, [bundlesValue]);

    const quickBundleWork = useMemo(
        () => estimate.items.find(item => item.id === quickBundleWorkId && (item.subgroup || EstimateSubgroup.WORKS) === EstimateSubgroup.WORKS) ?? null,
        [estimate.items, quickBundleWorkId],
    );

    const quickBundleLinkedItems = useMemo(() => {
        if (!quickBundleWork) return [];
        return estimate.items.filter(item =>
            quickBundleItemIds.has(item.id) &&
            item.id !== quickBundleWork.id &&
            item.category === quickBundleWork.category &&
            item.subgroup === EstimateSubgroup.MATERIALS &&
            item.name.trim()
        );
    }, [estimate.items, quickBundleItemIds, quickBundleWork]);

    const quickBundleDraftItems = useMemo(
        () => quickBundleWork ? [quickBundleWork, ...quickBundleLinkedItems] : [],
        [quickBundleLinkedItems, quickBundleWork],
    );

    const resetQuickBundleDraft = useCallback(() => {
        setQuickBundleWorkId(null);
        setQuickBundleItemIds(new Set());
        setQuickBundleName('');
        setQuickBundleModalOpen(false);
    }, []);

    const handleQuickBundleWorkSelect = useCallback((item: EstimateItem) => {
        if (!item.name.trim()) return;
        setQuickBundleNotice(null);
        setQuickBundleItemIds(new Set());
        setQuickBundleWorkId(prev => prev === item.id ? null : item.id);
    }, []);

    const handleQuickBundleMaterialToggle = useCallback((item: EstimateItem) => {
        if (!quickBundleWork || item.category !== quickBundleWork.category || item.subgroup !== EstimateSubgroup.MATERIALS || !item.name.trim()) return;
        setQuickBundleNotice(null);
        setQuickBundleItemIds(prev => {
            const next = new Set(prev);
            if (next.has(item.id)) {
                next.delete(item.id);
            } else {
                next.add(item.id);
            }
            return next;
        });
    }, [quickBundleWork]);

    const handleQuickBundleDragStart = useCallback((event: React.DragEvent, item: EstimateItem) => {
        if (!item.name.trim()) {
            event.preventDefault();
            return;
        }
        event.dataTransfer.effectAllowed = 'copy';
        event.dataTransfer.setData('application/x-work-item-id', item.id);
        setQuickBundleNotice(null);
        setQuickBundleItemIds(new Set());
        setQuickBundleWorkId(item.id);
    }, []);

    const handleQuickBundleDrop = useCallback((event: React.DragEvent, item: EstimateItem) => {
        event.preventDefault();
        const workId = event.dataTransfer.getData('application/x-work-item-id') || quickBundleWorkId;
        const work = estimate.items.find(candidate => candidate.id === workId && (candidate.subgroup || EstimateSubgroup.WORKS) === EstimateSubgroup.WORKS);
        if (!work || item.category !== work.category || item.subgroup !== EstimateSubgroup.MATERIALS || !item.name.trim()) return;
        setQuickBundleNotice(null);
        setQuickBundleWorkId(work.id);
        setQuickBundleItemIds(prev => {
            const next = new Set(prev);
            next.add(item.id);
            return next;
        });
    }, [estimate.items, quickBundleWorkId]);

    const openQuickBundleSave = useCallback(() => {
        if (!quickBundleWork || quickBundleLinkedItems.length === 0) return;
        setQuickBundleName(quickBundleWork.name);
        setQuickBundleModalOpen(true);
    }, [quickBundleLinkedItems.length, quickBundleWork]);

    const handleQuickBundleSave = useCallback(async () => {
        const name = quickBundleName.trim();
        if (!name || !quickBundleWork?.name.trim() || quickBundleLinkedItems.length === 0 || !catalogContext?.onAddBundle) return;
        const now = Date.now();
        const bundle: WorkBundle = {
            id: `bundle-${now}`,
            name,
            mainWorkId: quickBundleWork.id,
            category: quickBundleWork.category,
            sortOrder: now,
            items: quickBundleDraftItems.map(item => ({
                ...item,
                id: `item-bundle-${now}-${Math.random().toString(36).slice(2, 9)}`,
            })),
        };
        await catalogContext.onAddBundle(bundle);
        resetQuickBundleDraft();
        setQuickBundleNotice(`Компонент "${name}" сохранён.`);
    }, [catalogContext, quickBundleDraftItems, quickBundleLinkedItems.length, quickBundleName, quickBundleWork, resetQuickBundleDraft]);

    const handleSave = () => {
        if (!estimate.client) {
            alert("Пожалуйста, укажите имя клиента.");
            return;
        }
        const finalEstimate = {
            ...estimate,
            id: initialEstimate ? estimate.id : `sm-id-${Date.now()}`,
            estimateNumber: initialEstimateValue ? estimate.estimateNumber : generateEstimateNumber(allEstimatesValue.map(item => item.estimateNumber), new Date()),
            sortOrder: initialEstimateValue ? estimate.sortOrder : (estimate.sortOrder ?? Date.now()),
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
        onRequestSaveAction?.(finalEstimate);
    };

    const getPreviousVersion = (): Estimate | undefined => {
        if (!initialEstimateValue) return undefined;
        const parentId = initialEstimateValue.parentId || initialEstimateValue.id;
        return allEstimatesValue.find(e => (e.id === parentId || e.parentId === parentId) && e.version === initialEstimateValue.version - 1);
    };

    const inputStyles = "p-2 bg-background border border-border rounded-md text-text-primary focus:ring-primary focus:border-primary w-full";

    const hasValidationIssues = Boolean(validationResultValue && validationResultValue.issues.length > 0);
    const getFieldClass = (itemId: string, field: 'name' | 'quantity' | 'price', base: string) => {
        const invalid = Boolean(validationResultValue?.invalidFieldsByItemId?.[itemId]?.[field]);
        return invalid ? `${base} border-red-500` : base;
    };

    const getItemIssueMessages = (itemId: string) => {
        const issues = (validationResultValue?.issues || []).filter(i => i.itemId === itemId);
        return Array.from(new Set(issues.map(i => i.message)));
    };

    return (
        <div className="space-y-4">
            <div className="rounded-xl border border-border/70 bg-surface p-2 shadow-2xl sm:p-4 md:p-5">
                <div className="mb-4 flex flex-col gap-3 border-b border-border pb-3 sm:flex-row sm:items-center sm:justify-between">
                    <h2 className="text-xl font-semibold text-text-primary">{initialEstimateValue ? `Редактирование сметы №${estimate.estimateNumber}` : 'Создание новой сметы'}</h2>
                        <button onClick={() => onBackAction?.()} className="min-h-[44px] rounded-lg border border-border px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-background hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50 active:scale-95 md:min-h-9">&larr; Назад к истории</button>
                </div>

                {hasValidationIssues && (
                    <div className="mb-4 p-3 border border-red-500/40 bg-background/40 rounded-md">
                        <div className="font-semibold text-red-400">Есть ошибки в смете — исправьте перед PDF/отправкой</div>
                        <div className="text-sm text-text-secondary">Проблемных строк: {validationResultValue!.invalidItemIds.size}. Ошибок: {validationResultValue!.issues.length}.</div>
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

                {/* Row 1: Клиент, Дата, Статус, Тип строения, Площадь */}
                <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-5">
                    <input type="text" value={estimate.client} onChange={e => setEstimate({ ...estimate, client: e.target.value })} placeholder="Клиент" className={inputStyles + " min-h-[44px] sm:col-span-2 md:min-h-9"} />
                    <input type="date" value={estimate.date} onChange={e => setEstimate({ ...estimate, date: e.target.value })} className={inputStyles + " min-h-[44px] md:min-h-9"} />
                    <select value={estimate.status} onChange={e => setEstimate({ ...estimate, status: e.target.value as EstimateStatus })} className={inputStyles + " min-h-[44px] md:min-h-9"}>
                        {Object.values(EstimateStatus).filter(s => s !== EstimateStatus.ARCHIVED).map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <input type="text" value={estimate.buildingType} onChange={e => setEstimate({ ...estimate, buildingType: e.target.value })} placeholder="Тип строения" className={inputStyles + " min-h-[44px] md:min-h-9"} />
                </div>

                {/* Row 2: Площадь, Шаблон + удалить, Кнопка генерации + AI, AI-анализ */}
                <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-5">
                    <input type="number" value={estimate.area || ''} onChange={e => setEstimate({ ...estimate, area: +e.target.value || 0 })} placeholder="Площадь" className={inputStyles + " min-h-[44px] md:min-h-9"} />
                    <div className="flex gap-2 sm:col-span-2">
                        <select value={genParams.projectTemplateId} onChange={e => setGenParams({ ...genParams, projectTemplateId: e.target.value })} className={inputStyles + " min-h-[44px] flex-1 md:min-h-9"}>
                            {templatesValue.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}
                        </select>
                        <button onClick={() => onDeleteTemplateAction?.(genParams.projectTemplateId)} className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md px-2 text-red-500 transition-colors hover:bg-red-500/10 hover:text-red-400 focus:outline-none focus:ring-2 focus:ring-primary/50 md:min-h-9 md:min-w-9">✖</button>
                    </div>
                    <div className="flex gap-2 items-center sm:col-span-2">
                        <button onClick={handleGenerate} disabled={isLoading} className="min-h-[44px] flex-1 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:bg-gray-500 md:min-h-9">
                            {isLoading ? 'Генерация...' : 'По шаблону'}
                        </button>
                        <button
                            onClick={() => {
                                if (aiAccessValue && !aiAccessValue.canUseAi) {
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
                            className="min-h-[44px] min-w-[44px] rounded-md bg-gray-600 px-3 py-2 font-semibold text-text-primary transition-colors hover:bg-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:bg-gray-500 md:min-h-9 md:min-w-9"
                        >
                            AI
                        </button>
                        <button
                            onClick={handleAnalyzeEstimate}
                            disabled={isLoading}
                            className="min-h-[44px] min-w-[44px] rounded-md bg-gray-600 px-3 py-2 text-sm font-semibold text-text-primary transition-colors hover:bg-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:bg-gray-500 md:min-h-9 md:min-w-9"
                        >
                            🤖 AI-анализ
                        </button>
                    </div>
                </div>

                <div className="mt-4 grid grid-cols-1 items-stretch gap-2 sm:grid-cols-2 md:grid-cols-12">
                    <div className="rounded-lg border border-border bg-background/45 p-2 sm:col-span-2 md:col-span-3">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-semibold tabular-nums text-text-secondary">v{estimate.version} · {new Date(estimate.date).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                            {getPreviousVersion() && (
                                <button onClick={() => setShowComparison(true)} className="min-h-[44px] rounded px-1 text-xs text-blue-400 hover:bg-white/5 hover:text-blue-300 focus:outline-none focus:ring-2 focus:ring-primary/50 md:min-h-9">Сравнить</button>
                            )}
                            {initialEstimateValue && (
                                <button onClick={() => onSaveAsTemplateAction?.(estimate)} className="min-h-[44px] rounded px-1 text-xs font-semibold text-green-400 hover:bg-white/5 hover:text-green-300 focus:outline-none focus:ring-2 focus:ring-primary/50 md:min-h-9">Шаблон</button>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center rounded-lg border border-border bg-background/45 p-2 sm:col-span-1 md:col-span-2">
                        <button
                            onClick={() => setBundlePickerOpen(true)}
                            className="min-h-[44px] w-full rounded-md border border-border bg-background px-2 py-1 text-sm text-text-primary transition hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary/50 md:min-h-9"
                        >
                            Комплекты
                        </button>
                    </div>
                    <div className="flex items-center rounded-lg border border-border bg-background/45 p-2 sm:col-span-1 md:col-span-2">
                        <select
                            onChange={(e) => {
                                const val = e.target.value as EstimateCategory;
                                if (val) {
                                    addCategory(val);
                                    e.target.value = '';
                                }
                            }}
                            className="min-h-[44px] w-full rounded-md border border-border bg-background px-2 py-1 text-sm text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/50 md:min-h-9"
                            defaultValue=""
                        >
                            <option value="">+ Раздел...</option>
                            {Object.values(EstimateCategory).map(cat => (
                                <option key={cat} value={cat} disabled={visibleCategories.includes(cat)}>{cat}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex flex-col gap-2 rounded-lg border border-border bg-background/45 p-2 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between md:col-span-5">
                        <div className="flex flex-wrap gap-x-3 gap-y-1 items-center text-xs">
                            <span className="text-text-secondary whitespace-nowrap">Р: <span className="font-semibold text-text-primary">{subgroupTotals.works.toLocaleString('ru-RU')}&nbsp;₽</span></span>
                            <span className="text-text-secondary whitespace-nowrap">М: <span className="font-semibold text-text-primary">{subgroupTotals.materials.toLocaleString('ru-RU')}&nbsp;₽</span></span>
                            <span className="text-text-secondary whitespace-nowrap">Д: <span className="font-semibold text-text-primary">{subgroupTotals.delivery.toLocaleString('ru-RU')}&nbsp;₽</span></span>
                            <span className="text-sm font-bold text-primary whitespace-nowrap">ИТОГ: {estimate.total.toLocaleString('ru-RU')}&nbsp;₽</span>
                        </div>
                        <button onClick={handleSave} className="min-h-[44px] w-full whitespace-nowrap rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary/50 active:scale-95 sm:ml-3 sm:w-auto md:min-h-9">
                            Сохранить
                        </button>
                    </div>
                </div>

                <div className="mt-2 flex flex-col gap-2 rounded-lg border border-border bg-background/35 p-2 md:flex-row md:items-center md:justify-between">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                        <button
                            type="button"
                            onClick={() => setShowActuals(prev => !prev)}
                            className={`min-h-[44px] rounded-md border px-3 py-2 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-primary/50 md:min-h-9 ${showActuals ? 'border-primary bg-primary text-white' : 'border-border bg-background text-text-primary hover:border-primary'}`}
                            title="Показать фактические количество, цену и отклонения"
                        >
                            Факт
                        </button>
                        {showActuals && (
                            <>
                                <span className="text-text-secondary whitespace-nowrap">План: <span className="font-semibold text-text-primary">{actualSummary.planTotal.toLocaleString('ru-RU')}&nbsp;₽</span></span>
                                <span className="text-text-secondary whitespace-nowrap">Факт: <span className="font-semibold text-text-primary">{actualSummary.actualFilledTotal.toLocaleString('ru-RU')}&nbsp;₽</span></span>
                                <span className="text-text-secondary whitespace-nowrap">Прогноз: <span className="font-semibold text-text-primary">{actualSummary.forecastTotal.toLocaleString('ru-RU')}&nbsp;₽</span></span>
                                <span className={`font-semibold whitespace-nowrap ${actualSummary.diff > 0 ? 'text-red-300' : actualSummary.diff < 0 ? 'text-emerald-300' : 'text-text-secondary'}`}>Δ {actualSummary.diff > 0 ? '+' : ''}{actualSummary.diff.toLocaleString('ru-RU')}&nbsp;₽</span>
                                <span className="text-text-secondary whitespace-nowrap">Заполнено: <span className="font-semibold text-text-primary">{actualSummary.filledItems}/{actualSummary.totalItems}</span></span>
                            </>
                        )}
                    </div>
                    {showActuals && (
                        <div className="flex flex-wrap items-center gap-2">
                            {([
                                ['all', 'Все'],
                                ['different', 'Отличия'],
                                ['missing', 'Без факта'],
                                ['actualOnly', 'Новые'],
                            ] as Array<[ActualFilter, string]>).map(([key, label]) => (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => setActualFilter(key)}
                                    className={`min-h-[44px] rounded-md border px-3 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-primary/50 md:min-h-9 ${actualFilter === key ? 'border-primary bg-primary text-white' : 'border-border bg-background text-text-secondary hover:text-text-primary'}`}
                                >
                                    {label}
                                </button>
                            ))}
                            <button
                                type="button"
                                onClick={copyAllPlanToActual}
                                className="min-h-[44px] rounded-md border border-border bg-background px-3 text-xs font-semibold text-text-primary transition hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary/50 md:min-h-9"
                            >
                                Заполнить факт планом
                            </button>
                        </div>
                    )}
                </div>

                {(quickBundleWork || quickBundleNotice) && (
                    <div className="mt-4 rounded-lg border border-primary/40 bg-primary/10 p-3">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                                <div className="text-sm font-semibold text-text-primary">
                                    {quickBundleWork
                                        ? `Быстрый компонент: ${quickBundleWork.name}`
                                        : quickBundleNotice}
                                </div>
                                {quickBundleWork && (
                                    <div className="text-xs text-text-secondary">
                                        Материалов выбрано: {quickBundleLinkedItems.length}. Нажмите на материалы или перетащите плюс от работы.
                                    </div>
                                )}
                            </div>
                            {quickBundleWork && (
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={openQuickBundleSave}
                                        disabled={quickBundleLinkedItems.length === 0}
                                        className="min-h-[44px] rounded-md bg-primary px-3 py-2 text-sm font-semibold text-white transition hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:bg-gray-600 disabled:text-text-secondary md:min-h-9"
                                    >
                                        Сохранить компонент
                                    </button>
                                    <button
                                        type="button"
                                        onClick={resetQuickBundleDraft}
                                        className="min-h-[44px] rounded-md border border-border px-3 py-2 text-sm font-semibold text-text-secondary transition hover:bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 md:min-h-9"
                                    >
                                        Очистить
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                <div className="mt-4 space-y-3 sm:mt-5 sm:space-y-4">
                    {ESTIMATE_CATEGORIES.map((category, catIndex) => {
                        const items = groupedItems.get(category) || [];
                        if (items.length === 0 && !visibleCategories.includes(category)) return null;
                        const isCollapsed = Boolean(collapsedCategories[category]);
                        const catTotal = categorySubtotals.get(category) || 0;
                        const catItems = items;
                        const worksTotal = catItems.filter(i => (i.subgroup || EstimateSubgroup.WORKS) === EstimateSubgroup.WORKS).reduce((s, it) => s + (it.total || it.quantity * it.price), 0);
                        const materialsTotal = catItems.filter(i => i.subgroup === EstimateSubgroup.MATERIALS).reduce((s, it) => s + (it.total || it.quantity * it.price), 0);
                        const deliveryTotal = catItems.filter(i => i.subgroup === EstimateSubgroup.DELIVERY).reduce((s, it) => s + (it.total || it.quantity * it.price), 0);

                        return (
                            <div key={category} className="border border-border rounded-lg bg-background/30">
                                <button
                                    type="button"
                                    onClick={() => toggleCategoryCollapse(category)}
                                    className="w-full bg-gray-900/50 p-2 sm:p-3 flex items-center gap-2 rounded-t-lg border-b border-border text-left"
                                >
                                    <span className={`text-xs transition-transform ${isCollapsed ? '' : 'rotate-90'}`}>▶</span>
                                    <h3 className="text-xs sm:text-lg font-bold text-text-primary truncate flex-1">{catIndex + 1}. {category}</h3>
                                    <span className="text-xs sm:text-sm font-semibold text-text-secondary shrink-0">
                                        {catTotal.toLocaleString('ru-RU')} ₽
                                    </span>
                                    {visibleCategories.includes(category) && !isCollapsed && (
                                        <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                                            {items.length > 0 && (
                                                <button onClick={() => handleDuplicateSection(category)} className="min-h-[44px] rounded px-1 text-xs text-blue-400 hover:bg-white/5 hover:text-blue-300 focus:outline-none focus:ring-2 focus:ring-primary/50 md:min-h-9" title="Дублировать">⧉</button>
                                            )}
                                            <button onClick={() => handleOpenPasteModal(category)} className="min-h-[44px] rounded px-1 text-xs text-purple-400 hover:bg-white/5 hover:text-purple-300 focus:outline-none focus:ring-2 focus:ring-primary/50 md:min-h-9" title="Из другой сметы">📋</button>
                                            <button onClick={() => removeVisibleCategory(category)} className="min-h-[44px] rounded px-1 text-xs text-red-400 hover:bg-red-500/10 hover:text-red-300 focus:outline-none focus:ring-2 focus:ring-primary/50 md:min-h-9">✕</button>
                                        </div>
                                    )}
                                </button>
                                {!isCollapsed && (
                                <div className="p-2 sm:p-3 space-y-3 sm:space-y-4">
                                    {((category: EstimateCategory) => {
                                        return (category === EstimateCategory.LOGISTICS) ? [EstimateSubgroup.WORKS, EstimateSubgroup.DELIVERY] : [EstimateSubgroup.WORKS, EstimateSubgroup.MATERIALS];
                                    })(category).map((subgroup) => {
                                        const subItems = items.filter(i => (i.subgroup || EstimateSubgroup.WORKS) === subgroup);
                                        const visibleSubItems = showActuals ? subItems.filter(item => shouldShowActualRow(item, actualFilter)) : subItems;
                                        const subgroupKey = `${category}:${subgroup}`;
                                        const isSubgroupExpanded = Boolean(expandedSubgroups[subgroupKey]);
                                        const renderedSubItems = isSubgroupExpanded ? visibleSubItems : visibleSubItems.slice(0, MAX_RENDERED_SUBITEMS);
                                        const subTotal = subItems.reduce((s, it) => s + (it.total || it.quantity * it.price), 0);
                                        return (
                                                <div key={subgroup} className="border border-border rounded-md bg-background/20">
                                                <div className="flex justify-between items-center p-1.5 sm:p-2 bg-gray-900/30 border-b border-border rounded-t-md">
                                                    <div className="font-semibold text-xs sm:text-sm">{subgroup === EstimateSubgroup.WORKS ? 'Работы' : subgroup === EstimateSubgroup.MATERIALS ? 'Материалы' : 'Доставка'}</div>
                                                    <div className="text-xs sm:text-sm font-medium text-text-secondary">{subTotal.toLocaleString('ru-RU')} ₽</div>
                                                </div>
                                                <div className="overflow-x-auto hidden md:block">
                                                    <table className="min-w-full">
                                                        <thead className="bg-gray-900/30">
                                                            <tr>
                                                                <th className="p-2 text-center font-semibold text-sm text-text-secondary w-12">Связь</th>
                                                                <th className="p-2 text-left font-semibold text-sm text-text-secondary w-1/3">Наименование</th>
                                                                <th className="p-2 w-10"></th>
                                                                <th className="p-2 text-left font-semibold text-sm text-text-secondary">Ед. изм.</th>
                                                                <th className="p-2 text-right font-semibold text-sm text-text-secondary">Кол-во</th>
                                                                <th className="p-2 text-right font-semibold text-sm text-text-secondary">Цена</th>
                                                                {showActuals && (
                                                                    <>
                                                                        <th className="p-2 text-left font-semibold text-sm text-text-secondary">Факт ед.</th>
                                                                        <th className="p-2 text-right font-semibold text-sm text-text-secondary">Факт кол-во</th>
                                                                        <th className="p-2 text-right font-semibold text-sm text-text-secondary">Факт цена</th>
                                                                        <th className="p-2 text-right font-semibold text-sm text-text-secondary">Δ</th>
                                                                    </>
                                                                )}
                                                                <th className="p-2 text-right font-semibold text-sm text-text-secondary">Сумма</th>
                                                                <th className="p-2 w-12"></th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {visibleSubItems.length === 0 && (
                                                                <tr>
                                                                    <td className="p-2 text-sm text-text-secondary" colSpan={showActuals ? 12 : 8}>Нет позиций</td>
                                                                </tr>
                                                            )}
                                                            {renderedSubItems.map((item) => {
                                                                const filteredMaterials = filteredMaterialsByCategory.get(category) || [];
                                                                const filteredWorks = filteredWorksByCategory.get(category) || [];
                                                                const useTypeaheadMaterials = filteredMaterials.length > TYPEAHEAD_THRESHOLD;
                                                                const useTypeaheadWorks = filteredWorks.length > TYPEAHEAD_THRESHOLD;
                                                                const itemSubgroup = item.subgroup || EstimateSubgroup.WORKS;
                                                                const isQuickBundleWorkRow = quickBundleWork?.id === item.id;
                                                                const isQuickBundleLinked = quickBundleItemIds.has(item.id);
                                                                const isQuickBundleMaterialTarget = Boolean(quickBundleWork && item.category === quickBundleWork.category && itemSubgroup === EstimateSubgroup.MATERIALS && item.name.trim());
                                                                return (
                                                                <React.Fragment key={item.id}>
                                                                <tr className={"border-b border-border last:border-b-0" + (validationResultValue?.invalidItemIds?.has(item.id) ? " bg-red-500/5" : "") + (isQuickBundleWorkRow || isQuickBundleLinked ? " bg-primary/5" : "")}>
                                                                    <td className="p-1 text-center align-middle">
                                                                        {itemSubgroup === EstimateSubgroup.WORKS ? (
                                                                            <button
                                                                                type="button"
                                                                                draggable={Boolean(item.name.trim())}
                                                                                onDragStart={event => handleQuickBundleDragStart(event, item)}
                                                                                onClick={() => handleQuickBundleWorkSelect(item)}
                                                                                disabled={!item.name.trim()}
                                                                                className={`mx-auto flex min-h-[36px] min-w-[36px] items-center justify-center rounded-full border text-lg font-bold transition ${isQuickBundleWorkRow ? 'border-primary bg-primary text-white' : 'border-border bg-background text-text-secondary hover:border-primary hover:text-primary'} disabled:cursor-not-allowed disabled:opacity-40`}
                                                                                title="Выбрать работу для компонента"
                                                                            >
                                                                                +
                                                                            </button>
                                                                        ) : itemSubgroup === EstimateSubgroup.MATERIALS ? (
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => handleQuickBundleMaterialToggle(item)}
                                                                                onDragOver={event => { if (isQuickBundleMaterialTarget) event.preventDefault(); }}
                                                                                onDrop={event => handleQuickBundleDrop(event, item)}
                                                                                disabled={!isQuickBundleMaterialTarget}
                                                                                className={`mx-auto flex min-h-[36px] min-w-[36px] items-center justify-center rounded-full border text-sm font-bold transition ${isQuickBundleLinked ? 'border-primary bg-primary text-white' : isQuickBundleMaterialTarget ? 'border-primary/60 bg-primary/10 text-primary hover:bg-primary/20' : 'border-border bg-background text-text-secondary opacity-50'} disabled:cursor-not-allowed`}
                                                                                title="Добавить материал в компонент"
                                                                            >
                                                                                {isQuickBundleLinked ? '✓' : '•'}
                                                                            </button>
                                                                        ) : (
                                                                            <span className="text-text-secondary">-</span>
                                                                        )}
                                                                    </td>
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

                                                                        {validationResultValue?.invalidItemIds?.has(item.id) && getItemIssueMessages(item.id).length > 0 && (
                                                                            <div className="mt-1 text-xs text-red-400">
                                                                                {getItemIssueMessages(item.id).join(' • ')}
                                                                            </div>
                                                                        )}
                                                                    </td>
                                                                    <td className="p-1 w-10 text-center">
                                                                        <button
                                                                            onClick={() => setOpenNotes(prev => ({ ...prev, [item.id]: !prev[item.id] }))}
                                                                            className="relative flex min-h-[44px] min-w-[44px] items-center justify-center rounded text-text-secondary transition-colors hover:bg-white/5 hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/50 md:min-h-9 md:min-w-9"
                                                                            title={item.note || 'Добавить примечание'}
                                                                        >
                                                                            📝
                                                                            {item.note && <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full inline-block" />}
                                                                        </button>
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
                                                                    {showActuals && (
                                                                        <>
                                                                            <td className="p-1 w-24">
                                                                                <select value={item.actual?.unit || item.unit} onChange={e => updateActualItem(item.id, 'unit', e.target.value)} className={inputStyles + " text-sm"}>
                                                                                    <option value="м2">м2</option>
                                                                                    <option value="м/п">м/п</option>
                                                                                    <option value="шт">шт</option>
                                                                                    <option value="уп">уп</option>
                                                                                    <option value="м3">м3</option>
                                                                                </select>
                                                                            </td>
                                                                            <td className="p-1 w-32"><input type="number" value={item.actual?.quantity ?? ''} onChange={e => updateActualItem(item.id, 'quantity', e.target.value)} className={inputStyles + " text-right text-sm"} /></td>
                                                                            <td className="p-1 w-32"><input type="number" value={item.actual?.price ?? ''} onChange={e => updateActualItem(item.id, 'price', e.target.value)} className={inputStyles + " text-right text-sm"} /></td>
                                                                            <td className={`p-1 w-28 text-right font-semibold ${((calculateActualItemTotal(item) ?? item.total) - item.total) > 0 ? 'text-red-300' : ((calculateActualItemTotal(item) ?? item.total) - item.total) < 0 ? 'text-emerald-300' : 'text-text-secondary'}`}>
                                                                                {(((calculateActualItemTotal(item) ?? item.total) - item.total) > 0 ? '+' : '')}{((calculateActualItemTotal(item) ?? item.total) - item.total).toLocaleString('ru-RU')} ₽
                                                                            </td>
                                                                        </>
                                                                    )}
                                                                    <td className="p-1 w-32 text-right font-medium text-text-primary">{item.total.toLocaleString('ru-RU')} ₽</td>
                                                                    <td className="p-1 text-center"><button onClick={() => removeItem(item.id)} className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded text-red-500 transition-colors hover:bg-red-500/10 hover:text-red-400 focus:outline-none focus:ring-2 focus:ring-primary/50 md:min-h-9 md:min-w-9">✖</button></td>
                                                                </tr>
                                                                {openNotes[item.id] && (
                                                                    <tr>
                                                                        <td colSpan={8} className="p-1 bg-gray-900/20">
                                                                            <textarea
                                                                                value={item.note || ''}
                                                                                onChange={e => updateItem(item.id, 'note', e.target.value)}
                                                                                placeholder="Примечание..."
                                                                                className="w-full p-1 text-xs bg-background border border-border rounded text-text-primary resize-none"
                                                                                rows={2}
                                                                            />
                                                                        </td>
                                                                    </tr>
                                                                )}
                                                                </React.Fragment>
                                                            ) })}
                                                        </tbody>
                                                    </table>
                                                </div>
                                                {/* Mobile card list */}
                                                <div className="md:hidden space-y-2 p-1.5 sm:p-2">
                                                    {visibleSubItems.length === 0 && (
                                                        <div className="text-sm text-text-secondary py-2">Нет позиций</div>
                                                    )}
                                                    {renderedSubItems.map((item) => {
                                                        const filteredMaterials = filteredMaterialsByCategory.get(category) || [];
                                                        const filteredWorks = filteredWorksByCategory.get(category) || [];
                                                        const useTypeaheadMaterials = filteredMaterials.length > TYPEAHEAD_THRESHOLD;
                                                        const useTypeaheadWorks = filteredWorks.length > TYPEAHEAD_THRESHOLD;
                                                        const itemSubgroup = item.subgroup || EstimateSubgroup.WORKS;
                                                        const isQuickBundleWorkRow = quickBundleWork?.id === item.id;
                                                        const isQuickBundleLinked = quickBundleItemIds.has(item.id);
                                                        const isQuickBundleMaterialTarget = Boolean(quickBundleWork && item.category === quickBundleWork.category && itemSubgroup === EstimateSubgroup.MATERIALS && item.name.trim());
                                                        return (
                                                        <article key={item.id} className={"rounded-lg border border-border bg-background/40 p-2 sm:p-3" + (validationResultValue?.invalidItemIds?.has(item.id) ? " border-red-500/40" : "") + (isQuickBundleWorkRow || isQuickBundleLinked ? " border-primary/60 bg-primary/5" : "")}>
                                                            <div className="space-y-2">
                                                                <div className="flex items-center justify-between gap-2">
                                                                    <span className="text-xs font-semibold text-text-secondary">
                                                                        {itemSubgroup === EstimateSubgroup.WORKS ? 'Работа' : itemSubgroup === EstimateSubgroup.MATERIALS ? 'Материал' : 'Доставка'}
                                                                    </span>
                                                                    {itemSubgroup === EstimateSubgroup.WORKS ? (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleQuickBundleWorkSelect(item)}
                                                                            disabled={!item.name.trim()}
                                                                            className={`min-h-[36px] rounded-full border px-3 text-sm font-bold transition ${isQuickBundleWorkRow ? 'border-primary bg-primary text-white' : 'border-border bg-background text-text-secondary hover:border-primary hover:text-primary'} disabled:cursor-not-allowed disabled:opacity-40`}
                                                                        >
                                                                            + связать
                                                                        </button>
                                                                    ) : itemSubgroup === EstimateSubgroup.MATERIALS ? (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleQuickBundleMaterialToggle(item)}
                                                                            disabled={!isQuickBundleMaterialTarget}
                                                                            className={`min-h-[36px] rounded-full border px-3 text-sm font-bold transition ${isQuickBundleLinked ? 'border-primary bg-primary text-white' : isQuickBundleMaterialTarget ? 'border-primary/60 bg-primary/10 text-primary' : 'border-border bg-background text-text-secondary opacity-50'} disabled:cursor-not-allowed`}
                                                                        >
                                                                            {isQuickBundleLinked ? '✓ добавлен' : '+ материал'}
                                                                        </button>
                                                                    ) : null}
                                                                </div>
                                                                {(subgroup === EstimateSubgroup.MATERIALS || subgroup === EstimateSubgroup.DELIVERY) ? (
                                                                    useTypeaheadMaterials ? (
                                                                        <div className="relative">
                                                                            <input
                                                                                type="text"
                                                                                id={`typeahead-mobile-${item.id}`}
                                                                                disabled={!!loadingPrices[item.id]}
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
                                                                                onFocus={e => { scheduleSuggestions(item.id, (e.currentTarget as HTMLInputElement).value, filteredMaterials); }}
                                                                                onKeyDown={e => { if (e.key === 'Enter') { (e.currentTarget as HTMLInputElement).blur(); tryApplyMaterialByName(item.id, (e.currentTarget as HTMLInputElement).value); } }}
                                                                                placeholder="Поиск материала"
                                                                                className={getFieldClass(item.id, 'name', "w-full min-h-[44px] p-2 bg-background border border-border rounded-md text-text-primary text-sm md:min-h-9")}
                                                                            />
                                                                            {renderSuggestionsPortal(item.id, suggestions[item.id] as Material[] | undefined, (it) => selectMaterialSuggestion(item.id, it as Material))}
                                                                        </div>
                                                                    ) : (
                                                                        <select value={item.name} onChange={e => handleMaterialSelect(item.id, e.target.value)} disabled={!!loadingPrices[item.id]} className={getFieldClass(item.id, 'name', "w-full min-h-[44px] p-2 bg-background border border-border rounded-md text-text-primary text-sm md:min-h-9")}>
                                                                            <option value="">— Выберите материал —</option>
                                                                            {filteredMaterials.map(mat => <option key={mat.id} value={mat.name}>{mat.name}</option>)}
                                                                        </select>
                                                                    )
                                                                ) : subgroup === EstimateSubgroup.WORKS ? (
                                                                    useTypeaheadWorks ? (
                                                                        <div className="relative">
                                                                            <input
                                                                                type="text"
                                                                                id={`typeahead-mobile-${item.id}`}
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
                                                                                onFocus={e => { scheduleSuggestions(item.id, (e.currentTarget as HTMLInputElement).value, filteredWorks); }}
                                                                                onKeyDown={e => { if (e.key === 'Enter') { (e.currentTarget as HTMLInputElement).blur(); tryApplyWorkByName(item.id, (e.currentTarget as HTMLInputElement).value); } }}
                                                                                placeholder="Поиск работы"
                                                                                className={getFieldClass(item.id, 'name', "w-full min-h-[44px] p-2 bg-background border border-border rounded-md text-text-primary text-sm md:min-h-9")}
                                                                            />
                                                                            {renderSuggestionsPortal(item.id, suggestions[item.id] as Work[] | undefined, (it) => selectWorkSuggestion(item.id, it as Work))}
                                                                        </div>
                                                                    ) : (
                                                                        <select value={item.name} onChange={e => handleWorkSelect(item.id, e.target.value)} className={getFieldClass(item.id, 'name', "w-full min-h-[44px] p-2 bg-background border border-border rounded-md text-text-primary text-sm md:min-h-9")}>
                                                                            <option value="">— Выберите работу —</option>
                                                                            {filteredWorks.map(wrk => <option key={wrk.id} value={wrk.name}>{wrk.name}</option>)}
                                                                        </select>
                                                                    )
                                                                ) : (
                                                                    <input type="text" value={item.name} onChange={e => updateItem(item.id, 'name', e.target.value)} placeholder="Новая позиция" className={getFieldClass(item.id, 'name', "w-full min-h-[44px] p-2 bg-background border border-border rounded-md text-text-primary text-sm md:min-h-9")} />
                                                                )}
                                                                {validationResultValue?.invalidItemIds?.has(item.id) && getItemIssueMessages(item.id).length > 0 && (
                                                                    <div className="text-xs text-red-400">{getItemIssueMessages(item.id).join(' • ')}</div>
                                                                )}
                                                                <div className="grid grid-cols-3 gap-2">
                                                                    <div>
                                                                        <label className="text-xs text-text-secondary block mb-1">Кол-во</label>
                                                                        <input type="number" value={item.quantity} onChange={e => updateItem(item.id, 'quantity', e.target.value)} className={getFieldClass(item.id, 'quantity', "w-full min-h-[44px] p-2 bg-background border border-border rounded-md text-text-primary text-sm text-right md:min-h-9")} />
                                                                    </div>
                                                                    <div>
                                                                        <label className="text-xs text-text-secondary block mb-1">Цена</label>
                                                                        <input type="number" value={item.price} onChange={e => updateItem(item.id, 'price', e.target.value)} className={getFieldClass(item.id, 'price', "w-full min-h-[44px] p-2 bg-background border border-border rounded-md text-text-primary text-sm text-right md:min-h-9")} />
                                                                    </div>
                                                                    <div>
                                                                        <label className="text-xs text-text-secondary block mb-1">Ед.</label>
                                                                        <select value={item.unit} onChange={e => updateItem(item.id, 'unit', e.target.value)} className="w-full min-h-[44px] rounded-md border border-border bg-background p-2 text-sm text-text-primary md:min-h-9">
                                                                            <option value="м2">м2</option>
                                                                            <option value="м/п">м/п</option>
                                                                            <option value="шт">шт</option>
                                                                            <option value="уп">уп</option>
                                                                            <option value="м3">м3</option>
                                                                        </select>
                                                                    </div>
                                                                </div>
                                                                {showActuals && (
                                                                    <div className="rounded-md border border-border bg-background/50 p-2">
                                                                        <div className="mb-2 flex items-center justify-between text-xs">
                                                                            <span className="font-semibold text-text-secondary">Факт</span>
                                                                            <span className={`font-semibold ${((calculateActualItemTotal(item) ?? item.total) - item.total) > 0 ? 'text-red-300' : ((calculateActualItemTotal(item) ?? item.total) - item.total) < 0 ? 'text-emerald-300' : 'text-text-secondary'}`}>
                                                                                Δ {(((calculateActualItemTotal(item) ?? item.total) - item.total) > 0 ? '+' : '')}{((calculateActualItemTotal(item) ?? item.total) - item.total).toLocaleString('ru-RU')} ₽
                                                                            </span>
                                                                        </div>
                                                                        <div className="grid grid-cols-3 gap-2">
                                                                            <div>
                                                                                <label className="text-xs text-text-secondary block mb-1">Кол-во</label>
                                                                                <input type="number" value={item.actual?.quantity ?? ''} onChange={e => updateActualItem(item.id, 'quantity', e.target.value)} className="w-full min-h-[44px] rounded-md border border-border bg-background p-2 text-right text-sm text-text-primary md:min-h-9" />
                                                                            </div>
                                                                            <div>
                                                                                <label className="text-xs text-text-secondary block mb-1">Цена</label>
                                                                                <input type="number" value={item.actual?.price ?? ''} onChange={e => updateActualItem(item.id, 'price', e.target.value)} className="w-full min-h-[44px] rounded-md border border-border bg-background p-2 text-right text-sm text-text-primary md:min-h-9" />
                                                                            </div>
                                                                            <div>
                                                                                <label className="text-xs text-text-secondary block mb-1">Ед.</label>
                                                                                <select value={item.actual?.unit || item.unit} onChange={e => updateActualItem(item.id, 'unit', e.target.value)} className="w-full min-h-[44px] rounded-md border border-border bg-background p-2 text-sm text-text-primary md:min-h-9">
                                                                                    <option value="м2">м2</option>
                                                                                    <option value="м/п">м/п</option>
                                                                                    <option value="шт">шт</option>
                                                                                    <option value="уп">уп</option>
                                                                                    <option value="м3">м3</option>
                                                                                </select>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                )}
                                                                <div className="flex items-center justify-between pt-1">
                                                                    <strong className="text-text-primary">{item.total.toLocaleString('ru-RU')} ₽</strong>
                                                                    <div className="flex items-center gap-2">
                                                                        <button onClick={() => setOpenNotes(prev => ({ ...prev, [item.id]: !prev[item.id] }))} className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded text-text-secondary transition-colors hover:bg-white/5 hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/50 md:min-h-9 md:min-w-9" title={item.note || 'Добавить примечание'}>
                                                                            📝{item.note && <span className="absolute w-2 h-2 bg-red-500 rounded-full" />}
                                                                        </button>
                                                                        <button onClick={() => removeItem(item.id)} className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded text-red-500 transition-colors hover:bg-red-500/10 hover:text-red-400 focus:outline-none focus:ring-2 focus:ring-primary/50 md:min-h-9 md:min-w-9">✖</button>
                                                                    </div>
                                                                </div>
                                                                {openNotes[item.id] && (
                                                                    <textarea value={item.note || ''} onChange={e => updateItem(item.id, 'note', e.target.value)} placeholder="Примечание..." className="w-full p-2 text-xs bg-background border border-border rounded text-text-primary resize-none min-h-[60px]" rows={2} />
                                                                )}
                                                            </div>
                                                        </article>
                                                        );
                                                    })}
                                                </div>
                                                {visibleSubItems.length > MAX_RENDERED_SUBITEMS && (
                                                    <div className="px-2 pt-2 text-sm text-text-secondary flex items-center justify-between gap-3">
                                                        <span>
                                                            {isSubgroupExpanded
                                                                ? `Показаны все ${visibleSubItems.length} позиций.`
                                                                : `Показано ${renderedSubItems.length} из ${visibleSubItems.length} позиций.`}
                                                        </span>
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleSubgroupExpansion(subgroupKey)}
                                                            className="font-semibold text-primary hover:text-primary-hover transition-colors"
                                                        >
                                                            {isSubgroupExpanded ? 'Свернуть список' : `Показать все ${visibleSubItems.length}`}
                                                        </button>
                                                    </div>
                                                )}
                                                <div className="p-2 bg-gray-900/30 border-t border-border rounded-b-md flex flex-wrap justify-end gap-2">
                                                    <button onClick={() => addItem(category, subgroup)} className="min-h-[44px] rounded bg-gray-600 px-3 py-1 text-xs font-semibold text-text-primary transition-colors hover:bg-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/50 active:bg-gray-400 sm:text-sm md:min-h-9">
                                                        <span className="sm:hidden">+ Добавить</span>
                                                        <span className="hidden sm:inline">+ Добавить {subgroup === EstimateSubgroup.WORKS ? 'позицию (Работы)' : subgroup === EstimateSubgroup.DELIVERY ? 'позицию (Доставка)' : 'позицию (Материалы)'}</span>
                                                    </button>
                                                    {showActuals && (
                                                        <button onClick={() => addActualOnlyItem(category, subgroup)} className="min-h-[44px] rounded border border-primary/50 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary/20 focus:outline-none focus:ring-2 focus:ring-primary/50 sm:text-sm md:min-h-9">
                                                            + Новая по факту
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                <div className="mt-5 flex justify-end border-t border-border pt-4">
                    <div className="flex flex-col items-end">
                        <div className="text-sm text-text-secondary">Работы: {subgroupTotals.works.toLocaleString('ru-RU')} ₽</div>
                        <div className="text-sm text-text-secondary">Материалы: {subgroupTotals.materials.toLocaleString('ru-RU')} ₽</div>
                        <div className="text-sm text-text-secondary">Доставка: {subgroupTotals.delivery.toLocaleString('ru-RU')} ₽</div>
                        <div className="mt-1 text-xl font-bold text-text-primary sm:text-2xl">ОБЩИЙ ИТОГ: {estimate.total.toLocaleString('ru-RU')} ₽</div>
                    </div>
                </div>

                <div className="mt-4 flex justify-end">
                    <button onClick={handleSave} className="min-h-[44px] w-full rounded-md bg-primary px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary/50 sm:w-auto md:min-h-9">
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
                notInDbItems={aiNotInDbItems}
                onAddToCatalog={(item) => {
                    // Add to the appropriate catalog (materials or works)
                    const isMaterial = item.subgroup === EstimateSubgroup.MATERIALS || item.subgroup === EstimateSubgroup.DELIVERY;
                    if (isMaterial && catalogContext?.onAddMaterial) {
                        catalogContext.onAddMaterial(item.name, item.category, item.price || 0);
                    } else if (!isMaterial && catalogContext?.onAddWork) {
                        catalogContext.onAddWork(item.name, item.category, item.price || 0);
                    }
                    setAiAddedToCatalogNames(prev => {
                        const next = new Set(prev);
                        next.add(item.name);
                        return next;
                    });
                }}
                addedToCatalogNames={aiAddedToCatalogNames}
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
                    handleGenerateWithAI({
                        scopeDescription: payload.description,
                        enableAiPriceSearch: payload.enableAiPriceSearch,
                        area: payload.area,
                        buildingType: payload.buildingType,
                        selectedSections: payload.selectedSections,
                        referenceEstimateId: payload.referenceEstimateId,
                        windowCount: payload.windowCount,
                        doorCount: payload.doorCount,
                    });
                }}
                allEstimates={visibleEstimatesValue}
                materials={materialsValue}
                works={worksValue}
                currentArea={estimate.area}
                currentBuildingType={estimate.buildingType}
            />
            {quickBundleModalOpen && quickBundleWork && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
                    <div className="w-full max-w-md rounded-lg border border-border bg-surface p-4 shadow-2xl">
                        <div className="mb-4">
                            <h3 className="text-lg font-bold text-text-primary">Сохранить компонент</h3>
                            <p className="mt-1 text-sm text-text-secondary">
                                Будет сохранено: 1 работа и {quickBundleLinkedItems.length} материал(ов).
                            </p>
                        </div>
                        <label className="mb-2 block text-sm font-semibold text-text-secondary">
                            Название компонента
                        </label>
                        <input
                            type="text"
                            value={quickBundleName}
                            onChange={event => setQuickBundleName(event.target.value)}
                            onKeyDown={event => {
                                if (event.key === 'Enter') void handleQuickBundleSave();
                                if (event.key === 'Escape') setQuickBundleModalOpen(false);
                            }}
                            className={inputStyles + " min-h-[44px]"}
                            autoFocus
                        />
                        <div className="mt-4 max-h-44 overflow-y-auto rounded-md border border-border bg-background/40 p-2">
                            {quickBundleDraftItems.map(item => (
                                <div key={item.id} className="flex items-center justify-between gap-3 py-1 text-sm">
                                    <span className="min-w-0 truncate text-text-primary">{item.name}</span>
                                    <span className="shrink-0 text-xs text-text-secondary">{item.subgroup || EstimateSubgroup.WORKS}</span>
                                </div>
                            ))}
                        </div>
                        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                            <button
                                type="button"
                                onClick={() => setQuickBundleModalOpen(false)}
                                className="min-h-[44px] rounded-md border border-border px-4 py-2 font-semibold text-text-secondary transition hover:bg-background"
                            >
                                Отмена
                            </button>
                            <button
                                type="button"
                                onClick={() => void handleQuickBundleSave()}
                                disabled={!quickBundleName.trim()}
                                className="min-h-[44px] rounded-md bg-primary px-4 py-2 font-bold text-white transition hover:bg-primary-hover disabled:bg-gray-600 disabled:text-text-secondary"
                            >
                                Сохранить
                            </button>
                        </div>
                    </div>
                </div>
            )}
            <BundlePickerModal
                isOpen={bundlePickerOpen}
                onClose={() => setBundlePickerOpen(false)}
                onConfirm={handleApplyBundles}
                bundles={bundlesValue}
                currentArea={estimate.area}
            />
            <PasteFromEstimateModal
                isOpen={pasteModalOpen}
                onClose={() => setPasteModalOpen(false)}
                onConfirm={handlePasteFromEstimate}
                estimates={allEstimatesValue}
                currentEstimateId={estimate.id}
                targetCategory={pasteTargetCategory}
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

export default React.memo(EstimateEditor);
