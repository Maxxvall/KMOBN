import React, { useMemo, useState, useCallback, useEffect, useRef, lazy, Suspense } from 'react';
import type { User } from '@supabase/supabase-js';
import { Estimate, View, EstimateStatus, ProjectTemplate, Material, EstimateCategory, Work, EstimateSubgroup, WorkBundle, SubscriptionTier, UserSubscription, SubscriptionLimits, SubscriptionUsage } from './types';
import SyncToast from './components/SyncToast';
import Header from './components/Header';
import EstimateHistory from './components/EstimateHistory';
import EstimateEditor from './components/EstimateEditor';
import Prices from './components/Prices';
import Works from './components/Works';
import Bundles from './components/Bundles';
import SalaryCalculator from './components/SalaryCalculator';
import PdfStyleModal from './components/PdfStyleModal';
import ContractNameModal from './components/ContractNameModal';
import Analytics from './components/Analytics';
import Subscriptions from './components/Subscriptions';
import ScrollToTop from './components/ScrollToTop';
import Login from './components/Login';
import LandingPage from './components/LandingPage.tsx';
import WikiSkeleton from './components/Wiki/WikiSkeleton';
import { generatePdf } from './services/pdfGenerator';
import { generatePdf as generatePdfColored } from './services/pdfGenerator2';
import { generatePdfContract } from './services/pdfContractGenerator';
import { validateEstimate } from './services/estimateValidation';
import { loadEstimates, saveEstimates, loadTemplates, saveTemplates, addTemplate, deleteTemplate, deleteEstimatesByNumber, deleteEstimateById, loadMaterials, saveMaterials, addMaterial, updateMaterial, deleteMaterial, loadWorks, saveWorks, addWork, updateWork, deleteWork, loadBundles, saveBundles, addBundle, updateBundle, deleteBundle } from './services/database';
import type { CacheTableKey } from './services/indexedDbCache';
import supabase, { isSupabaseConfigured } from './services/supabase';
import { useDebouncedSave } from './hooks/useDebouncedSave';
import {
    canCreateBundle,
    canCreateEstimate,
    canCreateMaterial,
    canCreateWork,
    canDeleteEstimate,
    canUseAi,
    canUseAnalytics,
    canUseSalaryCalculator,
    canUseWiki,
    deriveSubscriptionUsage,
    getSubscriptionLimits,
    getUserSubscription,
    incrementAiUsage,
    incrementDeletedEstimates,
    normalizeSubscriptionUsage,
    updateUserSubscription,
} from './services/subscriptionService';
import { createPayment } from './services/paymentService';

