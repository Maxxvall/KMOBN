import { createContext, useContext } from 'react';
import { UserSubscription } from '../types';

// Carries the AI usage guard: canUseAi/remaining read the per-day AI request
// counter stored on the user_subscriptions record.
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


