import React, { useMemo, useState, useCallback, useEffect, useRef, lazy, Suspense } from 'react';
import FocusLock from 'react-focus-lock';
import type { User } from '@supabase/supabase-js';
import { Estimate, View, EstimateStatus, ProjectTemplate, Material, EstimateCategory, Work, EstimateSubgroup, WorkBundle, SubscriptionTier, UserSubscription, SubscriptionLimits, SubscriptionUsage, normalizeKey } from './types';
import SyncToast from './components/SyncToast';
import Header from './components/Header';
import StatusIndicators from './components/StatusIndicators';
import PdfStyleModal from './components/PdfStyleModal';
import ContractNameModal from './components/ContractNameModal';
import ScrollToTop from './components/ScrollToTop';
import Login from './components/Login';
import ProfileModal from './components/ProfileModal';
import ErrorBoundary from './components/ErrorBoundary';
import LandingPage from './components/LandingPage.tsx';
import WikiSkeleton from './components/Wiki/WikiSkeleton';
import AppLoadingSkeleton from './components/AppLoadingSkeleton';
import { useOfflineSync } from './hooks/useOfflineSync';
import { generatePdf } from './services/pdfGenerator';
import { generatePdf as generatePdfColored } from './services/pdfGenerator2';
import { generatePdfContract } from './services/pdfContractGenerator';
import { validateEstimate, type EstimateValidationResult } from './services/estimateValidation';
import { hashData } from './services/hashing';
import { EstimateProvider } from './contexts/EstimateContext';
import { CatalogProvider } from './contexts/CatalogContext';
import { SubscriptionProvider } from './contexts/SubscriptionContext';
import { SyncProvider } from './contexts/SyncContext';
import { loadEstimates, saveEstimates, loadTemplates, loadMaterials, saveMaterials, addMaterial, updateMaterial, deleteMaterial, deleteMaterials, loadWorks, saveWorks, addWork, updateWork, deleteWork, deleteWorks, loadBundles, saveBundles, addBundle, updateBundle, deleteBundle } from './services/database';
import type { CacheTableKey } from './services/indexedDbCache';
import supabase, { isSupabaseConfigured } from './services/supabase';
import { useDebouncedSave } from './hooks/useDebouncedSave';
import { useEstimateCrud } from './hooks/useEstimateCrud';
import {
    canCreateBundle,
    canCreateMaterial,
    canCreateWork,
    canUseAi,
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
const OFFLINE_MODE_KEY = 'kmobn:offlineMode';
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
        // Deduplicate entries with the same version number: keep the one with the most recent date
        const deduped: Estimate[] = [];
        const seenVersions = new Map<number, Estimate[]>();
        for (const e of list) {
            const v = typeof e.version === 'number' ? e.version : 0;
            const existing = seenVersions.get(v);
            if (existing) {
                existing.push(e);
            } else {
                seenVersions.set(v, [e]);
            }
        }
        seenVersions.forEach((entries, _v) => {
            if (entries.length === 1) {
                deduped.push(entries[0]);
            } else {
                // Keep the most recent by date, archive the rest
                const sorted = [...entries].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                deduped.push(sorted[0]);
                // Mark extras for removal (will be replaced with duplicates below)
                for (let i = 1; i < sorted.length; i++) {
                    deduped.push({ ...sorted[i], isArchived: true, status: EstimateStatus.ARCHIVED } as Estimate);
                }
            }
        });

        if (deduped.length === 1) {
            const only = deduped[0];
            const fixed = {
                ...only,
                parentId: undefined,
                isArchived: false,
            };
            if (only.parentId || only.isArchived) changed = true;
            normalized.push(fixed);
            return;
        }

        const sorted = [...deduped].sort((a, b) => {
            const vA = typeof a.version === 'number' ? a.version : 0;
            const vB = typeof b.version === 'number' ? b.version : 0;
            if (vB !== vA) return vB - vA;
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
                    // Не трогаем isArchived и status — оставляем оригинальные значения
                };
                if (e.parentId !== latest.id) changed = true;
                normalized.push(fixed);
            }
        });
    });

    return { normalized, changed };
};

type SyncState = { visible: boolean; message: string; type: 'success' | 'error' | 'info' };
type AccessModalState = { title: string; description: string } | null;
type EditorValidationState = ReturnType<typeof validateEstimate> | null;

type UiState = {
    view: View;
    sync: SyncState;
    showPasswordRecoveryModal: boolean;
    showLoginModal: boolean;
    showPdfStyleModal: boolean;
    showContractNameModal: boolean;
    showSaveOptions: boolean;
    showUnsavedModal: boolean;
    pendingView: View | null;
    accessModal: AccessModalState;
};

type AuthState = {
    supabaseUser: User | null;
    subscription: UserSubscription | null;
    subscriptionLoading: boolean;
    paymentLoading: boolean;
    recoveryRequired: boolean;
    recoveryPassword: string;
    recoverySubmitting: boolean;
};