const Wiki = lazy(() => import('./components/Wiki'));


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
    const subscriptionUsage: SubscriptionUsage = useMemo(() => {
        return deriveSubscriptionUsage({
            subscription,
            estimates,
            materials,
            works,
            bundles,
        });
    }, [subscription, estimates, materials, works, bundles]);
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

    const [isSaving, setIsSaving] = useState(false);
    const [lastSaved, setLastSaved] = useState<Date | null>(null);
    const [saveError, setSaveError] = useState<string | null>(null);
    const autosaveSuppressedRef = useRef(false);
    const didHydrateRef = useRef(false);
    const saveInFlightRef = useRef(false);
    const saveQueuedRef = useRef(false);
    const savedIndicatorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const hashData = useCallback((data: unknown): string => {
        try {
            return JSON.stringify(data ?? null).length.toString();
        } catch {
            return '0';
        }
    }, []);

    const needsReload = useCallback((key: string, data: unknown): boolean => {
        const currentHash = hashData(data);
        const savedHash = dataHashes[key];
        return savedHash !== currentHash;
    }, [dataHashes, hashData]);

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
    }, [dataHashes, hashData]);

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
    }, [estimates, hashData, loadedFlags.estimates, loadedFlags.templates, templates]);

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
    }, [hashData, loadedFlags.materials]);

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
    }, [hashData, loadedFlags.works]);

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
    }, [hashData, loadedFlags.bundles]);

    useEffect(() => {
        if (loadedFlags.estimates) {
            setDataHashes(prev => ({ ...prev, estimates: hashData(estimates) }));
        }
    }, [estimates, hashData, loadedFlags.estimates]);

    useEffect(() => {
        if (loadedFlags.templates) {
            setDataHashes(prev => ({ ...prev, templates: hashData(templates) }));
        }
    }, [hashData, loadedFlags.templates, templates]);

    useEffect(() => {
        if (loadedFlags.materials) {
            setDataHashes(prev => ({ ...prev, materials: hashData(materials) }));
        }
    }, [hashData, loadedFlags.materials, materials]);

    useEffect(() => {
        if (loadedFlags.works) {
            setDataHashes(prev => ({ ...prev, works: hashData(works) }));
        }
    }, [hashData, loadedFlags.works, works]);

    useEffect(() => {
        if (loadedFlags.bundles) {
            setDataHashes(prev => ({ ...prev, bundles: hashData(bundles) }));
        }
    }, [bundles, hashData, loadedFlags.bundles]);

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
            const tasks: Promise<void>[] = [];
            if (loadedFlags.estimates) tasks.push(saveEstimates(estimates));
            if (loadedFlags.materials) tasks.push(saveMaterials(materials));
            if (loadedFlags.works) tasks.push(saveWorks(works));
            if (loadedFlags.bundles) tasks.push(saveBundles(bundles));
            if (tasks.length) {
                await Promise.all(tasks);
            }
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

    const debouncedSaveAll = useDebouncedSave(saveAllToDatabase, 2000);

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


    const goToView = useCallback((target: View) => {
        setView(target);
        if (target !== View.EDITOR) {
            setCurrentEstimate(null);
        }
    }, [setView, setCurrentEstimate]);

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
            alert('Аналитика доступна только на Premium.');
            goToView(View.SUBSCRIPTIONS);
            return;
        }
        if (target === View.SALARY_CALCULATOR && !canUseSalaryCalculator(subscriptionLimits)) {
            alert('Калькулятор зарплаты доступен на Basic и Premium.');
            goToView(View.SUBSCRIPTIONS);
            return;
        }
        if (target === View.WIKI && !canUseWiki(subscriptionLimits)) {
            showToast('Wiki доступна на Basic и Premium.', 'info');
            goToView(View.SUBSCRIPTIONS);
            return;
        }

        goToView(target);
    }, [view, editorDirty, goToView, subscriptionLimits]);

    const handleCreateNew = () => {
        if (!canCreateEstimate(subscriptionUsage, subscriptionLimits)) {
            alert('Лимит смет исчерпан. Перейдите на платный план для продолжения.');
            goToView(View.SUBSCRIPTIONS);
            return;
        }
        setCurrentEstimate(null);
        setEditorValidationResult(null);
        setEditorDirty(false);
        setEditorDraft(null);
        setPendingView(null);
        setShowSaveOptions(false);
        setShowUnsavedModal(false);
        goToView(View.EDITOR);
    };

    const handleEdit = (estimate: Estimate) => {
        setCurrentEstimate(estimate);
        setEditorValidationResult(null);
        setEditorDirty(false);
        setEditorDraft(null);
        setPendingView(null);
        setShowSaveOptions(false);
        setShowUnsavedModal(false);
        goToView(View.EDITOR);
    };

    const handleBackToHistory = () => {
        handleNavigationAttempt(View.HISTORY);
    };

    const handleSaveEstimate = useCallback((draft: Estimate, saveMode: SaveMode, afterSaveView: View = View.HISTORY) => {
        if (!draft) return;

        const validation = validateEstimate(draft);
        if (validation.issues.length > 0) {
            setEditorValidationResult(validation);
            setShowSaveOptions(false);
            setShowUnsavedModal(false);
            setPendingView(null);
            goToView(View.EDITOR);

            alert(
                `Есть ошибки в смете:\n` +
                `Проблемных строк: ${validation.invalidItemIds.size}. Ошибок: ${validation.issues.length}.\n` +
                `Исправьте перед сохранением.`
            );
            return;
        }

        setEstimates(prevEstimates => {
            const existingIndex = prevEstimates.findIndex(e => e.id === draft.id);
            if (existingIndex !== -1) {
                const existing = prevEstimates[existingIndex];
                if (saveMode === 'overwrite') {
                    const updated = {
                        ...draft,
                        version: existing.version,
                        parentId: existing.parentId,
                        date: new Date().toISOString().split('T')[0],
                    };
                    const updatedEstimates = [...prevEstimates];
                    updatedEstimates[existingIndex] = updated;
                    return updatedEstimates;
                }
                const archivedEstimate = { ...existing, isArchived: true, status: EstimateStatus.ARCHIVED };
                const newVersion: Estimate = {
                    ...draft,
                    id: `sm-id-${Date.now()}`,
                    version: existing.version + 1,
                    parentId: existing.parentId || existing.id,
                    isArchived: false,
                };
                const updatedEstimates = [...prevEstimates];
                updatedEstimates[existingIndex] = archivedEstimate;
                return [...updatedEstimates, newVersion];
            }
            return [...prevEstimates, draft];
        });
        setEditorDirty(false);
        setEditorDraft(null);
        setShowSaveOptions(false);
        setPendingView(null);
        setShowUnsavedModal(false);
        setViewAfterSave(View.HISTORY);
        goToView(afterSaveView);
    }, [goToView, setEstimates]);

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

    const handleDeleteEstimate = useCallback(async (estimateToDelete: Estimate) => {
        if (!canDeleteEstimate(subscriptionUsage, subscriptionLimits)) {
            alert('Удаление смет доступно на платных планах.');
            goToView(View.SUBSCRIPTIONS);
            return;
        }
        if (!window.confirm(`Вы уверены, что хотите удалить смету №${estimateToDelete.estimateNumber} и все ее версии? Это действие необратимо.`)) return;
        const estimateNumberToDelete = estimateToDelete.estimateNumber;
        try {
            // Delete from Supabase first
            await deleteEstimatesByNumber(estimateNumberToDelete);
            // Update local state
            setEstimates(prevEstimates => prevEstimates.filter(e => e.estimateNumber !== estimateNumberToDelete));
            consumeDeleteLimit();
            setSync({ visible: true, message: 'Сметы удалены из БД', type: 'success' });
            setTimeout(() => setSync(s => ({ ...s, visible: false })), 2000);
        } catch (error) {
            console.error('Failed to delete estimates from DB:', error);
            setSync({ visible: true, message: 'Ошибка удаления смет в БД', type: 'error' });
            setTimeout(() => setSync(s => ({ ...s, visible: false })), 4000);
        }
    }, [subscriptionUsage, subscriptionLimits, goToView, consumeDeleteLimit]);

    const handleDeleteEstimateVersion = useCallback(async (estimateToDelete: Estimate) => {
        if (!canDeleteEstimate(subscriptionUsage, subscriptionLimits)) {
            alert('Удаление смет доступно на платных планах.');
            goToView(View.SUBSCRIPTIONS);
            return;
        }
        const estimateNumber = estimateToDelete.estimateNumber;
        const versionHistory = estimates
            .filter(e => e.estimateNumber === estimateNumber)
            .sort((a, b) => b.version - a.version);

        if (versionHistory.length === 0) {
            alert('Версия не найдена. Обновите список и попробуйте снова.');
            return;
        }

        const isOnlyVersion = versionHistory.length === 1;
        const latestVersionId = versionHistory[0].id;
        const isLatest = estimateToDelete.id === latestVersionId;

        let confirmMessage = '';
        if (isOnlyVersion) {
            confirmMessage = `Вы уверены, что хотите удалить смету №${estimateToDelete.estimateNumber} целиком? Это удалит единственную версию и всю цепочку.`;
        } else if (!isLatest) {
            confirmMessage = `Вы удаляете промежуточную версию v${estimateToDelete.version}. Это может нарушить историю изменений. Продолжить?`;
        } else {
            confirmMessage = `Вы уверены, что хотите удалить версию v${estimateToDelete.version} сметы №${estimateToDelete.estimateNumber}?`;
        }

        if (!window.confirm(confirmMessage)) return;

        try {
            if (isOnlyVersion) {
                await deleteEstimatesByNumber(estimateToDelete.estimateNumber);
                setEstimates(prevEstimates => prevEstimates.filter(e => e.estimateNumber !== estimateToDelete.estimateNumber));
                consumeDeleteLimit();
                setSync({ visible: true, message: 'Смета полностью удалена', type: 'success' });
            } else {
                const remainingVersions = versionHistory.filter(e => e.id !== estimateToDelete.id);
                const hasChildren = remainingVersions.some(e => e.parentId === estimateToDelete.id);
                const isRootVersion = !estimateToDelete.parentId || hasChildren;
                const shouldNormalize = remainingVersions.length > 0 && (isRootVersion || isLatest);

                if (shouldNormalize) {
                    const [newRoot] = [...remainingVersions].sort((a, b) => {
                        if (b.version !== a.version) return b.version - a.version;
                        return new Date(b.date).getTime() - new Date(a.date).getTime();
                    });
                    const reparented = remainingVersions.map(e => {
                        const isNewRoot = e.id === newRoot.id;
                        return {
                            ...e,
                            parentId: isNewRoot ? undefined : newRoot.id,
                            isArchived: isNewRoot ? false : true,
                            status: isNewRoot ? e.status : EstimateStatus.ARCHIVED,
                        };
                    });

                    await deleteEstimateById(estimateToDelete.id);
                    await saveEstimates(reparented);

                    setEstimates(prevEstimates => {
                        const updatedById = new Map(reparented.map(e => [e.id, e]));
                        return prevEstimates
                            .filter(e => e.id !== estimateToDelete.id)
                            .map(e => updatedById.get(e.id) ?? e);
                    });
                    consumeDeleteLimit();
                    setSync({ visible: true, message: 'Версия удалена, главная обновлена', type: 'success' });
                } else {
                    await deleteEstimateById(estimateToDelete.id);
                    setEstimates(prevEstimates => prevEstimates.filter(e => e.id !== estimateToDelete.id));
                    consumeDeleteLimit();
                    setSync({ visible: true, message: 'Версия сметы удалена', type: 'success' });
                }
            }
            setTimeout(() => setSync(s => ({ ...s, visible: false })), 2000);
        } catch (error) {
            console.error('Failed to delete estimate version from DB:', error);
            setSync({ visible: true, message: 'Ошибка удаления версии в БД', type: 'error' });
            setTimeout(() => setSync(s => ({ ...s, visible: false })), 4000);
        }
    }, [subscriptionUsage, subscriptionLimits, goToView, estimates, consumeDeleteLimit]);

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
        const validation = validateEstimate(estimate);
        if (validation.issues.length > 0) {
            setEditorValidationResult(validation);
            setCurrentEstimate(estimate);
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

        setPendingExportEstimate(estimate);
        setShowPdfStyleModal(true);
    }, [goToView]);

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

    const handleSaveAsTemplate = useCallback(async (estimate: Estimate) => {
        const templateName = prompt('Введите название шаблона:');
        if (templateName) {
            const newTemplate: ProjectTemplate = {
                id: `template-${Date.now()}`,
                name: templateName,
                baseArea: estimate.area,
                items: estimate.items, // Сохраняем элементы сметы в шаблон
            };
            try {
                await addTemplate(newTemplate);
                setTemplates(prev => [...prev, newTemplate]);
                alert('Шаблон сохранен!');
            } catch (error) {
                console.error('Failed to save template:', error);
                alert('Не удалось сохранить шаблон.');
            }
        }
    }, []);

    const handleDeleteTemplate = useCallback(async (templateId: string) => {
        if (window.confirm('Вы уверены, что хотите удалить этот шаблон?')) {
            try {
                await deleteTemplate(templateId);
                setTemplates(prev => prev.filter(t => t.id !== templateId));
            } catch (error) {
                console.error('Failed to delete template:', error);
                alert('Не удалось удалить шаблон.');
            }
        }
    }, []);

    const updateDraftEstimatesWithNewMaterialPrice = useCallback((materialName: string, newPrice: number) => {
        setEstimates(prevEstimates => {
            return prevEstimates.map(estimate => {
                if (estimate.status !== EstimateStatus.DRAFT) return estimate;
                const updatedItems = estimate.items.map(item => {
                    if (item.name === materialName && item.subgroup === EstimateSubgroup.MATERIALS) {
                        const updatedItem = { ...item, price: newPrice, total: item.quantity * newPrice };
                        return updatedItem;
                    }
                    return item;
                });
                const newTotal = updatedItems.reduce((sum, item) => sum + item.total, 0);
                return { ...estimate, items: updatedItems, total: newTotal };
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
                    updateDraftEstimatesWithNewMaterialPrice(up.name, up.price);
                }
            }
        };

        window.addEventListener('kmobn:materials-upsert', handler as any);
        return () => window.removeEventListener('kmobn:materials-upsert', handler as any);
    }, [updateDraftEstimatesWithNewMaterialPrice]);

    const handleAddMaterial = useCallback(async (
        name: string,
        category: EstimateCategory,
        price?: number,
        link?: string
    ) => {
        if (!canCreateMaterial(subscriptionUsage, subscriptionLimits)) {
            alert('Лимит материалов исчерпан. Перейдите на платный план для продолжения.');
            goToView(View.SUBSCRIPTIONS);
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
    }, [subscriptionUsage, subscriptionLimits, goToView]);

    const handleEditMaterialPrice = useCallback(async (materialId: string, newPrice: number) => {
        const material = materials.find(m => m.id === materialId);
        if (!material) return;

        const updatedMaterial = { ...material, price: newPrice, isManualPrice: true };
        try {
            await updateMaterial(updatedMaterial);
            setMaterials(prev => prev.map(m => m.id === materialId ? updatedMaterial : m));
            // Update prices in draft estimates
            updateDraftEstimatesWithNewMaterialPrice(material.name, newPrice);
        } catch (error) {
            console.error('Failed to update material price:', error);
            alert('Не удалось обновить цену материала.');
        }
    }, [materials]);

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
            alert('Лимит работ исчерпан. Перейдите на платный план для продолжения.');
            goToView(View.SUBSCRIPTIONS);
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
    }, [subscriptionUsage, subscriptionLimits, goToView]);

    const handleUpdateWork = useCallback(async (work: Work) => {
        try {
            await updateWork(work);
            setWorks(prev => prev.map(w => w.id === work.id ? work : w));
        } catch (error) {
            console.error('Failed to update work:', error);
            alert('Не удалось обновить работу.');
        }
    }, []);

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
            alert('Лимит комплектов исчерпан. Перейдите на платный план для продолжения.');
            goToView(View.SUBSCRIPTIONS);
            return;
        }
        try {
            await addBundle(bundle);
            setBundles(prev => [...prev, bundle]);
        } catch (error) {
            console.error('Failed to add bundle:', error);
            alert('Не удалось добавить комплект.');
        }
    }, [subscriptionUsage, subscriptionLimits, goToView]);

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
            window.location.href = paymentUrl;
        } catch (error) {
            console.error('Failed to start payment:', error);
            const errorMessage = error instanceof Error ? error.message : '';
            const errorCode = error instanceof Error ? (error as Error & { code?: string }).code : undefined;
            const isInvalidKey = errorCode === 'INVALID_API_KEY' || /invalid api key/i.test(errorMessage);
            const isMissingKey = /NOWPAYMENTS_API_KEY is missing/i.test(errorMessage);
            if (isInvalidKey) {
                showToast('Платёжный ключ недействителен. Проверьте NOWPAYMENTS_API_KEY.', 'error', 6000);
            } else if (isMissingKey) {
                showToast('Платёжный сервис не настроен: отсутствует NOWPAYMENTS_API_KEY.', 'error', 6000);
            } else {
                showToast('Не удалось создать платёж. Попробуйте позже.', 'error');
            }
        } finally {
            setPaymentLoading(false);
        }
    }, [supabaseUser]);

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
                    <div className="flex justify-center items-center h-64">
                        <div className="text-xl text-text-secondary">Загрузка смет...</div>
                    </div>
                ) : (
                    <>
                        {view === View.HISTORY && (
                            <EstimateHistory
                                estimates={estimates}
                                templates={templates}
                                onCreateNew={handleCreateNew}
                                onEdit={handleEdit}
                                onDelete={handleDeleteEstimate}
                                onDeleteVersion={handleDeleteEstimateVersion}
                                onGeneratePdf={handleGeneratePdf}
                            />
                        )}
                        {view === View.EDITOR && (
                            <EstimateEditor
                                initialEstimate={currentEstimate}
                                templates={templates}
                                validationResult={editorValidationResult}
                                materials={materials}
                                works={works}
                                bundles={bundles}
                                onRequestSave={handleSaveRequest}
                                onDraftChange={handleDraftChange}
                                onDirtyChange={handleDirtyChange}
                                onSaveAsTemplate={handleSaveAsTemplate}
                                onDeleteTemplate={handleDeleteTemplate}
                                onBack={handleBackToHistory}
                                allEstimates={estimates}
                                aiAccess={aiAccess}
                                onUpgradeRequest={handleUpgradeClick}
                            />
                        )}
                        {view === View.PRICES && (
                            <Prices
                                materials={materials}
                                onAddMaterial={handleAddMaterial}
                                onDeleteMaterial={handleDeleteMaterial}
                                onEditMaterialPrice={handleEditMaterialPrice}
                                onEditMaterialLink={handleEditMaterialLink}
                            />
                        )}
                        {view === View.WORKS && (
                            <Works
                                works={works}
                                onAddWork={handleAddWork}
                                onUpdateWork={handleUpdateWork}
                                onDeleteWork={handleDeleteWork}
                            />
                        )}
                        {view === View.BUNDLES && (
                            <Bundles
                                bundles={bundles}
                                works={works}
                                materials={materials}
                                onAddBundle={handleAddBundle}
                                onUpdateBundle={handleUpdateBundle}
                                onDeleteBundle={handleDeleteBundle}
                            />
                        )}
                        {view === View.SUBSCRIPTIONS && (
                            <Subscriptions
                                subscription={subscription}
                                limits={subscriptionLimits}
                                usage={subscriptionUsage}
                                onStartPayment={handleStartPayment}
                                isLoading={subscriptionLoading || paymentLoading}
                            />
                        )}
                        {view === View.SALARY_CALCULATOR && (
                            <SalaryCalculator
                                estimates={estimates}
                            />
                        )}
                        {view === View.ANALYTICS && (
                            <Analytics
                                estimates={estimates}
                                isLoading={isLoading}
                            />
                        )}
                        {view === View.WIKI && (
                            <Suspense fallback={<WikiSkeleton />}>
                                <Wiki />
                            </Suspense>
                        )}
                    </>
                )}
            </main>
            {showSaveOptions && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
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
                </div>
            )}
            {showUnsavedModal && (
                <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-40">
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
    );
};

export default App;