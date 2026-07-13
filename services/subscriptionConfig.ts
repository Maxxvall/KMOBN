import { SubscriptionLimits, SubscriptionTier } from '../types';

export const SUBSCRIPTION_LIMITS: Record<SubscriptionTier, SubscriptionLimits> = {
    free: {
        estimates: { max: null, canDelete: true, deletePerMonth: null },
        materials: { max: null },
        works: { max: null },
        bundles: { max: null },
        aiRequestsPerDay: null,
        features: {
            analytics: true,
            salaryCalculator: true,
            wiki: true,
        },
    },
    basic: {
        estimates: { max: null, canDelete: true, deletePerMonth: null },
        materials: { max: null },
        works: { max: null },
        bundles: { max: null },
        aiRequestsPerDay: null,
        features: {
            analytics: true,
            salaryCalculator: true,
            wiki: true,
        },
    },
    premium: {
        estimates: { max: null, canDelete: true, deletePerMonth: null },
        materials: { max: null },
        works: { max: null },
        bundles: { max: null },
        aiRequestsPerDay: null,
        features: {
            analytics: true,
            salaryCalculator: true,
            wiki: true,
        },
    },
};

export const getSubscriptionLabel = (tier: SubscriptionTier): string => {
    void tier;
    return 'Безлимит';
};