type EditorState = {
    currentEstimate: Estimate | null;
    pendingExportEstimate: Estimate | null;
    editorValidationResult: EditorValidationState;
    editorDirty: boolean;
    editorDraft: Estimate | null;
    viewAfterSave: View;
};

type SaveState = {
    isSaving: boolean;
    lastSaved: Date | null;
    saveError: string | null;
};


const initialSyncState: SyncState = { visible: false, message: '', type: 'info' };

const initialUiState: UiState = {
    view: View.HISTORY,
    sync: initialSyncState,
    showPasswordRecoveryModal: false,
    showLoginModal: false,
    showPdfStyleModal: false,
    showContractNameModal: false,
    showSaveOptions: false,
    showUnsavedModal: false,
    pendingView: null,
    accessModal: null,
};

const initialEditorState: EditorState = {
    currentEstimate: null,
    pendingExportEstimate: null,
    editorValidationResult: null,
    editorDirty: false,
    editorDraft: null,
    viewAfterSave: View.HISTORY,
};

const initialSaveState: SaveState = {
    isSaving: false,
    lastSaved: null,
    saveError: null,
};

const createInitialAuthState = (): AuthState => ({
    supabaseUser: null,
    subscription: null,
    subscriptionLoading: false,
    paymentLoading: false,
    recoveryRequired: (() => {
        try {
            return localStorage.getItem(RECOVERY_STORAGE_KEY) === 'true' || hasRecoveryFlagInUrl();
        } catch {
            return hasRecoveryFlagInUrl();
        }
    })(),
    recoveryPassword: '',
    recoverySubmitting: false,
});

