import { createContext, useContext } from 'react';
import { UserSubscription } from '../types';

// Carries the AI usage plumbing: the per-day AI request counter lives on the
// user_subscriptions record and onConsume bumps it. The gate itself is open
// while no AI limit is configured; a future limit reads ai_requests_today.
export type AiAccess = {
  canUseAi: boolean;
  remaining: number | null;
  onConsume: (reason: 'autocomplete' | 'generation' | 'analysis') => void;
};

type SubscriptionContextValue = {
  subscription: UserSubscription | null;
  subscriptionLoading: boolean;
  aiAccess: AiAccess;
};

const SubscriptionContext = createContext<SubscriptionContextValue | undefined>(undefined);

export const SubscriptionProvider = SubscriptionContext.Provider;

export const useOptionalSubscriptionContext = (): SubscriptionContextValue | undefined => {
  return useContext(SubscriptionContext);
};


