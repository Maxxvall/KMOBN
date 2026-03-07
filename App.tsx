import React, { useMemo, useState, useCallback, useEffect, useRef, lazy, Suspense } from 'react';
import FocusLock from 'react-focus-lock';
import type { User } from '@supabase/supabase-js';
import { Estimate, View, EstimateStatus, ProjectTemplate, Material, EstimateCategory, Work, EstimateSubgroup, WorkBundle, SubscriptionTier, UserSubscription, SubscriptionLimits, SubscriptionUsage } from './types';
import SyncToast from './components/SyncToast';
import Header from './components/Header';
import PdfStyleModal from './components/PdfStyleModal';
import ContractNameModal from './components/ContractNameModal';
import ScrollToTop from './components/ScrollToTop';
import Login from './components/Login';
import LandingPage from './components/LandingPage.tsx';
import WikiSkeleton from './components/Wiki/WikiSkeleton';
import SubscriptionGateModal from './components/SubscriptionGateModal';
import AppLoadingSkeleton from './components/AppLoadingSkeleton';
import { generatePdf } from './services/pdfGenerator';
import { generatePdf as generatePdfColored } from './services/pdfGenerator2';
import { generatePdfContract } from './services/pdfContractGenerator';
import { validateEstimate } from './services/estimateValidation';
import { hashData } from './services/hashing';
import { EstimateProvider } from './contexts/EstimateContext';
import { CatalogProvider } from './contexts/CatalogContext';
import { SubscriptionProvider } from './contexts/SubscriptionContext';
import { SyncProvider } from './contexts/SyncContext';
import { loadEstimates, saveEstimates, loadTemplates, loadMaterials, saveMaterials, addMaterial, updateMaterial, deleteMaterial, loadWorks, saveWorks, addWork, updateWork, deleteWork, loadBundles, saveBundles, addBundle, updateBundle, deleteBundle } from './services/database';
import type { CacheTableKey } from './services/indexedDbCache';
import supabase, { isSupabaseConfigured } from './services/supabase';
import { useDebouncedSave } from './hooks/useDebouncedSave';
import { useEstimateCrud } from './hooks/useEstimateCrud';
import {
    canCreateBundle,
    canCreateMaterial,
    canCreateWork,
    canUseAi,
    canUseAnalytics,
    canUseSalaryCalculator,
    canUseWiki,
    deriveSubscriptionUsage,
    getSubscriptionLimits,
    getVisibleSubscriptionData,
    getUserSubscription,
    incrementAiUsage,
    incrementDeletedEstimates,
    normalizeSubscriptionUsage,
    updateUserSubscription,
} from './services/subscriptionService';
import { createPayment } from './services/paymentService';

const EstimateHistory = lazy(() => import('./components/EstimateHistory'));
const EstimateEditor = lazy(() => import('./components/EstimateEditor'));
const Prices = lazy(() => import('./components/Prices'));
const Works = lazy(() => import('./components/Works'));
const Bundles = lazy(() => import('./components/Bundles'));
const SalaryCalculator = lazy(() => import('./components/SalaryCalculator'));
const Analytics = lazy(() => import('./components/Analytics'));
const Subscriptions = lazy(() => import('./components/Subscriptions'));
const Wiki = lazy(() => import('./components/Wiki'));

const AUTOSAVE_DELAY_MS = 8000;


type SaveMode = 'overwrite' | 'new';

const RECOVERY_STORAGE_KEY = 'kmobn:recoveryRequired';
const hasRecoveryFlagInUrl = (): boolean => {
    if (typeof window === 'undefined') return false;
    const combined = `${window.location.search}${window.location.hash}`.toLowerCase();
    return combined.includes('type=recovery');
};

const normalizeEstimateChains = (raw: Estimate[]): { normalized: Estimate[]; changed: boolean } => {
    const byNumber = new Map<string, Estimate[]>();
    raw.forEach(e => {
        const key = e.estimateNumber || e.id;
        const list = byNumber.get(key) ?? [];
        list.push(e);
        byNumber.set(key, list);
    });

    let changed = false;
    const normalized: Estimate[] = [];

    byNumber.forEach(list => {
        if (list.length === 1) {
            const only = list[0];
            const fixed = {
                ...only,
                parentId: undefined,
                isArchived: false,
            };
            if (only.parentId || only.isArchived) changed = true;
            normalized.push(fixed);
            return;
        }

        const sorted = [...list].sort((a, b) => {
            if (b.version !== a.version) return b.version - a.version;
            return new Date(b.date).getTime() - new Date(a.date).getTime();
        });
        const latest = sorted[0];
        sorted.forEach(e => {
            if (e.id === latest.id) {
                const fixed = { ...e, parentId: undefined, isArchived: false };
                if (e.parentId || e.isArchived) changed = true;
                normalized.push(fixed);
            } else {
                const fixed = {
                    ...e,
                    parentId: latest.id,
                    isArchived: true,
                    status: EstimateStatus.ARCHIVED,
                };
                if (e.parentId !== latest.id || !e.isArchived || e.status !== EstimateStatus.ARCHIVED) changed = true;
                normalized.push(fixed);
            }
        });
    });

    return { normalized, changed };
};

