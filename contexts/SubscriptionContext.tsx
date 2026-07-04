import { createContext, useContext } from 'react';
import { SubscriptionLimits, SubscriptionTier, SubscriptionUsage, UserSubscription } from '../types';

export type AiAccess = {
  canUseAi: boolean;
  remaining: number | null;
  onConsume: (reason: 'autocomplete' | 'generation' | 'analysis') => void;
};

export type HeaderSubscriptionSummary = {
  tier: SubscriptionTier;
  usage: SubscriptionUsage;
  limits: SubscriptionLimits;
};

type SubscriptionContextValue = {
  subscription: UserSubscription | null;
  subscriptionLoading: boolean;
  paymentLoading: boolean;
  subscriptionTier: SubscriptionTier;
  subscriptionLimits: SubscriptionLimits;
  subscriptionUsage: SubscriptionUsage;
  headerSubscriptionSummary: HeaderSubscriptionSummary;
  aiAccess: AiAccess;
  onStartPayment: (tier: SubscriptionTier) => Promise<void>;
};

const SubscriptionContext = createContext<SubscriptionContextValue | undefined>(undefined);

export const SubscriptionProvider = SubscriptionContext.Provider;

export const useOptionalSubscriptionContext = (): SubscriptionContextValue | undefined => {
  return useContext(SubscriptionContext);
};


