import { describe, expect, it } from 'vitest';
import type { SubscriptionTier } from '../types';
import { getSubscriptionLabel, SUBSCRIPTION_LIMITS } from './subscriptionConfig';

describe('unlimited account configuration', () => {
  it.each<SubscriptionTier>(['free', 'basic', 'premium'])('keeps legacy tier %s unlimited', tier => {
    const limits = SUBSCRIPTION_LIMITS[tier];

    expect(limits.estimates).toMatchObject({ max: null, canDelete: true, deletePerMonth: null });
    expect(limits.materials.max).toBeNull();
    expect(limits.works.max).toBeNull();
    expect(limits.bundles.max).toBeNull();
    expect(limits.aiRequestsPerDay).toBeNull();
    expect(Object.values(limits.features).every(Boolean)).toBe(true);
    expect(getSubscriptionLabel(tier)).toBe('Безлимит');
  });
});
