import { Estimate, Material, SubscriptionLimits, SubscriptionTier, SubscriptionUsage, UserSubscription, Work, WorkBundle } from '../types';
import supabase from './supabase';
import { SUBSCRIPTION_LIMITS } from './subscriptionConfig';

export const getSubscriptionLimits = (tier: SubscriptionTier): SubscriptionLimits => SUBSCRIPTION_LIMITS[tier];

export const formatDateKey = (date = new Date()): string => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

export const formatMonthKey = (date = new Date()): string => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
};

const safeDateKey = (value?: string | null): string | null => {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return formatDateKey(parsed);
};

const safeMonthKey = (value?: string | null): string | null => {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return formatMonthKey(parsed);
};

export const normalizeSubscriptionUsage = (subscription: UserSubscription, now = new Date()): {
    subscription: UserSubscription;
    updates: Partial<UserSubscription>;
} => {
    let next = { ...subscription };
    const updates: Partial<UserSubscription> = {};

    const todayKey = formatDateKey(now);
    const aiDateKey = safeDateKey(subscription.last_ai_request_date);
    if (aiDateKey !== todayKey) {
        next = {
            ...next,
            ai_requests_today: 0,
            last_ai_request_date: todayKey,
        };
        updates.ai_requests_today = 0;
        updates.last_ai_request_date = todayKey;
    }

    const monthKey = formatMonthKey(now);
    const resetMonthKey = safeMonthKey(subscription.limits_reset_date);
    if (resetMonthKey !== monthKey) {
        next = {
            ...next,
            estimates_deleted_this_month: 0,
            limits_reset_date: todayKey,
        };
        updates.estimates_deleted_this_month = 0;
        updates.limits_reset_date = todayKey;
    }

    return { subscription: next, updates };
};

export const getUserSubscription = async (userId: string): Promise<UserSubscription | null> => {
    if (!supabase) return null;
    const { data, error } = await supabase
        .from('user_subscriptions')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

    if (error) {
        console.warn('Failed to load user subscription:', error);
        return null;
    }

    return data as UserSubscription;
};

export const updateUserSubscription = async (
    userId: string,
    updates: Partial<UserSubscription>,
): Promise<UserSubscription | null> => {
    if (!supabase) return null;
    if (!Object.keys(updates).length) return null;

    const { data, error } = await supabase
        .from('user_subscriptions')
        .update(updates)
        .eq('user_id', userId)
        .select('*')
        .single();

    if (error) {
        console.warn('Failed to update user subscription:', error);
        return null;
    }

    return data as UserSubscription;
};

export const deriveSubscriptionUsage = (params: {
    subscription: UserSubscription | null;
    estimates: Estimate[];
    materials: Material[];
    works: Work[];
    bundles: WorkBundle[];
    now?: Date;
}): SubscriptionUsage => {
    const { subscription, estimates, materials, works, bundles, now = new Date() } = params;

    const estimateNumbers = new Set(
        estimates.map(e => (e.estimateNumber || e.id || '').trim()).filter(Boolean),
    );

    const todayKey = formatDateKey(now);
    const aiDateKey = safeDateKey(subscription?.last_ai_request_date) ?? null;
    const aiRequestsToday = aiDateKey === todayKey ? Number(subscription?.ai_requests_today ?? 0) : 0;

    const monthKey = formatMonthKey(now);
    const resetMonthKey = safeMonthKey(subscription?.limits_reset_date) ?? null;
    const estimatesDeletedThisMonth = resetMonthKey === monthKey
        ? Number(subscription?.estimates_deleted_this_month ?? 0)
        : 0;

    return {
        estimatesCreated: estimateNumbers.size,
        estimatesDeletedThisMonth,
        materialsCreated: materials.length,
        worksCreated: works.length,
        bundlesCreated: bundles.length,
        aiRequestsToday,
    };
};

export const incrementAiUsage = (subscription: UserSubscription, now = new Date()): UserSubscription => {
    const todayKey = formatDateKey(now);
    const aiDateKey = safeDateKey(subscription.last_ai_request_date);
    const base = aiDateKey === todayKey ? Number(subscription.ai_requests_today ?? 0) : 0;
    return {
        ...subscription,
        ai_requests_today: base + 1,
        last_ai_request_date: todayKey,
    };
};

export const incrementDeletedEstimates = (subscription: UserSubscription, now = new Date()): UserSubscription => {
    const monthKey = formatMonthKey(now);
    const resetMonthKey = safeMonthKey(subscription.limits_reset_date);
    const base = resetMonthKey === monthKey ? Number(subscription.estimates_deleted_this_month ?? 0) : 0;
    return {
        ...subscription,
        estimates_deleted_this_month: base + 1,
        limits_reset_date: formatDateKey(now),
    };
};

export const canCreateEstimate = (usage: SubscriptionUsage, limits: SubscriptionLimits): boolean => {
    if (limits.estimates.max == null) return true;
    return usage.estimatesCreated < limits.estimates.max;
};

export const canDeleteEstimate = (usage: SubscriptionUsage, limits: SubscriptionLimits): boolean => {
    if (!limits.estimates.canDelete) return false;
    if (limits.estimates.deletePerMonth == null) return true;
    return usage.estimatesDeletedThisMonth < limits.estimates.deletePerMonth;
};

export const canCreateMaterial = (usage: SubscriptionUsage, limits: SubscriptionLimits): boolean => {
    if (limits.materials.max == null) return true;
    return usage.materialsCreated < limits.materials.max;
};

export const canCreateWork = (usage: SubscriptionUsage, limits: SubscriptionLimits): boolean => {
    if (limits.works.max == null) return true;
    return usage.worksCreated < limits.works.max;
};

export const canCreateBundle = (usage: SubscriptionUsage, limits: SubscriptionLimits): boolean => {
    if (limits.bundles.max == null) return true;
    return usage.bundlesCreated < limits.bundles.max;
};

export const canUseAi = (usage: SubscriptionUsage, limits: SubscriptionLimits): boolean => {
    if (limits.aiRequestsPerDay == null) return true;
    return usage.aiRequestsToday < limits.aiRequestsPerDay;
};

export const canUseAnalytics = (limits: SubscriptionLimits): boolean => limits.features.analytics;

export const canUseSalaryCalculator = (limits: SubscriptionLimits): boolean => limits.features.salaryCalculator;

export const canUseWiki = (limits: SubscriptionLimits): boolean => limits.features.wiki;