const App: React.FC = () => {
    const useSupabaseAuth = isSupabaseConfigured();
    const [authState, setAuthState] = useState(createInitialAuthState);
    const [uiState, setUiState] = useState(initialUiState);
    const [editorState, setEditorState] = useState(initialEditorState);
    const [saveState, setSaveState] = useState(initialSaveState);
    const [offlineModeRaw, setOfflineModeRaw] = useState(() => {
        try { return localStorage.getItem(OFFLINE_MODE_KEY) === 'true'; } catch { return false; }
    });
    const setOfflineMode = useCallback((value: boolean) => {
        setOfflineModeRaw(value);
        try {
            if (value) {
                localStorage.setItem(OFFLINE_MODE_KEY, 'true');
            } else {
                localStorage.removeItem(OFFLINE_MODE_KEY);
            }
        } catch { /* ignore */ }
    }, []);
    const offlineSync = useOfflineSync();
    const {
        supabaseUser,
        subscription,
        subscriptionLoading,
        paymentLoading,
        recoveryRequired,
        recoveryPassword,
        recoverySubmitting,
    } = authState;
    const {
        view,
        sync,
        showPasswordRecoveryModal,
        showLoginModal,
        showPdfStyleModal,
        showContractNameModal,
        showSaveOptions,
        showUnsavedModal,
        pendingView,
    } = uiState;
    const {
        currentEstimate,
        pendingExportEstimate,
        editorValidationResult,
        editorDirty,
        editorDraft,
        viewAfterSave,
    } = editorState;
    const {
        isSaving,
        lastSaved,
        saveError,
    } = saveState;
    const setSupabaseUser = useCallback((v: React.SetStateAction<User | null>) => setAuthState(p => ({ ...p, supabaseUser: typeof v === 'function' ? (v as (prev: User | null) => User | null)(p.supabaseUser) : v })), []);
    const setSubscription = useCallback((v: React.SetStateAction<UserSubscription | null>) => setAuthState(p => ({ ...p, subscription: typeof v === 'function' ? (v as (prev: UserSubscription | null) => UserSubscription | null)(p.subscription) : v })), []);
    const setSubscriptionLoading = useCallback((v: React.SetStateAction<boolean>) => setAuthState(p => ({ ...p, subscriptionLoading: typeof v === 'function' ? (v as (prev: boolean) => boolean)(p.subscriptionLoading) : v })), []);
    const setPaymentLoading = useCallback((v: React.SetStateAction<boolean>) => setAuthState(p => ({ ...p, paymentLoading: typeof v === 'function' ? (v as (prev: boolean) => boolean)(p.paymentLoading) : v })), []);
    const setRecoveryRequired = useCallback((v: React.SetStateAction<boolean>) => setAuthState(p => ({ ...p, recoveryRequired: typeof v === 'function' ? (v as (prev: boolean) => boolean)(p.recoveryRequired) : v })), []);
    const setRecoveryPassword = useCallback((v: React.SetStateAction<string>) => setAuthState(p => ({ ...p, recoveryPassword: typeof v === 'function' ? (v as (prev: string) => string)(p.recoveryPassword) : v })), []);
    const setRecoverySubmitting = useCallback((v: React.SetStateAction<boolean>) => setAuthState(p => ({ ...p, recoverySubmitting: typeof v === 'function' ? (v as (prev: boolean) => boolean)(p.recoverySubmitting) : v })), []);
    const setView = useCallback((v: React.SetStateAction<View>) => setUiState(p => ({ ...p, view: typeof v === 'function' ? (v as (prev: View) => View)(p.view) : v })), []);
    const setSync = useCallback((v: React.SetStateAction<SyncState>) => setUiState(p => ({ ...p, sync: typeof v === 'function' ? (v as (prev: SyncState) => SyncState)(p.sync) : v })), []);
    const setShowPasswordRecoveryModal = useCallback((v: React.SetStateAction<boolean>) => setUiState(p => ({ ...p, showPasswordRecoveryModal: typeof v === 'function' ? (v as (prev: boolean) => boolean)(p.showPasswordRecoveryModal) : v })), []);
    const setShowLoginModal = useCallback((v: React.SetStateAction<boolean>) => setUiState(p => ({ ...p, showLoginModal: typeof v === 'function' ? (v as (prev: boolean) => boolean)(p.showLoginModal) : v })), []);
    const setShowPdfStyleModal = useCallback((v: React.SetStateAction<boolean>) => setUiState(p => ({ ...p, showPdfStyleModal: typeof v === 'function' ? (v as (prev: boolean) => boolean)(p.showPdfStyleModal) : v })), []);
    const setShowContractNameModal = useCallback((v: React.SetStateAction<boolean>) => setUiState(p => ({ ...p, showContractNameModal: typeof v === 'function' ? (v as (prev: boolean) => boolean)(p.showContractNameModal) : v })), []);
    const setShowSaveOptions = useCallback((v: React.SetStateAction<boolean>) => setUiState(p => ({ ...p, showSaveOptions: typeof v === 'function' ? (v as (prev: boolean) => boolean)(p.showSaveOptions) : v })), []);
    const setShowUnsavedModal = useCallback((v: React.SetStateAction<boolean>) => setUiState(p => ({ ...p, showUnsavedModal: typeof v === 'function' ? (v as (prev: boolean) => boolean)(p.showUnsavedModal) : v })), []);
    const setPendingView = useCallback((v: React.SetStateAction<View | null>) => setUiState(p => ({ ...p, pendingView: typeof v === 'function' ? (v as (prev: View | null) => View | null)(p.pendingView) : v })), []);
    const setCurrentEstimate = useCallback((v: React.SetStateAction<Estimate | null>) => setEditorState(p => ({ ...p, currentEstimate: typeof v === 'function' ? (v as (prev: Estimate | null) => Estimate | null)(p.currentEstimate) : v })), []);
    const setPendingExportEstimate = useCallback((v: React.SetStateAction<Estimate | null>) => setEditorState(p => ({ ...p, pendingExportEstimate: typeof v === 'function' ? (v as (prev: Estimate | null) => Estimate | null)(p.pendingExportEstimate) : v })), []);
    const setEditorValidationResult = useCallback((v: React.SetStateAction<EstimateValidationResult | null>) => setEditorState(p => ({ ...p, editorValidationResult: typeof v === 'function' ? (v as (prev: EstimateValidationResult | null) => EstimateValidationResult | null)(p.editorValidationResult) : v })), []);
    const setEditorDirty = useCallback((v: React.SetStateAction<boolean>) => setEditorState(p => ({ ...p, editorDirty: typeof v === 'function' ? (v as (prev: boolean) => boolean)(p.editorDirty) : v })), []);
    const setEditorDraft = useCallback((v: React.SetStateAction<Estimate | null>) => setEditorState(p => ({ ...p, editorDraft: typeof v === 'function' ? (v as (prev: Estimate | null) => Estimate | null)(p.editorDraft) : v })), []);
    const setViewAfterSave = useCallback((v: React.SetStateAction<View>) => setEditorState(p => ({ ...p, viewAfterSave: typeof v === 'function' ? (v as (prev: View) => View)(p.viewAfterSave) : v })), []);
    const setIsSaving = useCallback((v: React.SetStateAction<boolean>) => setSaveState(p => ({ ...p, isSaving: typeof v === 'function' ? (v as (prev: boolean) => boolean)(p.isSaving) : v })), []);
    const setLastSaved = useCallback((v: React.SetStateAction<Date | null>) => setSaveState(p => ({ ...p, lastSaved: typeof v === 'function' ? (v as (prev: Date | null) => Date | null)(p.lastSaved) : v })), []);
    const setSaveError = useCallback((v: React.SetStateAction<string | null>) => setSaveState(p => ({ ...p, saveError: typeof v === 'function' ? (v as (prev: string | null) => string | null)(p.saveError) : v })), []);
    const recoveryIntent = recoveryRequired || hasRecoveryFlagInUrl();
    const isAuthenticated = useMemo(() => {
        return (Boolean(supabaseUser) || offlineModeRaw) && !recoveryIntent;
    }, [supabaseUser, offlineModeRaw, recoveryIntent]);
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
    const [estimates, setEstimates] = useState<Estimate[]>([]);
    const [templates, setTemplates] = useState<ProjectTemplate[]>([]);
    const [materials, setMaterials] = useState<Material[]>([]);
    const [works, setWorks] = useState<Work[]>([]);
    const [bundles, setBundles] = useState<WorkBundle[]>([]);
    const subscriptionTier: SubscriptionTier = subscriptionLoading
        ? (subscription?.subscription_tier ?? 'premium') // Don't downgrade during loading
        : (subscription?.subscription_tier ?? 'free');
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
    const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
    const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

    const needsReload = useCallback((key: string, data: unknown): boolean => {
        const currentHash = hashData(data);
        const savedHash = dataHashes[key];
        return savedHash !== currentHash;
    }, [dataHashes]);

    const handleCacheUpdate = useCallback((detail: { key: CacheTableKey; data: unknown[] }) => {
        const nextHash = hashData(detail.data);
        if (dataHashes[detail.key] === nextHash) return;

        if (detail.key === 'estimates') {
            if (saveInFlightRef.current) return;
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

        const setterMap: Record<string, [React.Dispatch<React.SetStateAction<unknown>>, string]> = {
            templates: [setTemplates as React.Dispatch<React.SetStateAction<unknown>>, 'templates'],
            materials: [setMaterials as React.Dispatch<React.SetStateAction<unknown>>, 'materials'],
            works: [setWorks as React.Dispatch<React.SetStateAction<unknown>>, 'works'],
            bundles: [setBundles as React.Dispatch<React.SetStateAction<unknown>>, 'bundles'],
        };
        const entry = setterMap[detail.key];
        if (entry) {
            const [setter, flag] = entry;
            setter(detail.data);
            setLoadedFlags(prev => ({ ...prev, [flag]: true }));
            setDataHashes(prev => ({ ...prev, [flag]: hashData(detail.data) }));
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

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const handler = () => {
            setLoadedFlags({ estimates: false, templates: false, materials: false, works: false, bundles: false });
            setWikiLoaded(false);
        };
        window.addEventListener('kmobn:data-imported', handler);
        return () => window.removeEventListener('kmobn:data-imported', handler);
    }, []);


    useEffect(() => {
        if (!supabaseUser) {
            setSubscription(null);
            setSubscriptionLoading(false);
            return;
        }

        let isMounted = true;
        setSubscriptionLoading(true);

        const loadSubscription = async (retries = 2) => {
            try {
                const data = await getUserSubscription(supabaseUser.id);
                if (!isMounted) return;
                if (!data && retries > 0) {
                    // Retry after a short delay if no data returned
                    setTimeout(() => {
                        if (isMounted) void loadSubscription(retries - 1);
                    }, 2000);
                    return;
                }
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
            } catch (err) {
                console.error('Failed to load subscription:', err);
                if (retries > 0) {
                    setTimeout(() => {
                        if (isMounted) void loadSubscription(retries - 1);
                    }, 2000);
                } else {
                    if (!isMounted) return;
                    // Keep subscriptionLoading true — we use premium fallback during loading
                }
            }
        };

        void loadSubscription();

        // Periodic refresh every 60 seconds to pick up webhook updates
        const pollInterval = setInterval(() => {
            if (isMounted) void loadSubscription(0);
        }, 60_000);

        return () => {
            isMounted = false;
            clearInterval(pollInterval);
        };
    }, [supabaseUser, setSubscription, setSubscriptionLoading]);

    const handleGoogleLogin = useCallback(async () => {
        if (!supabase) {
            throw new Error('Supabase не настроен для входа через Google');
        }
        if (!navigator.onLine) {
            throw new Error('Для входа через Google нужен интернет');
        }

        const isElectron = !!window.electronAPI?.isElectron;
        const redirectTo = isElectron
            ? 'karkasmaster://auth-callback'
            : (import.meta.env.VITE_AUTH_REDIRECT_URL as string) ||
              (import.meta.env.VITE_SITE_URL as string) ||
              window.location.origin;

        const { data, error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo,
                skipBrowserRedirect: isElectron,
            },
        });
        if (error) {
            throw new Error(error.message);
        }
        if (isElectron && data?.url) {
            await window.electronAPI.openExternal(data.url);
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
    }, [setShowPasswordRecoveryModal]);

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
    }, [setRecoveryRequired, setSupabaseUser]);

    useEffect(() => {
        const sb = supabase;
        if (!sb || !useSupabaseAuth) return;

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
            try {
                const { data, error } = await sb.auth.getSession();
                if (error) {
                    console.error('Supabase getSession error:', error);
                    throw error;
                }
                if (!isMounted) return;
                setSupabaseUser(data.session?.user ?? null);
                if (data.session?.user) {
                    setOfflineMode(false);
                } else {
                    clearRecoveryRequired();
                    // No session — check if we should enter offline mode
                    if (!navigator.onLine || localStorage.getItem(OFFLINE_MODE_KEY) === 'true') {
                        setOfflineMode(true);
                    }
                }
                if (data.session?.user && hasRecoveryFlagInUrl()) {
                    setShowPasswordRecoveryModal(true);
                    markRecoveryRequired();
                    clearRecoveryFlag();
                }
                return;
            } catch {
                // Offline or network error — try reading cached session from localStorage
                try {
                    let cachedUser = null;
                    for (let i = 0; i < localStorage.length; i++) {
                        const key = localStorage.key(i);
                        if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
                            const raw = localStorage.getItem(key);
                            if (raw) {
                                const parsed = JSON.parse(raw);
                                const session = parsed?.current_session || parsed?.session;
                                if (session?.user) {
                                    cachedUser = session.user;
                                    break;
                                }
                            }
                        }
                    }
                    if (cachedUser) {
                        if (!isMounted) return;
                        setSupabaseUser(cachedUser);
                        setOfflineMode(true);
                        return;
                    }
                } catch {
                    // ignore localStorage errors
                }
            }
            if (!isMounted) return;
            setSupabaseUser(null);
            // Restore offlineMode from localStorage if offline or was previously in offline mode
            if (!navigator.onLine || localStorage.getItem(OFFLINE_MODE_KEY) === 'true') {
                setOfflineMode(true);
            } else {
                setOfflineMode(false);
            }
        };

        void initSession();

        const { data } = sb.auth.onAuthStateChange((event, session) => {
            setSupabaseUser(session?.user ?? null);
            setOfflineMode(false);
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
    }, [useSupabaseAuth, setRecoveryRequired, setShowPasswordRecoveryModal, setSupabaseUser, setOfflineMode]);

    // Handle OAuth callback from custom protocol (Electron)
    useEffect(() => {
        if (!window.electronAPI?.onAuthCallback || !supabase) return;
        const handler = (url: string) => {
            try {
                const parsedUrl = new URL(url);
                const code = parsedUrl.searchParams.get('code');
                if (code) {
                    supabase.auth.exchangeCodeForSession(code).then(({ data, error }) => {
                        if (error) {
                            console.error('OAuth exchange error:', error);
                        } else if (data?.user) {
                            setSupabaseUser(data.user);
                            setOfflineMode(false);
                        }
                    });
                }
            } catch (e) {
                console.error('OAuth callback parse error:', e);
            }
        };
        window.electronAPI.onAuthCallback(handler);
    }, [useSupabaseAuth, setSupabaseUser, setOfflineMode]);

    useEffect(() => {
        if (recoveryIntent) {
            setShowPasswordRecoveryModal(true);
        }
    }, [recoveryIntent, setShowPasswordRecoveryModal]);

    // Track app usage time
    useEffect(() => {
        localStorage.setItem('kmobn:appStartTime', String(Date.now()));

        const saveTime = () => {
            const start = parseInt(localStorage.getItem('kmobn:appStartTime') || '0', 10);
            if (start > 0) {
                const sessionMinutes = Math.floor((Date.now() - start) / 60000);
                if (sessionMinutes >= 1) {
                    const currentSavedTotal = parseInt(localStorage.getItem('kmobn:totalTimeSpent') || '0', 10);
                    localStorage.setItem('kmobn:totalTimeSpent', String(currentSavedTotal + sessionMinutes));
                    localStorage.setItem('kmobn:appStartTime', String(Date.now()));
                }
            }
        };

        const interval = setInterval(saveTime, 30000);
        const handleVisibility = () => {
            if (document.visibilityState === 'hidden') saveTime();
        };
        document.addEventListener('visibilitychange', handleVisibility);

        return () => {
            clearInterval(interval);
            document.removeEventListener('visibilitychange', handleVisibility);
            saveTime();
        };
    }, []);

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
    }, [recoveryPassword, setRecoveryPassword, setRecoveryRequired, setRecoverySubmitting, setShowPasswordRecoveryModal, setSync]);

    // Show toast after successful offline sync
    useEffect(() => {
        if (offlineSync.syncedCount > 0) {
            setSync({ visible: true, message: `Данные синхронизированы (${offlineSync.syncedCount})`, type: 'success' });
            const timer = setTimeout(() => setSync(s => ({ ...s, visible: false })), 4000);
            return () => clearTimeout(timer);
        }
    }, [offlineSync.syncedCount, setSync]);

    // Reset loadedFlags after sync so data is re-fetched from Supabase/cache
    useEffect(() => {
        if (offlineSync.syncedTables.length > 0) {
            setLoadedFlags(prev => {
                const next = { ...prev };
                for (const table of offlineSync.syncedTables) {
                    if (table in next) {
                        (next as any)[table] = false;
                    }
                }
                return next;
            });
        }
    }, [offlineSync.syncedTables]);

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
    }, [estimates, loadedFlags.estimates, loadedFlags.templates, setSync, templates]);

    const loadMaterialsData = useCallback(async () => {
        if (loadedFlags.materials) return;
        try {
            const loaded = await loadMaterials({ limit: subscriptionLimits.materials.max ?? undefined });
            setMaterials(loaded || []);
            setLoadedFlags(prev => ({ ...prev, materials: true }));
            setDataHashes(prev => ({ ...prev, materials: hashData(loaded || []) }));
        } catch (error) {
            console.error('Failed to load materials:', error);
            setMaterials([]);
        }
    }, [loadedFlags.materials, subscriptionLimits.materials.max]);

    const loadWorksData = useCallback(async () => {
        if (loadedFlags.works) return;
        try {
            const loaded = await loadWorks({ limit: subscriptionLimits.works.max ?? undefined });
            setWorks(loaded || []);
            setLoadedFlags(prev => ({ ...prev, works: true }));
            setDataHashes(prev => ({ ...prev, works: hashData(loaded || []) }));
        } catch (error) {
            console.error('Failed to load works:', error);
            setWorks([]);
        }
    }, [loadedFlags.works, subscriptionLimits.works.max]);

    const loadBundlesData = useCallback(async () => {
        if (loadedFlags.bundles) return;
        try {
            const loaded = await loadBundles({ limit: subscriptionLimits.bundles.max ?? undefined });
            setBundles(loaded || []);
            setLoadedFlags(prev => ({ ...prev, bundles: true }));
            setDataHashes(prev => ({ ...prev, bundles: hashData(loaded || []) }));
        } catch (error) {
            console.error('Failed to load bundles:', error);
            setBundles([]);
        }
    }, [loadedFlags.bundles, subscriptionLimits.bundles.max]);

    useEffect(() => {
        setLoadedFlags(prev => ({
            ...prev,
            materials: false,
            works: false,
            bundles: false,
        }));
    }, [subscriptionTier]);

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
    }, [bundles, estimates, isLoading, loadedFlags.bundles, loadedFlags.estimates, loadedFlags.materials, loadedFlags.works, materials, setIsSaving, setLastSaved, setSaveError, works]);

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

        goToView(target);
    }, [view, editorDirty, goToView, setPendingView, setShowUnsavedModal]);

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
    }, [subscription, supabaseUser, setSubscription]);

    const consumeAiLimit = useCallback(() => {
        if (!subscription || !supabaseUser) return;
        const next = incrementAiUsage(subscription);
        setSubscription(next);
        void updateUserSubscription(supabaseUser.id, {
            ai_requests_today: next.ai_requests_today ?? 0,
            last_ai_request_date: next.last_ai_request_date ?? null,
        });
    }, [subscription, supabaseUser, setSubscription]);

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
        subscriptionLoading,
        goToView,
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
    }, [setEditorDraft]);

    const handleDirtyChange = useCallback((dirty: boolean) => {
        setEditorDirty(dirty);
    }, [setEditorDirty]);

    const handleSaveRequest = useCallback((draft: Estimate) => {
        setEditorDraft(draft);
        setViewAfterSave(View.HISTORY);
        setShowSaveOptions(true);
        setShowUnsavedModal(false);
        setPendingView(null);
    }, [setEditorDraft, setPendingView, setShowSaveOptions, setShowUnsavedModal, setViewAfterSave]);

    const handleConfirmSave = useCallback((mode: SaveMode) => {
        if (!editorDraft) return;
        handleSaveEstimate(editorDraft, mode, viewAfterSave);
    }, [editorDraft, handleSaveEstimate, viewAfterSave]);

    const handleUnsavedSave = useCallback(() => {
        const target = pendingView ?? View.HISTORY;
        setViewAfterSave(target);
        setShowUnsavedModal(false);
        setShowSaveOptions(true);
    }, [pendingView, setShowSaveOptions, setShowUnsavedModal, setViewAfterSave]);

    const handleUnsavedDiscard = useCallback(() => {
        const target = pendingView ?? View.HISTORY;
        setShowUnsavedModal(false);
        setPendingView(null);
        setEditorDirty(false);
        setEditorDraft(null);
        goToView(target);
    }, [pendingView, goToView, setEditorDirty, setEditorDraft, setPendingView, setShowUnsavedModal]);

    const handleSaveOptionsKeyDown = useCallback((event: React.KeyboardEvent) => {
        if (event.key === 'Escape') {
            setShowSaveOptions(false);
        }
    }, [setShowSaveOptions]);

    const handleUnsavedKeyDown = useCallback((event: React.KeyboardEvent) => {
        if (event.key === 'Escape') {
            setShowUnsavedModal(false);
        }
    }, [setShowUnsavedModal]);

    useEffect(() => {
        if (view !== View.EDITOR) {
            setShowSaveOptions(false);
            setShowUnsavedModal(false);
            setEditorDirty(false);
            setEditorDraft(null);
            setPendingView(null);
        }
    }, [view, setEditorDirty, setEditorDraft, setPendingView, setShowSaveOptions, setShowUnsavedModal]);

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
    }, [goToView, recalculateEstimatePrices, currentEstimate, setCurrentEstimate, setEditorDirty, setEditorDraft, setEditorValidationResult, setEstimates, setPendingExportEstimate, setPendingView, setShowPdfStyleModal, setShowSaveOptions, setShowUnsavedModal]);

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
    }, [pendingExportEstimate, setPendingExportEstimate, setShowContractNameModal, setShowPdfStyleModal]);

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
    }, [pendingExportEstimate, setPendingExportEstimate, setShowContractNameModal]);

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
            return;
        }

        const normalizedInput = normalizeKey(name);
        const existing = materials.find(m => normalizeKey(m.name) === normalizedInput);

        if (existing) {
            const confirmed = window.confirm(
                `Материал «${existing.name}» уже существует (цена: ${existing.price} ₽).\n\nОбновить цену вместо создания дубликата?`
            );
            if (confirmed) {
                const updated = { ...existing, price: price ?? existing.price, link: link ?? existing.link, lastUpdated: new Date().toISOString() };
                try {
                    await updateMaterial(updated);
                    setMaterials(prev => prev.map(m => m.id === existing.id ? updated : m));
                    markDraftEstimatesWithPriceChange({ materialName: existing.name });
                } catch (error) {
                    console.error('Failed to update material:', error);
                    alert('Не удалось обновить материал.');
                }
                return;
            }
        }

        const newMaterial: Material = {
            id: `material-${Date.now()}`,
            name,
            price: price || 0,
            lastUpdated: new Date().toISOString(),
            category,
            isManualPrice: true,
            link,
            sortOrder: Date.now(),
        };
        try {
            await addMaterial(newMaterial);
            setMaterials(prev => [...prev, newMaterial]);
        } catch (error) {
            console.error('Failed to add material:', error);
            alert('Не удалось добавить материал.');
        }
    }, [materials, subscriptionUsage, subscriptionLimits, markDraftEstimatesWithPriceChange]);

    const handleForceAddMaterial = useCallback(async (material: Material) => {
        try {
            await addMaterial(material);
            setMaterials(prev => [...prev, material]);
        } catch (error) {
            console.error('Failed to force add material:', error);
        }
    }, []);

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
            return;
        }

        const normalizedInput = normalizeKey(name);
        const existing = works.find(w => normalizeKey(w.name) === normalizedInput);

        if (existing) {
            const confirmed = window.confirm(
                `Работа «${existing.name}» уже существует (цена: ${existing.price} ₽).\n\nОбновить цену вместо создания дубликата?`
            );
            if (confirmed) {
                const updated = { ...existing, price };
                try {
                    await updateWork(updated);
                    setWorks(prev => prev.map(w => w.id === existing.id ? updated : w));
                    markDraftEstimatesWithPriceChange({ workName: existing.name });
                } catch (error) {
                    console.error('Failed to update work:', error);
                    alert('Не удалось обновить работу.');
                }
                return;
            }
        }

        const newWork: Work = {
            id: `work-${Date.now()}`,
            name,
            price,
            category,
            sortOrder: Date.now(),
        };
        try {
            await addWork(newWork);
            setWorks(prev => [...prev, newWork]);
        } catch (error) {
            console.error('Failed to add work:', error);
            alert('Не удалось добавить работу.');
        }
    }, [works, subscriptionUsage, subscriptionLimits, markDraftEstimatesWithPriceChange]);

    const handleForceAddWork = useCallback(async (work: Work) => {
        try {
            await addWork(work);
            setWorks(prev => [...prev, work]);
        } catch (error) {
            console.error('Failed to force add work:', error);
        }
    }, []);

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

    const handleMergeCatalogDuplicates = useCallback(async (
        type: 'material' | 'work',
        keepId: string,
        deleteIds: string[]
    ) => {
        try {
            if (type === 'material') {
                await deleteMaterials(deleteIds);
                setMaterials(prev => prev.filter(m => !deleteIds.includes(m.id)));
            } else {
                await deleteWorks(deleteIds);
                setWorks(prev => prev.filter(w => !deleteIds.includes(w.id)));
            }
        } catch (error) {
            console.error('Failed to merge duplicates:', error);
            alert('Не удалось объединить дубликаты.');
        }
    }, []);

    const handleAddBundle = useCallback(async (bundle: WorkBundle) => {
        if (!canCreateBundle(subscriptionUsage, subscriptionLimits)) {
            return;
        }
        const nextBundle: WorkBundle = {
            ...bundle,
            sortOrder: bundle.sortOrder ?? Date.now(),
        };
        try {
            await addBundle(nextBundle);
            setBundles(prev => [...prev, nextBundle]);
        } catch (error) {
            console.error('Failed to add bundle:', error);
            alert('Не удалось добавить комплект.');
        }
    }, [subscriptionUsage, subscriptionLimits]);

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
    }, [showToast, supabaseUser, setPaymentLoading]);

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
        setView,
        setCurrentEstimate,
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
        materialsTotalCount: materials.length,
        works: visibleSubscriptionData.works,
        worksTotalCount: works.length,
        bundles: visibleSubscriptionData.bundles,
        bundlesTotalCount: bundles.length,
        onAddMaterial: handleAddMaterial,
        onForceAddMaterial: handleForceAddMaterial,
        onEditMaterialPrice: handleEditMaterialPrice,
        onEditMaterialLink: handleEditMaterialLink,
        onDeleteMaterial: handleDeleteMaterial,
        onAddWork: handleAddWork,
        onForceAddWork: handleForceAddWork,
        onUpdateWork: handleUpdateWork,
        onDeleteWork: handleDeleteWork,
        onAddBundle: handleAddBundle,
        onUpdateBundle: handleUpdateBundle,
        onDeleteBundle: handleDeleteBundle,
        onMergeCatalogDuplicates: handleMergeCatalogDuplicates,
    }), [
        visibleSubscriptionData.materials,
        materials.length,
        visibleSubscriptionData.works,
        works.length,
        visibleSubscriptionData.bundles,
        bundles.length,
        handleAddMaterial,
        handleForceAddMaterial,
        handleEditMaterialPrice,
        handleEditMaterialLink,
        handleDeleteMaterial,
        handleAddWork,
        handleForceAddWork,
        handleUpdateWork,
        handleDeleteWork,
        handleAddBundle,
        handleUpdateBundle,
        handleDeleteBundle,
        handleMergeCatalogDuplicates,
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
    }), [sync, setSync, isSaving, lastSaved, saveError, showToast]);

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
            <ErrorBoundary>
            <div className="min-h-screen bg-background text-text-primary">
                <LandingPage onOpenLogin={() => setShowLoginModal(true)} onOfflineMode={() => setOfflineMode(true)} />
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
                                onGoogleLogin={handleGoogleLogin}
                                onEmailLogin={handleEmailLogin}
                                onEmailSignup={handleEmailSignup}
                                onResetPassword={handleResetPassword}
                                useSupabaseAuth={useSupabaseAuth}
                            />
                            <div className="mt-4">
                                <button
                                    type="button"
                                    onClick={() => setOfflineMode(true)}
                                    className="w-full rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-amber-300 font-medium hover:bg-amber-500/20 transition"
                                >
                                    Работать оффлайн
                                </button>
                                <p className="mt-2 text-center text-xs text-text-secondary">
                                    Данные сохраняются локально. Синхронизация при восстановлении связи.
                                </p>
                            </div>
                        </div>
                    </div>
                )}
                {passwordRecoveryModal}
            </div>
            </ErrorBoundary>
        );
    }

    return (
        <ErrorBoundary>
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
                onProfileClick={() => setIsProfileModalOpen(true)}
                subscriptionSummary={headerSubscriptionSummary}
                isElectron={!!window.electronAPI?.isElectron}
            />
            {offlineModeRaw && (
                <div className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-2 text-center text-sm text-amber-300">
                    Оффлайн-режим — данные сохраняются локально. Синхронизация будет выполнена при восстановлении связи.
                </div>
            )}
            <div className="fixed bottom-4 left-4 z-50">
                <StatusIndicators
                    isOnline={offlineSync.isOnline}
                    isSupabaseConnected={offlineSync.isSupabaseConnected}
                    isGoogleAuthOk={offlineSync.isGoogleAuthOk}
                    pendingCount={offlineSync.pendingChanges.length}
                    syncStatus={offlineSync.syncStatus}
                    onSync={offlineSync.syncNow}
                />
            </div>
            <main className="p-2 sm:p-4 md:p-6 max-w-8xl mx-auto pb-24 lg:pb-6">
                {isLoading ? (
                    <AppLoadingSkeleton />
                ) : (
                    <Suspense fallback={<AppLoadingSkeleton />}>
                        {view === View.HISTORY && (
                            <EstimateHistory />
                        )}
                        {view === View.EDITOR && (
                            <EstimateEditor
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
                    defaultContractName={`Приложение № 1 к договору КМ ${pendingExportEstimate.estimateNumber}`}
                />
            )}
            <ProfileModal
                isOpen={isProfileModalOpen}
                onClose={() => setIsProfileModalOpen(false)}
                user={supabaseUser}
                estimates={estimates}
                materials={materials}
                works={works}
                bundles={bundles}
            />
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
        </ErrorBoundary>
    );
};

export default App;