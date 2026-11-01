import { SubscriptionTier, UserSubscription } from '../types';
import supabase from './supabase';

export const formatDateKey = (date = new Date()): string => date.toISOString().slice(0, 10);

export const formatMonthKey = (date = new Date()): string => date.toISOString().slice(0, 7);

const normalizeExpiredSubscription = (subscription: UserSubscription, now = new Date()): {
    subscription: UserSubscription;
    updates: Partial<UserSubscription>;
} => {
    if (!subscription.expires_at) return { subscription, updates: {} };
    const expiresMs = Date.parse(subscription.expires_at);
    if (!Number.isFinite(expiresMs)) return { subscription, updates: {} };

    // Grace period: 1 hour to avoid false expiry from clock drift between server and client
    const GRACE_MS = 60 * 60 * 1000;
    if (expiresMs + GRACE_MS > now.getTime()) return { subscription, updates: {} };
    if (subscription.status !== 'active') return { subscription, updates: {} };

    const nowIso = now.toISOString();
    const next: UserSubscription = {
        ...subscription,
        status: 'expired',
        subscription_tier: 'free',
        updated_at: nowIso,
    };
    return {
        subscription: next,
        updates: {
            status: 'expired',
            subscription_tier: 'free',
            updated_at: nowIso,
        },
    };
};

const safeDateKey = (value?: string | null): string | null => {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return formatDateKey(parsed);
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

    return { subscription: next, updates };
};

const createDefaultSubscription = async (userId: string): Promise<UserSubscription | null> => {
    if (!supabase) return null;
    const nowIso = new Date().toISOString();
    const todayKey = formatDateKey(new Date());
    const payload = {
        user_id: userId,
        subscription_tier: 'free' as SubscriptionTier,
        status: 'active',
        started_at: nowIso,
        expires_at: null as string | null,
        ai_requests_today: 0,
        last_ai_request_date: todayKey,
        estimates_deleted_this_month: 0,
        limits_reset_date: todayKey,
        updated_at: nowIso,
    };

    const { data, error } = await supabase
        .from('user_subscriptions')
        .insert(payload)
        .select('*')
        .single();

    if (error) {
        console.warn('Failed to create default subscription:', error);
        return null;
    }

    return data as UserSubscription;
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

    if (data) {
        const { subscription: normalized, updates } = normalizeExpiredSubscription(data as UserSubscription);
        if (Object.keys(updates).length > 0) {
            const updated = await updateUserSubscription(userId, updates);
            return updated ?? normalized;
        }
        return normalized;
    }

    return createDefaultSubscription(userId);
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