const App: React.FC = () => {
    const [supabaseUser, setSupabaseUser] = useState<User | null>(null);
    const useSupabaseAuth = isSupabaseConfigured();
    const [subscription, setSubscription] = useState<UserSubscription | null>(null);
    const [subscriptionLoading, setSubscriptionLoading] = useState(false);
    const [paymentLoading, setPaymentLoading] = useState(false);
    const [recoveryRequired, setRecoveryRequired] = useState(() => {
        try {
            return localStorage.getItem(RECOVERY_STORAGE_KEY) === 'true' || hasRecoveryFlagInUrl();
        } catch {
            return hasRecoveryFlagInUrl();
        }
    });
    const recoveryIntent = recoveryRequired || hasRecoveryFlagInUrl();
    const isAuthenticated = useMemo(() => {
        return Boolean(supabaseUser) && !recoveryIntent;
    }, [supabaseUser, recoveryIntent]);
    const displayName = useMemo(() => {
        if (supabaseUser) {
            const meta = supabaseUser.user_metadata as Record<string, string | undefined> | undefined;
            return (
                meta?.full_name ||
                meta?.name ||
                supabaseUser.email ||
                supabaseUser.phone ||
                'Пользователь'
            );
        }
        return null;
    }, [supabaseUser]);
    const [view, setView] = useState<View>(View.HISTORY);
    const [estimates, setEstimates] = useState<Estimate[]>([]);
    const [templates, setTemplates] = useState<ProjectTemplate[]>([]);
    const [materials, setMaterials] = useState<Material[]>([]);
    const [works, setWorks] = useState<Work[]>([]);
    const [bundles, setBundles] = useState<WorkBundle[]>([]);
    const [currentEstimate, setCurrentEstimate] = useState<Estimate | null>(null);
    const subscriptionTier: SubscriptionTier = subscription?.subscription_tier ?? 'free';
    const subscriptionLimits: SubscriptionLimits = useMemo(() => getSubscriptionLimits(subscriptionTier), [subscriptionTier]);
    const visibleSubscriptionData = useMemo(() => getVisibleSubscriptionData({
        limits: subscriptionLimits,
        estimates,
        materials,
        works,
        bundles,
    }), [subscriptionLimits, estimates, materials, works, bundles]);
    const subscriptionUsage: SubscriptionUsage = useMemo(() => {
        return deriveSubscriptionUsage({
            subscription,
            estimates: visibleSubscriptionData.estimates,
            materials: visibleSubscriptionData.materials,
            works: visibleSubscriptionData.works,
            bundles: visibleSubscriptionData.bundles,
        });
    }, [subscription, visibleSubscriptionData]);
    const headerSubscriptionSummary = useMemo(() => ({
        tier: subscriptionTier,
        usage: subscriptionUsage,
        limits: subscriptionLimits,
    }), [subscriptionTier, subscriptionUsage, subscriptionLimits]);
    const [isLoading, setIsLoading] = useState(true);
    const [loadedFlags, setLoadedFlags] = useState({
        estimates: false,
        templates: false,
        materials: false,
        works: false,
        bundles: false,
    });
    const [wikiLoaded, setWikiLoaded] = useState(false);
    const [dataHashes, setDataHashes] = useState<Record<string, string>>({});
    const [sync, setSync] = useState<{ visible: boolean; message: string; type: 'success' | 'error' | 'info' }>({ visible: false, message: '', type: 'info' });
    const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [showPasswordRecoveryModal, setShowPasswordRecoveryModal] = useState(false);
    const [showLoginModal, setShowLoginModal] = useState(false);
    const [recoveryPassword, setRecoveryPassword] = useState('');
    const [recoverySubmitting, setRecoverySubmitting] = useState(false);
    const [showPdfStyleModal, setShowPdfStyleModal] = useState(false);
    const [showContractNameModal, setShowContractNameModal] = useState(false);
    const [pendingExportEstimate, setPendingExportEstimate] = useState<Estimate | null>(null);
    const [editorValidationResult, setEditorValidationResult] = useState<ReturnType<typeof validateEstimate> | null>(null);
    const [editorDirty, setEditorDirty] = useState(false);
    const [editorDraft, setEditorDraft] = useState<Estimate | null>(null);
    const [showSaveOptions, setShowSaveOptions] = useState(false);
    const [viewAfterSave, setViewAfterSave] = useState<View>(View.HISTORY);
    const [showUnsavedModal, setShowUnsavedModal] = useState(false);
    const [pendingView, setPendingView] = useState<View | null>(null);
    const [accessModal, setAccessModal] = useState<{ title: string; description: string } | null>(null);

    const [isSaving, setIsSaving] = useState(false);
    const [lastSaved, setLastSaved] = useState<Date | null>(null);
    const [saveError, setSaveError] = useState<string | null>(null);
    const autosaveSuppressedRef = useRef(false);
    const didHydrateRef = useRef(false);
    const saveInFlightRef = useRef(false);
    const saveQueuedRef = useRef(false);
    const savedIndicatorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Dirty flags: track which data actually changed since last save
    const dirtyTablesRef = useRef<Record<string, boolean>>({
        estimates: false,
        materials: false,
        works: false,
        bundles: false,
    });
    const prevEstimatesRef = useRef(estimates);
    const prevMaterialsRef = useRef(materials);
    const prevWorksRef = useRef(works);
    const prevBundlesRef = useRef(bundles);

    useEffect(() => {
        if (prevEstimatesRef.current !== estimates) {
            dirtyTablesRef.current.estimates = true;
            prevEstimatesRef.current = estimates;
        }
    }, [estimates]);
    useEffect(() => {
        if (prevMaterialsRef.current !== materials) {
            dirtyTablesRef.current.materials = true;
            prevMaterialsRef.current = materials;
        }
    }, [materials]);
    useEffect(() => {
        if (prevWorksRef.current !== works) {
            dirtyTablesRef.current.works = true;
            prevWorksRef.current = works;
        }
    }, [works]);
    useEffect(() => {
        if (prevBundlesRef.current !== bundles) {
            dirtyTablesRef.current.bundles = true;
            prevBundlesRef.current = bundles;
        }
    }, [bundles]);

    const needsReload = useCallback((key: string, data: unknown): boolean => {
        const currentHash = hashData(data);
        const savedHash = dataHashes[key];
        return savedHash !== currentHash;
    }, [dataHashes]);

    const handleCacheUpdate = useCallback((detail: { key: CacheTableKey; data: unknown[] }) => {
        const nextHash = hashData(detail.data);
        if (dataHashes[detail.key] === nextHash) return;

        if (detail.key === 'estimates') {
            const loaded = detail.data as Estimate[];
            const { normalized, changed } = normalizeEstimateChains(loaded);
            setEstimates(normalized);
            setLoadedFlags(prev => ({ ...prev, estimates: true }));
            setDataHashes(prev => ({ ...prev, estimates: hashData(loaded) }));
            if (changed) {
                void saveEstimates(normalized);
            }
            return;
        }

        if (detail.key === 'templates') {
            const loaded = detail.data as ProjectTemplate[];
            setTemplates(loaded);
            setLoadedFlags(prev => ({ ...prev, templates: true }));
            setDataHashes(prev => ({ ...prev, templates: hashData(loaded) }));
            return;
        }

        if (detail.key === 'materials') {
            const loaded = detail.data as Material[];
            setMaterials(loaded);
            setLoadedFlags(prev => ({ ...prev, materials: true }));
            setDataHashes(prev => ({ ...prev, materials: hashData(loaded) }));
            return;
        }

        if (detail.key === 'works') {
            const loaded = detail.data as Work[];
            setWorks(loaded);
            setLoadedFlags(prev => ({ ...prev, works: true }));
            setDataHashes(prev => ({ ...prev, works: hashData(loaded) }));
            return;
        }

        if (detail.key === 'bundles') {
            const loaded = detail.data as WorkBundle[];
            setBundles(loaded);
            setLoadedFlags(prev => ({ ...prev, bundles: true }));
            setDataHashes(prev => ({ ...prev, bundles: hashData(loaded) }));
        }
    }, [dataHashes]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const handler = (event: Event) => {
            const custom = event as CustomEvent;
            const detail = custom.detail as { key: CacheTableKey; data: unknown[] } | undefined;
            if (!detail || !detail.key || !Array.isArray(detail.data)) return;
            handleCacheUpdate(detail);
        };
        window.addEventListener('kmobn:cache-update', handler as EventListener);
        return () => window.removeEventListener('kmobn:cache-update', handler as EventListener);
    }, [handleCacheUpdate]);

    const handleLogin = useCallback(async (_username: string, _password: string) => {
        if (!useSupabaseAuth) {
            throw new Error('Supabase не настроен');
        }
        throw new Error('Локальный вход отключен');
    }, [useSupabaseAuth]);

    useEffect(() => {
        if (!supabaseUser) {
            setSubscription(null);
            setSubscriptionLoading(false);
            return;
        }

        let isMounted = true;
        setSubscriptionLoading(true);

        const loadSubscription = async () => {
            const data = await getUserSubscription(supabaseUser.id);
            if (!isMounted) return;
            if (!data) {
                setSubscription(null);
                setSubscriptionLoading(false);
                return;
            }

            const normalized = normalizeSubscriptionUsage(data);
            setSubscription(normalized.subscription);
            setSubscriptionLoading(false);

            if (Object.keys(normalized.updates).length > 0) {
                void updateUserSubscription(supabaseUser.id, normalized.updates);
            }
        };

        void loadSubscription();

        return () => {
            isMounted = false;
        };
    }, [supabaseUser]);

    const handleGoogleLogin = useCallback(async () => {
        if (!supabase) {
            throw new Error('Supabase не настроен для входа через Google');
        }
        const redirectTo =
            (import.meta.env.VITE_AUTH_REDIRECT_URL as string) ||
            (import.meta.env.VITE_SITE_URL as string) ||
            window.location.origin;

        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo,
            },
        });
        if (error) {
            throw new Error(error.message);
        }
    }, []);

    const handleEmailLogin = useCallback(async (email: string, password: string) => {
        if (!supabase) {
            throw new Error('Supabase не настроен для входа по email');
        }
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
            const message = error.message?.toLowerCase().includes('invalid login credentials')
                ? 'Неверные данные'
                : error.message;
            throw new Error(message);
        }
    }, []);

    const handleEmailSignup = useCallback(async (payload: { name: string; email: string; password: string; phone?: string }) => {
        if (!supabase) {
            throw new Error('Supabase не настроен для регистрации');
        }
        const redirectTo =
            (import.meta.env.VITE_AUTH_REDIRECT_URL as string) ||
            (import.meta.env.VITE_SITE_URL as string) ||
            window.location.origin;
        const { error } = await supabase.auth.signUp({
            email: payload.email,
            password: payload.password,
            options: {
                emailRedirectTo: redirectTo,
                data: {
                    full_name: payload.name,
                    phone: payload.phone,
                },
            },
        });
        if (error) {
            throw new Error(error.message);
        }
    }, []);

    const handleResetPassword = useCallback(async (email: string) => {
        if (!supabase) {
            throw new Error('Supabase не настроен для восстановления пароля');
        }
        const redirectTo =
            (import.meta.env.VITE_AUTH_REDIRECT_URL as string) ||
            (import.meta.env.VITE_SITE_URL as string) ||
            window.location.origin;
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo,
        });
        if (error) {
            throw new Error(error.message);
        }
    }, []);

    const handleOpenPasswordChange = useCallback(() => {
        setShowPasswordRecoveryModal(true);
    }, []);

    const handleLogout = useCallback(async () => {
        try {
            if (supabase) {
                await supabase.auth.signOut();
            }
        } catch (error) {
            console.error('Supabase signOut error:', error);
        }
        setSupabaseUser(null);
        setRecoveryRequired(false);
        try {
            localStorage.removeItem(RECOVERY_STORAGE_KEY);
        } catch {
        }
    }, []);

    useEffect(() => {
        if (!supabase || !useSupabaseAuth) return;

        let isMounted = true;

        const markRecoveryRequired = () => {
            setRecoveryRequired(true);
            try {
                localStorage.setItem(RECOVERY_STORAGE_KEY, 'true');
            } catch {
                // ignore
            }
        };

        const clearRecoveryRequired = () => {
            setRecoveryRequired(false);
            try {
                localStorage.removeItem(RECOVERY_STORAGE_KEY);
            } catch {
                // ignore
            }
        };

        const clearRecoveryFlag = () => {
            if (typeof window === 'undefined') return;
            const url = new URL(window.location.href);
            if (url.hash) {
                url.hash = '';
            }
            if (url.searchParams.get('type') === 'recovery') {
                url.searchParams.delete('type');
                url.searchParams.delete('token');
                url.searchParams.delete('redirect_to');
            }
            window.history.replaceState({}, document.title, url.toString());
        };

        const initSession = async () => {
            const { data, error } = await supabase.auth.getSession();
            if (error) {
                console.error('Supabase getSession error:', error);
                return;
            }
            if (!isMounted) return;
            setSupabaseUser(data.session?.user ?? null);
            if (!data.session?.user) {
                clearRecoveryRequired();
            }
            if (data.session?.user && hasRecoveryFlagInUrl()) {
                setShowPasswordRecoveryModal(true);
                markRecoveryRequired();
                clearRecoveryFlag();
            }
        };

        void initSession();

        const { data } = supabase.auth.onAuthStateChange((event, session) => {
            setSupabaseUser(session?.user ?? null);
            if (!session?.user) {
                clearRecoveryRequired();
            }
            const shouldRecover = hasRecoveryFlagInUrl();
            if (
                event === 'PASSWORD_RECOVERY' ||
                event === 'SIGNED_IN' ||
                (event === 'INITIAL_SESSION' && shouldRecover)
            ) {
                if (!shouldRecover && event === 'SIGNED_IN') {
                    return;
                }
                setShowPasswordRecoveryModal(true);
                markRecoveryRequired();
                clearRecoveryFlag();
            }
        });

        return () => {
            isMounted = false;
            data.subscription.unsubscribe();
        };
    }, [useSupabaseAuth]);

    useEffect(() => {
        if (recoveryIntent) {
            setShowPasswordRecoveryModal(true);
        }
    }, [recoveryIntent]);

    const handleUpdatePassword = useCallback(async () => {
        if (!supabase) return;
        if (!recoveryPassword) {
            setSync({ visible: true, message: 'Введите новый пароль', type: 'error' });
            setTimeout(() => setSync(s => ({ ...s, visible: false })), 3000);
            return;
        }
        setRecoverySubmitting(true);
        try {
            const { error } = await supabase.auth.updateUser({ password: recoveryPassword });
            if (error) {
                throw error;
            }
            setShowPasswordRecoveryModal(false);
            setRecoveryRequired(false);
            try {
                localStorage.removeItem(RECOVERY_STORAGE_KEY);
            } catch {
                // ignore
            }
            setRecoveryPassword('');
            setSync({ visible: true, message: 'Пароль обновлен. Войдите заново.', type: 'success' });
            setTimeout(() => setSync(s => ({ ...s, visible: false })), 4000);
            await supabase.auth.signOut();
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Ошибка обновления пароля';
            setSync({ visible: true, message, type: 'error' });
            setTimeout(() => setSync(s => ({ ...s, visible: false })), 4000);
        } finally {
            setRecoverySubmitting(false);
        }
    }, [recoveryPassword]);

    const loadHistoryData = useCallback(async (showToast: boolean) => {
        if (loadedFlags.estimates && loadedFlags.templates) return;
        setIsLoading(true);
        try {
            const [loadedEstimates, loadedTemplates] = await Promise.all([
                loadedFlags.estimates ? Promise.resolve(estimates) : loadEstimates(),
                loadedFlags.templates ? Promise.resolve(templates) : loadTemplates(),
            ]);
            if (loadedEstimates.length === 0) {
                setEstimates([]);
            } else {
                const { normalized, changed } = normalizeEstimateChains(loadedEstimates);
                setEstimates(normalized);
                if (changed) {
                    await saveEstimates(normalized);
                }
            }
            setTemplates(loadedTemplates || []);
            setLoadedFlags(prev => ({ ...prev, estimates: true, templates: true }));
            setDataHashes(prev => ({
                ...prev,
                estimates: hashData(loadedEstimates),
                templates: hashData(loadedTemplates || []),
            }));
            if (showToast) {
                setSync({ visible: true, message: 'Данные загружены', type: 'success' });
                setTimeout(() => setSync(s => ({ ...s, visible: false })), 3000);
            }
        } catch (error) {
            console.error('Failed to load history data:', error);
            setEstimates([]);
            setTemplates([]);
            if (showToast) {
                setSync({ visible: true, message: 'Ошибка загрузки данных', type: 'error' });
                setTimeout(() => setSync(s => ({ ...s, visible: false })), 5000);
            }
        } finally {
            setIsLoading(false);
        }
    }, [estimates, loadedFlags.estimates, loadedFlags.templates, templates]);

    const loadMaterialsData = useCallback(async () => {
        if (loadedFlags.materials) return;
        try {
            const loaded = await loadMaterials();
            setMaterials(loaded || []);
            setLoadedFlags(prev => ({ ...prev, materials: true }));
            setDataHashes(prev => ({ ...prev, materials: hashData(loaded || []) }));
        } catch (error) {
            console.error('Failed to load materials:', error);
            setMaterials([]);
        }
    }, [loadedFlags.materials]);

    const loadWorksData = useCallback(async () => {
        if (loadedFlags.works) return;
        try {
            const loaded = await loadWorks();
            setWorks(loaded || []);
            setLoadedFlags(prev => ({ ...prev, works: true }));
            setDataHashes(prev => ({ ...prev, works: hashData(loaded || []) }));
        } catch (error) {
            console.error('Failed to load works:', error);
            setWorks([]);
        }
    }, [loadedFlags.works]);

    const loadBundlesData = useCallback(async () => {
        if (loadedFlags.bundles) return;
        try {
            const loaded = await loadBundles();
            setBundles(loaded || []);
            setLoadedFlags(prev => ({ ...prev, bundles: true }));
            setDataHashes(prev => ({ ...prev, bundles: hashData(loaded || []) }));
        } catch (error) {
            console.error('Failed to load bundles:', error);
            setBundles([]);
        }
    }, [loadedFlags.bundles]);

    useEffect(() => {
        if (loadedFlags.estimates) {
            setDataHashes(prev => ({ ...prev, estimates: hashData(estimates) }));
        }
    }, [estimates, loadedFlags.estimates]);

    useEffect(() => {
        if (loadedFlags.templates) {
            setDataHashes(prev => ({ ...prev, templates: hashData(templates) }));
        }
    }, [loadedFlags.templates, templates]);

    useEffect(() => {
        if (loadedFlags.materials) {
            setDataHashes(prev => ({ ...prev, materials: hashData(materials) }));
        }
    }, [loadedFlags.materials, materials]);

    useEffect(() => {
        if (loadedFlags.works) {
            setDataHashes(prev => ({ ...prev, works: hashData(works) }));
        }
    }, [loadedFlags.works, works]);

    useEffect(() => {
        if (loadedFlags.bundles) {
            setDataHashes(prev => ({ ...prev, bundles: hashData(bundles) }));
        }
    }, [bundles, loadedFlags.bundles]);

    useEffect(() => {
        if (!isAuthenticated) return;
        const historyChanged = needsReload('estimates', estimates) || needsReload('templates', templates);
        const materialsChanged = needsReload('materials', materials);
        const worksChanged = needsReload('works', works);
        const bundlesChanged = needsReload('bundles', bundles);
        if (view === View.HISTORY) {
            if (!loadedFlags.estimates || !loadedFlags.templates || historyChanged) {
                void loadHistoryData(true);
            }
        }
        if (view === View.ANALYTICS || view === View.SALARY_CALCULATOR) {
            if (!loadedFlags.estimates || !loadedFlags.templates || historyChanged) {
                void loadHistoryData(false);
            }
        }
        if (view === View.PRICES) {
            if (!loadedFlags.materials || materialsChanged) {
                void loadMaterialsData();
            }
        }
        if (view === View.WORKS) {
            if (!loadedFlags.works || worksChanged) {
                void loadWorksData();
            }
        }
        if (view === View.BUNDLES) {
            if (!loadedFlags.materials || !loadedFlags.works || !loadedFlags.bundles || materialsChanged || worksChanged || bundlesChanged) {
                void Promise.all([loadMaterialsData(), loadWorksData(), loadBundlesData()]);
            }
        }
        if (view === View.EDITOR) {
            if (
                !loadedFlags.estimates ||
                !loadedFlags.templates ||
                !loadedFlags.materials ||
                !loadedFlags.works ||
                !loadedFlags.bundles ||
                historyChanged ||
                materialsChanged ||
                worksChanged ||
                bundlesChanged
            ) {
                void Promise.all([loadHistoryData(false), loadMaterialsData(), loadWorksData(), loadBundlesData()]);
            }
        }
        if (view === View.WIKI && !wikiLoaded) {
            setWikiLoaded(true);
        }
    }, [bundles, estimates, isAuthenticated, loadBundlesData, loadHistoryData, loadMaterialsData, loadWorksData, loadedFlags.bundles, loadedFlags.estimates, loadedFlags.materials, loadedFlags.templates, loadedFlags.works, materials, needsReload, templates, view, wikiLoaded, works]);

    const saveAllToDatabase = useCallback(async () => {
        if (isLoading) return;
        if (autosaveSuppressedRef.current) return;

        if (saveInFlightRef.current) {
            saveQueuedRef.current = true;
            return;
        }

        saveInFlightRef.current = true;
        setIsSaving(true);
        setSaveError(null);

        try {
            const dirty = dirtyTablesRef.current;
            const tasks: Promise<void>[] = [];
            if (loadedFlags.estimates && dirty.estimates) tasks.push(saveEstimates(estimates));
            if (loadedFlags.materials && dirty.materials) tasks.push(saveMaterials(materials));
            if (loadedFlags.works && dirty.works) tasks.push(saveWorks(works));
            if (loadedFlags.bundles && dirty.bundles) tasks.push(saveBundles(bundles));
            if (tasks.length) {
                await Promise.all(tasks);
            }
            // Reset dirty flags after successful save
            dirtyTablesRef.current = {
                estimates: false,
                materials: false,
                works: false,
                bundles: false,
            };
            const now = new Date();
            setLastSaved(now);
            if (savedIndicatorTimerRef.current) {
                clearTimeout(savedIndicatorTimerRef.current);
            }
            savedIndicatorTimerRef.current = setTimeout(() => {
                setLastSaved(null);
            }, 2000);
        } catch (error) {
            console.error('Failed to save data to database:', error);
            setSaveError('Ошибка сохранения');
        } finally {
            setIsSaving(false);
            saveInFlightRef.current = false;

            if (saveQueuedRef.current) {
                saveQueuedRef.current = false;
                void saveAllToDatabase();
            }
        }
    }, [bundles, estimates, isLoading, loadedFlags.bundles, loadedFlags.estimates, loadedFlags.materials, loadedFlags.works, materials, works]);

    const debouncedSaveAll = useDebouncedSave(saveAllToDatabase, AUTOSAVE_DELAY_MS);

    useEffect(() => {
        if (isLoading) return;
        if (!didHydrateRef.current) {
            didHydrateRef.current = true;
            return;
        }
        if (autosaveSuppressedRef.current) return;

        debouncedSaveAll();
    }, [bundles, debouncedSaveAll, estimates, isLoading, materials, works]);

    useEffect(() => {
        return () => {
            debouncedSaveAll.cancel();
            if (savedIndicatorTimerRef.current) {
                clearTimeout(savedIndicatorTimerRef.current);
            }
        };
    }, [debouncedSaveAll]);

    useEffect(() => {
        const handleBlur = () => {
            if (!isLoading) {
                debouncedSaveAll.flush();
            }
        };
        const handleVisibility = () => {
            if (document.visibilityState === 'hidden' && !isLoading) {
                debouncedSaveAll.flush();
            }
        };
        window.addEventListener('blur', handleBlur);
        document.addEventListener('visibilitychange', handleVisibility);
        return () => {
            window.removeEventListener('blur', handleBlur);
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    }, [debouncedSaveAll, isLoading]);


    const goToView = useCallback((target: View) => {
        setView(target);
        if (target !== View.EDITOR) {
            setCurrentEstimate(null);
        }
    }, [setView, setCurrentEstimate]);

    const openAccessModal = useCallback((title: string, description: string) => {
        setAccessModal({ title, description });
    }, []);

    const closeAccessModal = useCallback(() => {
        setAccessModal(null);
    }, []);

    const confirmAccessModal = useCallback(() => {
        setAccessModal(null);
        goToView(View.SUBSCRIPTIONS);
    }, [goToView]);

    const handleUpgradeClick = useCallback(() => {
        goToView(View.SUBSCRIPTIONS);
    }, [goToView]);

    const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info', duration = 3200) => {
        setSync({ visible: true, message, type });
        if (toastTimerRef.current) {
            clearTimeout(toastTimerRef.current);
        }
        if (duration > 0) {
            toastTimerRef.current = setTimeout(() => {
                setSync(s => ({ ...s, visible: false }));
            }, duration);
        }
    }, [setSync]);

    useEffect(() => {
        const handleOnline = () => showToast('Соединение восстановлено', 'success');
        const handleOffline = () => showToast('Нет соединения. Данные будут синхронизированы позже', 'info', 0);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, [showToast]);

    useEffect(() => {
        return () => {
            if (toastTimerRef.current) {
                clearTimeout(toastTimerRef.current);
            }
        };
    }, []);

    const handleNavigationAttempt = useCallback((target: View) => {
        if (view === View.EDITOR && editorDirty && target !== View.EDITOR) {
            setPendingView(target);
            setShowUnsavedModal(true);
            return;
        }

        if (target === View.ANALYTICS && !canUseAnalytics(subscriptionLimits)) {
            openAccessModal('Аналитика доступна на Premium', 'Откройте Premium, чтобы сравнивать сметы и получать расширенную аналитику.');
            return;
        }
        if (target === View.SALARY_CALCULATOR && !canUseSalaryCalculator(subscriptionLimits)) {
            openAccessModal('Калькулятор зарплаты доступен на Basic и Premium', 'Оформите подписку, чтобы считать зарплаты и загрузку бригад.');
            return;
        }
        if (target === View.WIKI && !canUseWiki(subscriptionLimits)) {
            openAccessModal('Wiki доступна на Basic и Premium', 'Подключите подписку, чтобы использовать базу знаний и AI‑помощника.');
            return;
        }

        goToView(target);
    }, [view, editorDirty, goToView, subscriptionLimits, openAccessModal]);

    const handleBackToHistory = useCallback(() => {
        handleNavigationAttempt(View.HISTORY);
    }, [handleNavigationAttempt]);

    const recalculateEstimatePrices = useCallback((estimate: Estimate): Estimate => {
        const materialsMap = new Map(materials.map(material => [material.name, material.price]));
        const worksMap = new Map(works.map(work => [work.name, work.price]));

        const updatedItems = estimate.items.map(item => {
            let newPrice = item.price;
            if (item.subgroup === EstimateSubgroup.MATERIALS) {
                const nextPrice = materialsMap.get(item.name);
                if (typeof nextPrice === 'number') {
                    newPrice = nextPrice;
                }
            } else if (item.subgroup === EstimateSubgroup.WORKS) {
                const nextPrice = worksMap.get(item.name);
                if (typeof nextPrice === 'number') {
                    newPrice = nextPrice;
                }
            }
            return { ...item, price: newPrice, total: item.quantity * newPrice };
        });

        const newTotal = updatedItems.reduce((sum, item) => sum + item.total, 0);
        return { ...estimate, items: updatedItems, total: newTotal, needsPriceUpdate: false };
    }, [materials, works]);

    const consumeDeleteLimit = useCallback(() => {
        if (!subscription || !supabaseUser) return;
        const next = incrementDeletedEstimates(subscription);
        setSubscription(next);
        void updateUserSubscription(supabaseUser.id, {
            estimates_deleted_this_month: next.estimates_deleted_this_month ?? 0,
            limits_reset_date: next.limits_reset_date ?? null,
        });
    }, [subscription, supabaseUser]);

    const consumeAiLimit = useCallback(() => {
        if (!subscription || !supabaseUser) return;
        const next = incrementAiUsage(subscription);
        setSubscription(next);
        void updateUserSubscription(supabaseUser.id, {
            ai_requests_today: next.ai_requests_today ?? 0,
            last_ai_request_date: next.last_ai_request_date ?? null,
        });
    }, [subscription, supabaseUser]);

    const aiAccess = useMemo(() => {
        const canUse = canUseAi(subscriptionUsage, subscriptionLimits);
        const limit = subscriptionLimits.aiRequestsPerDay;
        const remaining = limit == null ? null : Math.max(0, limit - subscriptionUsage.aiRequestsToday);
        return {
            canUseAi: canUse,
            remaining,
            onConsume: consumeAiLimit,
        };
    }, [subscriptionUsage, subscriptionLimits, consumeAiLimit]);

    const {
        handleCreateNew,
        handleEdit,
        handleSaveEstimate,
        handleDeleteEstimate,
        handleDeleteEstimateVersion,
        handleSaveAsTemplate,
        handleDeleteTemplate,
    } = useEstimateCrud({
        estimates,
        subscriptionUsage,
        subscriptionLimits,
        goToView,
        openAccessModal,
        recalculateEstimatePrices,
        consumeDeleteLimit,
        setEstimates,
        setTemplates,
        setCurrentEstimate,
        setEditorValidationResult,
        setEditorDirty,
        setEditorDraft,
        setShowSaveOptions,
        setShowUnsavedModal,
        setPendingView,
        setViewAfterSave,
        setSync,
    });

    const handleDraftChange = useCallback((draft: Estimate) => {
        setEditorDraft(draft);
    }, []);

    const handleDirtyChange = useCallback((dirty: boolean) => {
        setEditorDirty(dirty);
    }, []);

    const handleSaveRequest = useCallback((draft: Estimate) => {
        setEditorDraft(draft);
        setViewAfterSave(View.HISTORY);
        setShowSaveOptions(true);
        setShowUnsavedModal(false);
        setPendingView(null);
    }, []);

    const handleConfirmSave = useCallback((mode: SaveMode) => {
        if (!editorDraft) return;
        handleSaveEstimate(editorDraft, mode, viewAfterSave);
    }, [editorDraft, handleSaveEstimate, viewAfterSave]);

    const handleUnsavedSave = useCallback(() => {
        const target = pendingView ?? View.HISTORY;
        setViewAfterSave(target);
        setShowUnsavedModal(false);
        setShowSaveOptions(true);
    }, [pendingView]);

    const handleUnsavedDiscard = useCallback(() => {
        const target = pendingView ?? View.HISTORY;
        setShowUnsavedModal(false);
        setPendingView(null);
        setEditorDirty(false);
        setEditorDraft(null);
        goToView(target);
    }, [pendingView, goToView]);

    const handleSaveOptionsKeyDown = useCallback((event: React.KeyboardEvent) => {
        if (event.key === 'Escape') {
            setShowSaveOptions(false);
        }
    }, []);

    const handleUnsavedKeyDown = useCallback((event: React.KeyboardEvent) => {
        if (event.key === 'Escape') {
            setShowUnsavedModal(false);
        }
    }, []);

    useEffect(() => {
        if (view !== View.EDITOR) {
            setShowSaveOptions(false);
            setShowUnsavedModal(false);
            setEditorDirty(false);
            setEditorDraft(null);
            setPendingView(null);
        }
    }, [view]);

    const handleGeneratePdf = useCallback((estimate: Estimate) => {
        let exportEstimate = estimate;
        if (estimate.status === EstimateStatus.DRAFT && estimate.needsPriceUpdate) {
            exportEstimate = recalculateEstimatePrices(estimate);
            setEstimates(prev => prev.map(item => item.id === estimate.id ? exportEstimate : item));
            if (currentEstimate?.id === estimate.id) {
                setCurrentEstimate(exportEstimate);
            }
        }

        const validation = validateEstimate(exportEstimate);
        if (validation.issues.length > 0) {
            setEditorValidationResult(validation);
            setCurrentEstimate(exportEstimate);
            setEditorDirty(false);
            setEditorDraft(null);
            setPendingView(null);
            setShowSaveOptions(false);
            setShowUnsavedModal(false);
            goToView(View.EDITOR);

            alert(
                `Перед PDF нужно исправить ошибки в смете.\n` +
                `Проблемных строк: ${validation.invalidItemIds.size}. Ошибок: ${validation.issues.length}.\n` +
                `Я открыл смету в редакторе и подсветил проблемные строки.`
            );
            return;
        }

        setPendingExportEstimate(exportEstimate);
        setShowPdfStyleModal(true);
    }, [goToView, recalculateEstimatePrices, currentEstimate, setEstimates]);

    const handlePdfStyleSelect = useCallback((style: 'simple' | 'colored' | 'word-contract') => {
        if (!pendingExportEstimate) return;

        if (style === 'word-contract') {
            setShowPdfStyleModal(false);
            setShowContractNameModal(true);
            return;
        }
        
        try {
            if (style === 'simple') {
                generatePdf(pendingExportEstimate);
            } else {
                generatePdfColored(pendingExportEstimate);
            }
        } catch (error) {
            console.error("PDF Generation Error:", error);
            alert("Не удалось сгенерировать PDF. Проверьте консоль для получения дополнительной информации.");
        } finally {
            setShowPdfStyleModal(false);
            setPendingExportEstimate(null);
        }
    }, [pendingExportEstimate]);

    const handleContractNameConfirm = useCallback(async (contractName: string) => {
        if (!pendingExportEstimate) return;

        try {
            await generatePdfContract(pendingExportEstimate, contractName);
        } catch (error) {
            console.error('PDF Contract Generation Error:', error);
            alert('Не удалось сгенерировать PDF документ.');
        } finally {
            setShowContractNameModal(false);
            setPendingExportEstimate(null);
        }
    }, [pendingExportEstimate]);

    const markDraftEstimatesWithPriceChange = useCallback((params: { materialName?: string; workName?: string }) => {
        const { materialName, workName } = params;
        if (!materialName && !workName) return;

        setEstimates(prevEstimates => {
            return prevEstimates.map(estimate => {
                if (estimate.status !== EstimateStatus.DRAFT) return estimate;
                const hasMatch = estimate.items.some(item => {
                    if (materialName && item.subgroup === EstimateSubgroup.MATERIALS && item.name === materialName) {
                        return true;
                    }
                    if (workName && item.subgroup === EstimateSubgroup.WORKS && item.name === workName) {
                        return true;
                    }
                    return false;
                });
                if (!hasMatch || estimate.needsPriceUpdate) return estimate;
                return { ...estimate, needsPriceUpdate: true };
            });
        });
    }, []);

    // Allow services to upsert materials and notify UI without prop plumbing
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const normalize = (s: string) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

        const handler = (ev: any) => {
            const upserts: Material[] = Array.isArray(ev?.detail) ? ev.detail : [];
            if (!upserts.length) return;

            setMaterials(prev => {
                const next = [...prev];
                for (const up of upserts) {
                    if (!up) continue;
                    const idx = next.findIndex(m => m.id === up.id || normalize(m.name) === normalize(up.name));
                    if (idx >= 0) next[idx] = { ...next[idx], ...up };
                    else next.push(up);
                }
                return next;
            });

            for (const up of upserts) {
                if (up?.name && typeof up.price === 'number' && Number.isFinite(up.price)) {
                    markDraftEstimatesWithPriceChange({ materialName: up.name });
                }
            }
        };

        window.addEventListener('kmobn:materials-upsert', handler as any);
        return () => window.removeEventListener('kmobn:materials-upsert', handler as any);
    }, [markDraftEstimatesWithPriceChange]);

    const handleAddMaterial = useCallback(async (
        name: string,
        category: EstimateCategory,
        price?: number,
        link?: string
    ) => {
        if (!canCreateMaterial(subscriptionUsage, subscriptionLimits)) {
            openAccessModal('Лимит материалов исчерпан', 'Перейдите на платный план, чтобы добавлять больше материалов.');
            return;
        }
        const newMaterial: Material = {
            id: `material-${Date.now()}`,
            name,
            price: price || 0,
            lastUpdated: new Date().toISOString(),
            category,
            isManualPrice: true,
            link,
        };
        try {
            await addMaterial(newMaterial);
            setMaterials(prev => [...prev, newMaterial]);
        } catch (error) {
            console.error('Failed to add material:', error);
            alert('Не удалось добавить материал.');
        }
    }, [subscriptionUsage, subscriptionLimits, openAccessModal]);

    const handleEditMaterialPrice = useCallback(async (materialId: string, newPrice: number) => {
        const material = materials.find(m => m.id === materialId);
        if (!material) return;

        const updatedMaterial = { ...material, price: newPrice, isManualPrice: true };
        try {
            await updateMaterial(updatedMaterial);
            setMaterials(prev => prev.map(m => m.id === materialId ? updatedMaterial : m));
            // Mark draft estimates for price refresh
            markDraftEstimatesWithPriceChange({ materialName: material.name });
        } catch (error) {
            console.error('Failed to update material price:', error);
            alert('Не удалось обновить цену материала.');
        }
    }, [materials, markDraftEstimatesWithPriceChange]);

    const handleEditMaterialLink = useCallback(async (materialId: string, link?: string) => {
        const material = materials.find(m => m.id === materialId);
        if (!material) return;

        const nextLink = link ? link.trim() : '';
        const updatedMaterial = { ...material, link: nextLink || undefined };
        try {
            await updateMaterial(updatedMaterial);
            setMaterials(prev => prev.map(m => m.id === materialId ? updatedMaterial : m));
        } catch (error) {
            console.error('Failed to update material link:', error);
            alert('Не удалось обновить ссылку материала.');
        }
    }, [materials]);

    const handleDeleteMaterial = useCallback(async (materialId: string) => {
        if (window.confirm('Вы уверены, что хотите удалить этот материал?')) {
            try {
                await deleteMaterial(materialId);
                setMaterials(prev => prev.filter(m => m.id !== materialId));
            } catch (error) {
                console.error('Failed to delete material:', error);
                alert('Не удалось удалить материал.');
            }
        }
    }, []);

    const handleAddWork = useCallback(async (name: string, category: EstimateCategory, price: number) => {
        if (!canCreateWork(subscriptionUsage, subscriptionLimits)) {
            openAccessModal('Лимит работ исчерпан', 'Перейдите на платный план, чтобы добавлять больше работ.');
            return;
        }
        const newWork: Work = {
            id: `work-${Date.now()}`,
            name,
            price,
            category,
        };
        try {
            await addWork(newWork);
            setWorks(prev => [...prev, newWork]);
        } catch (error) {
            console.error('Failed to add work:', error);
            alert('Не удалось добавить работу.');
        }
    }, [subscriptionUsage, subscriptionLimits, openAccessModal]);

    const handleUpdateWork = useCallback(async (work: Work) => {
        try {
            await updateWork(work);
            setWorks(prev => prev.map(w => w.id === work.id ? work : w));
            markDraftEstimatesWithPriceChange({ workName: work.name });
        } catch (error) {
            console.error('Failed to update work:', error);
            alert('Не удалось обновить работу.');
        }
    }, [markDraftEstimatesWithPriceChange]);

    const handleDeleteWork = useCallback(async (workId: string) => {
        if (window.confirm('Вы уверены, что хотите удалить эту работу?')) {
            try {
                await deleteWork(workId);
                setWorks(prev => prev.filter(w => w.id !== workId));
            } catch (error) {
                console.error('Failed to delete work:', error);
                alert('Не удалось удалить работу.');
            }
        }
    }, []);

    const handleAddBundle = useCallback(async (bundle: WorkBundle) => {
        if (!canCreateBundle(subscriptionUsage, subscriptionLimits)) {
            openAccessModal('Лимит комплектов исчерпан', 'Перейдите на платный план, чтобы создавать больше комплектов.');
            return;
        }
        try {
            await addBundle(bundle);
            setBundles(prev => [...prev, bundle]);
        } catch (error) {
            console.error('Failed to add bundle:', error);
            alert('Не удалось добавить комплект.');
        }
    }, [subscriptionUsage, subscriptionLimits, openAccessModal]);

    const handleUpdateBundle = useCallback(async (bundle: WorkBundle) => {
        try {
            await updateBundle(bundle);
            setBundles(prev => prev.map(b => b.id === bundle.id ? bundle : b));
        } catch (error) {
            console.error('Failed to update bundle:', error);
            alert('Не удалось обновить комплект.');
        }
    }, []);

    const handleDeleteBundle = useCallback(async (bundleId: string) => {
        if (window.confirm('Вы уверены, что хотите удалить этот комплект?')) {
            try {
                await deleteBundle(bundleId);
                setBundles(prev => prev.filter(b => b.id !== bundleId));
            } catch (error) {
                console.error('Failed to delete bundle:', error);
                alert('Не удалось удалить комплект.');
            }
        }
    }, []);

    const handleStartPayment = useCallback(async (tier: SubscriptionTier) => {
        if (!supabaseUser) {
            showToast('Для оплаты нужна авторизация.', 'info');
            return;
        }
        if (tier === 'free') return;

        setPaymentLoading(true);
        try {
            const redirectBase = window.location.origin;
            const { paymentUrl } = await createPayment({
                tier,
                userId: supabaseUser.id,
                successUrl: redirectBase,
                cancelUrl: redirectBase,
            });
            try {
                const a = document.createElement('a');
                a.href = paymentUrl;
                a.target = '_blank';
                a.rel = 'noopener noreferrer';
                // some browsers require the element to be in DOM
                document.body.appendChild(a);
                a.click();
                a.remove();
            } catch {
                window.location.href = paymentUrl;
            }
        } catch (error) {
            console.error('Failed to start payment:', error);
            const errorMessage = error instanceof Error ? error.message : '';
            const errorCode = error instanceof Error ? (error as Error & { code?: string }).code : undefined;
            const isInvalidKey = errorCode === 'INVALID_API_KEY' || /invalid api key/i.test(errorMessage);
            const isMissingKey = /NOWPAYMENTS_API_KEY is missing/i.test(errorMessage);
            const isCurrencyUnavailable = errorCode === 'CURRENCY_UNAVAILABLE' || /currency.*unavailable/i.test(errorMessage);
            const isAmountMinimal = errorCode === 'AMOUNT_MINIMAL_ERROR' || /less than minimal|minimal/i.test(errorMessage);
            if (isInvalidKey) {
                showToast('Платёжный ключ недействителен. Проверьте NOWPAYMENTS_API_KEY.', 'error', 6000);
            } else if (isMissingKey) {
                showToast('Платёжный сервис не настроен: отсутствует NOWPAYMENTS_API_KEY.', 'error', 6000);
            } else if (isCurrencyUnavailable) {
                showToast('USDT временно недоступен. Попробуйте ещё раз чуть позже.', 'error', 6000);
            } else if (isAmountMinimal) {
                showToast('Сумма меньше минимальной для выбранной сети. Попробуйте ещё раз.', 'error', 6000);
            } else {
                showToast('Не удалось создать платёж. Попробуйте позже.', 'error');
            }
        } finally {
            setPaymentLoading(false);
        }
    }, [showToast, supabaseUser]);

    const estimateContextValue = useMemo(() => ({
        view,
        setView,
        estimates: visibleSubscriptionData.estimates,
        allEstimates: estimates,
        setEstimates,
        templates,
        setTemplates,
        currentEstimate,
        setCurrentEstimate,
        validationResult: editorValidationResult,
        actions: {
            onCreateNew: handleCreateNew,
            onEdit: handleEdit,
            onDelete: handleDeleteEstimate,
            onDeleteVersion: handleDeleteEstimateVersion,
            onGeneratePdf: handleGeneratePdf,
            onRequestSave: handleSaveRequest,
            onDraftChange: handleDraftChange,
            onDirtyChange: handleDirtyChange,
            onSaveAsTemplate: handleSaveAsTemplate,
            onDeleteTemplate: handleDeleteTemplate,
            onBack: handleBackToHistory,
        },
    }), [
        view,
        visibleSubscriptionData.estimates,
        estimates,
        templates,
        currentEstimate,
        editorValidationResult,
        handleCreateNew,
        handleEdit,
        handleDeleteEstimate,
        handleDeleteEstimateVersion,
        handleGeneratePdf,
        handleSaveRequest,
        handleDraftChange,
        handleDirtyChange,
        handleSaveAsTemplate,
        handleDeleteTemplate,
        handleBackToHistory,
    ]);

    const catalogContextValue = useMemo(() => ({
        materials: visibleSubscriptionData.materials,
        works: visibleSubscriptionData.works,
        bundles: visibleSubscriptionData.bundles,
        onAddMaterial: handleAddMaterial,
        onEditMaterialPrice: handleEditMaterialPrice,
        onEditMaterialLink: handleEditMaterialLink,
        onDeleteMaterial: handleDeleteMaterial,
        onAddWork: handleAddWork,
        onUpdateWork: handleUpdateWork,
        onDeleteWork: handleDeleteWork,
        onAddBundle: handleAddBundle,
        onUpdateBundle: handleUpdateBundle,
        onDeleteBundle: handleDeleteBundle,
    }), [
        visibleSubscriptionData.materials,
        visibleSubscriptionData.works,
        visibleSubscriptionData.bundles,
        handleAddMaterial,
        handleEditMaterialPrice,
        handleEditMaterialLink,
        handleDeleteMaterial,
        handleAddWork,
        handleUpdateWork,
        handleDeleteWork,
        handleAddBundle,
        handleUpdateBundle,
        handleDeleteBundle,
    ]);

    const subscriptionContextValue = useMemo(() => ({
        subscription,
        subscriptionLoading,
        paymentLoading,
        subscriptionTier,
        subscriptionLimits,
        subscriptionUsage,
        headerSubscriptionSummary,
        aiAccess,
        onStartPayment: handleStartPayment,
    }), [
        subscription,
        subscriptionLoading,
        paymentLoading,
        subscriptionTier,
        subscriptionLimits,
        subscriptionUsage,
        headerSubscriptionSummary,
        aiAccess,
        handleStartPayment,
    ]);

    const syncContextValue = useMemo(() => ({
        sync,
        setSync,
        isSaving,
        lastSaved,
        saveError,
        showToast,
    }), [sync, isSaving, lastSaved, saveError, showToast]);

    const passwordRecoveryModal = showPasswordRecoveryModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
            <div className="w-full max-w-md rounded-lg bg-surface p-6 shadow-2xl">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-text-primary">Новый пароль</h2>
                    <button
                        type="button"
                        onClick={() => setShowPasswordRecoveryModal(false)}
                        className="text-text-secondary hover:text-text-primary"
                    >
                        ×
                    </button>
                </div>
                <div className="mt-4">
                    <label className="block text-sm text-text-secondary">Новый пароль</label>
                    <input
                        type="password"
                        value={recoveryPassword}
                        onChange={(e) => setRecoveryPassword(e.target.value)}
                        className="mt-1 w-full rounded-md bg-background border border-border px-3 py-2 text-text-primary"
                        autoComplete="new-password"
                    />
                </div>
                <div className="mt-6 flex gap-2">
                    <button
                        type="button"
                        onClick={handleUpdatePassword}
                        disabled={recoverySubmitting}
                        className="flex-1 rounded-md bg-primary px-4 py-2 text-text-primary font-medium disabled:opacity-60 hover:bg-primary-hover"
                    >
                        {recoverySubmitting ? 'Сохраняю…' : 'Сохранить'}
                    </button>
                    <button
                        type="button"
                        onClick={() => setShowPasswordRecoveryModal(false)}
                        className="flex-1 rounded-md border border-border bg-background px-4 py-2 text-text-primary font-medium hover:bg-surface"
                    >
                        Отмена
                    </button>
                </div>
            </div>
        </div>
    ) : null;

    if (!isAuthenticated) {
        return (
            <div className="min-h-screen bg-background text-text-primary">
                <LandingPage onOpenLogin={() => setShowLoginModal(true)} />
                {showLoginModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" role="dialog" aria-modal="true">
                        <div className="relative w-full max-w-md">
                            <button
                                type="button"
                                onClick={() => setShowLoginModal(false)}
                                aria-label="Закрыть окно входа"
                                className="absolute -top-4 -right-4 bg-surface rounded-full w-8 h-8 flex items-center justify-center text-text-secondary hover:text-text-primary border border-border"
                            >
                                ×
                            </button>
                            <Login
                                onLogin={handleLogin}
                                onGoogleLogin={handleGoogleLogin}
                                onEmailLogin={handleEmailLogin}
                                onEmailSignup={handleEmailSignup}
                                onResetPassword={handleResetPassword}
                                useSupabaseAuth={useSupabaseAuth}
                            />
                        </div>
                    </div>
                )}
                {passwordRecoveryModal}
            </div>
        );
    }

    return (
        <SubscriptionProvider value={subscriptionContextValue}>
            <CatalogProvider value={catalogContextValue}>
                <EstimateProvider value={estimateContextValue}>
                    <SyncProvider value={syncContextValue}>
                        <div className="min-h-screen bg-background text-text-primary">
            <Header
                currentView={view}
                onViewChange={handleNavigationAttempt}
                userName={displayName}
                onLogout={handleLogout}
                onUserNameClick={handleOpenPasswordChange}
                subscriptionSummary={headerSubscriptionSummary}
                onUpgradeClick={handleUpgradeClick}
            />
            <main className="p-3 sm:p-4 md:p-6 max-w-8xl mx-auto">
                {isLoading ? (
                    <AppLoadingSkeleton />
                ) : (
                    <Suspense fallback={<AppLoadingSkeleton />}>
                        {view === View.HISTORY && (
                            <EstimateHistory />
                        )}
                        {view === View.EDITOR && (
                            <EstimateEditor
                                onUpgradeRequest={handleUpgradeClick}
                            />
                        )}
                        {view === View.PRICES && (
                            <Prices />
                        )}
                        {view === View.WORKS && (
                            <Works />
                        )}
                        {view === View.BUNDLES && (
                            <Bundles />
                        )}
                        {view === View.SUBSCRIPTIONS && (
                            <Subscriptions />
                        )}
                        {view === View.SALARY_CALCULATOR && (
                            <SalaryCalculator
                                estimates={visibleSubscriptionData.estimates}
                            />
                        )}
                        {view === View.ANALYTICS && (
                            <Analytics
                                estimates={visibleSubscriptionData.estimates}
                                isLoading={isLoading}
                            />
                        )}
                        {view === View.WIKI && (
                            <Suspense fallback={<WikiSkeleton />}>
                                <Wiki />
                            </Suspense>
                        )}
                    </Suspense>
                )}
            </main>
            {showSaveOptions && (
                <div
                    className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
                    role="dialog"
                    aria-modal="true"
                    onKeyDown={handleSaveOptionsKeyDown}
                >
                    <FocusLock returnFocus>
                        <div className="bg-surface p-6 rounded-xl shadow-2xl w-full max-w-md">
                            <h3 className="text-xl font-semibold mb-3">Сохранить изменения</h3>
                            <p className="text-sm text-text-secondary mb-5">Выберите, хотите ли вы обновить текущую версию сметы или создать новую.</p>
                            <div className="flex flex-col gap-3">
                                <button
                                    onClick={() => handleConfirmSave('overwrite')}
                                    className="w-full bg-primary text-white py-2 rounded-md font-semibold"
                                >
                                    Сохранить в текущую версию
                                </button>
                                <button
                                    onClick={() => handleConfirmSave('new')}
                                    className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-2 rounded-md font-semibold"
                                >
                                    Создать новую версию
                                </button>
                                <button
                                    onClick={() => setShowSaveOptions(false)}
                                    className="w-full border border-border rounded-md py-2 font-semibold"
                                >
                                    Отменить
                                </button>
                            </div>
                        </div>
                    </FocusLock>
                </div>
            )}
            {showUnsavedModal && (
                <div
                    className="fixed inset-0 bg-black/30 flex items-center justify-center z-40"
                    role="dialog"
                    aria-modal="true"
                    onKeyDown={handleUnsavedKeyDown}
                >
                    <FocusLock returnFocus>
                        <div className="bg-surface p-6 rounded-xl shadow-2xl w-full max-w-sm">
                            <h3 className="text-lg font-semibold mb-2">Несохранённые изменения</h3>
                            <p className="text-sm text-text-secondary mb-4">Вы внесли изменения в смету. Перейти к другой вкладке без сохранения приведёт к потере правок.</p>
                            <div className="flex flex-col gap-3">
                                <button
                                    onClick={handleUnsavedSave}
                                    className="w-full bg-primary text-white py-2 rounded-md font-semibold"
                                >
                                    Сохранить изменения и продолжить
                                </button>
                                <button
                                    onClick={handleUnsavedDiscard}
                                    className="w-full bg-red-600 text-white py-2 rounded-md font-semibold"
                                >
                                    Не сохранять и продолжить
                                </button>
                                <button
                                    onClick={() => setShowUnsavedModal(false)}
                                    className="w-full border border-border rounded-md py-2 font-semibold"
                                >
                                    Отмена
                                </button>
                            </div>
                        </div>
                    </FocusLock>
                </div>
            )}
            {showPdfStyleModal && (
                <PdfStyleModal
                    onClose={() => {
                        setShowPdfStyleModal(false);
                        setPendingExportEstimate(null);
                    }}
                    onSelectStyle={handlePdfStyleSelect}
                />
            )}
            {showContractNameModal && pendingExportEstimate && (
                <ContractNameModal
                    onClose={() => {
                        setShowContractNameModal(false);
                        setPendingExportEstimate(null);
                    }}
                    onConfirm={handleContractNameConfirm}
                    defaultContractName={`КМ ${pendingExportEstimate.estimateNumber}`}
                />
            )}
            {accessModal && (
                <SubscriptionGateModal
                    isOpen={Boolean(accessModal)}
                    title={accessModal.title}
                    description={accessModal.description}
                    onClose={closeAccessModal}
                    onConfirm={confirmAccessModal}
                />
            )}
            {passwordRecoveryModal}
            <SyncToast
                visible={sync.visible}
                message={sync.message}
                type={sync.type}
                onClose={() => setSync(s => ({ ...s, visible: false }))}
                saveStatus={isSaving ? 'saving' : saveError ? 'error' : lastSaved ? 'saved' : 'idle'}
                lastSaved={lastSaved}
                saveError={saveError}
            />
            <ScrollToTop />
                        </div>
                    </SyncProvider>
                </EstimateProvider>
            </CatalogProvider>
        </SubscriptionProvider>
    );
};

export default App;