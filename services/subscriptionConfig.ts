import { SubscriptionLimits, SubscriptionTier } from '../types';

export const SUBSCRIPTION_LIMITS: Record<SubscriptionTier, SubscriptionLimits> = {
    free: {
        estimates: { max: 1, canDelete: false, deletePerMonth: 0 },
        materials: { max: 10 },
        works: { max: 5 },
        bundles: { max: 1 },
        aiRequestsPerDay: 2,
        features: {
            analytics: false,
            salaryCalculator: false,
            wiki: false,
        },
    },
    basic: {
        estimates: { max: 5, canDelete: true, deletePerMonth: 2 },
        materials: { max: 50 },
        works: { max: 10 },
        bundles: { max: 5 },
        aiRequestsPerDay: 10,
        features: {
            analytics: false,
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
    switch (tier) {
        case 'basic':
            return 'Basic';
        case 'premium':
            return 'Premium';
        default:
            return 'Free';
    }
};
