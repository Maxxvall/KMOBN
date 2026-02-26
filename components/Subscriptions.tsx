import React, { useMemo } from 'react';
import { SubscriptionLimits, SubscriptionTier, SubscriptionUsage, UserSubscription } from '../types';
import { getSubscriptionLabel } from '../services/subscriptionConfig';
import { useOptionalSubscriptionContext } from '../contexts/SubscriptionContext';

type PlanCard = {
    tier: SubscriptionTier;
    title: string;
    price: string;
    priceNote: string;
    features: string[];
    highlight?: boolean;
};

const PLANS: PlanCard[] = [
    {
        tier: 'free',
        title: 'Free',
        price: '0 USDT',
        priceNote: 'Навсегда бесплатно',
        features: [
            '1 смета (без удаления)',
            'До 10 материалов и 5 работ',
            '1 комплект',
            '2 AI-запроса в день',
            'Без аналитики и калькулятора',
        ],
    },
    {
        tier: 'basic',
        title: 'Basic',
        price: '20 USDT',
        priceNote: 'в месяц (оплата в USDT)',
        features: [
            'До 5 смет',
            'Удаление смет (2 в месяц)',
            'До 50 материалов и 10 работ',
            'До 5 комплектов',
            '10 AI-запросов в день',
            'Wiki и калькулятор зарплаты',
        ],
        highlight: true,
    },
    {
        tier: 'premium',
        title: 'Premium',
        price: '50 USDT',
        priceNote: 'в месяц (оплата в USDT)',
        features: [
            'Безлимитные сметы и материалы',
            'Удаление без ограничений',
            'Безлимитные AI-запросы',
            'Аналитика, Wiki, калькулятор',
            'Приоритетные обновления',
        ],
    },
];

const formatLimit = (value: number | null): string => (value == null ? '∞' : String(value));

const formatRemainingDays = (expiresAt?: string | null): string => {
    if (!expiresAt) return 'Без срока';
    const expiresMs = Date.parse(expiresAt);
    if (!Number.isFinite(expiresMs)) return 'Без срока';
    const diffMs = expiresMs - Date.now();
    const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (days <= 0) return 'Истекла';
    return `${days} дн.`;
};

const formatStatus = (status?: string | null): string => {
    switch (status) {
        case 'active':
            return 'Активна';
        case 'expired':
            return 'Истекла';
        case 'cancelled':
            return 'Отменена';
        default:
            return 'Неизвестно';
    }
};

const TIER_ORDER: Record<SubscriptionTier, number> = {
    free: 0,
    basic: 1,
    premium: 2,
};

const Subscriptions: React.FC<{
    subscription?: UserSubscription | null;
    limits?: SubscriptionLimits;
    usage?: SubscriptionUsage;
    onStartPayment?: (tier: SubscriptionTier) => void | Promise<void>;
    isLoading?: boolean;
}> = ({ subscription, limits, usage, onStartPayment, isLoading }) => {
    const subscriptionContext = useOptionalSubscriptionContext();
    const currentSubscription = subscription ?? subscriptionContext?.subscription ?? null;
    const currentLimits = limits ?? subscriptionContext?.subscriptionLimits;
    const currentUsage = usage ?? subscriptionContext?.subscriptionUsage;
    const startPaymentAction = onStartPayment ?? subscriptionContext?.onStartPayment;
    const loading = isLoading ?? subscriptionContext?.subscriptionLoading ?? false;

    if (!currentLimits || !currentUsage) {
        return null;
    }

    const currentTier: SubscriptionTier = currentSubscription?.subscription_tier ?? 'free';
    const statusLabel = formatStatus(currentSubscription?.status);
    const remainingLabel = formatRemainingDays(currentSubscription?.expires_at ?? null);
    const isActive = Boolean(
        currentSubscription?.status === 'active' &&
        currentSubscription?.expires_at &&
        Date.parse(currentSubscription.expires_at) > Date.now(),
    );
    const currentTierIndex = TIER_ORDER[currentTier];

    const usageSummary = useMemo(() => {
        return [
            `Сметы: ${currentUsage.estimatesCreated}/${formatLimit(currentLimits.estimates.max)}`,
            `Материалы: ${currentUsage.materialsCreated}/${formatLimit(currentLimits.materials.max)}`,
            `Работы: ${currentUsage.worksCreated}/${formatLimit(currentLimits.works.max)}`,
            `Комплекты: ${currentUsage.bundlesCreated}/${formatLimit(currentLimits.bundles.max)}`,
            `AI сегодня: ${currentUsage.aiRequestsToday}/${formatLimit(currentLimits.aiRequestsPerDay)}`,
        ];
    }, [currentLimits, currentUsage]);

    return (
        <div className="space-y-6">
            <div className="bg-surface rounded-xl border border-border p-5">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                        <div className="text-sm text-text-secondary">Текущий план</div>
                        <div className="text-2xl font-semibold text-text-primary">{getSubscriptionLabel(currentTier)}</div>
                        <div className="mt-2 text-sm text-text-secondary">Статус: {statusLabel}</div>
                        <div className="text-sm text-text-secondary">До конца: {remainingLabel}</div>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-text-secondary">
                        {usageSummary.map(item => (
                            <span key={item} className="px-2 py-1 rounded border border-border">
                                {item}
                            </span>
                        ))}
                    </div>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                {PLANS.map(plan => {
                    const isCurrent = plan.tier === currentTier;
                    const targetTierIndex = TIER_ORDER[plan.tier];
                    const isDowngrade = isActive && targetTierIndex < currentTierIndex;
                    const isDisabled = isCurrent || loading || plan.tier === 'free' || isDowngrade;
                    return (
                        <div
                            key={plan.tier}
                            className={`rounded-xl border bg-surface p-5 flex flex-col justify-between items-center text-center ${
                                isCurrent ? 'border-red-500 ring-2 ring-red-500/20' : 'border-border'
                            }`}
                        >
                            <div>
                                <div className="flex flex-col items-center">
                                    <h3 className="text-lg font-semibold text-text-primary">{plan.title}</h3>
                                    {isCurrent && (
                                        <span className="mt-2 text-xs text-primary border border-primary px-2 py-1 rounded-full">
                                            Текущий
                                        </span>
                                    )}
                                </div>
                                <div className="mt-3 text-3xl font-bold text-text-primary">{plan.price}</div>
                                <div className="text-sm text-text-secondary">{plan.priceNote}</div>
                                <ul className="mt-4 space-y-2 text-sm text-text-primary">
                                    {plan.features.map(feature => (
                                        <li key={feature} className="flex items-start gap-2 justify-center">
                                            <span aria-hidden>✅</span>
                                            <span>{feature}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    if (startPaymentAction) {
                                        void startPaymentAction(plan.tier);
                                    }
                                }}
                                disabled={isDisabled}
                                className={`mt-6 w-full rounded-md px-4 py-2 font-semibold transition-colors ${
                                    isDisabled
                                        ? 'bg-gray-700 text-text-secondary cursor-not-allowed'
                                        : 'bg-primary text-white hover:bg-primary-hover'
                                }`}
                            >
                                {plan.tier === 'free'
                                    ? 'Бесплатно'
                                    : isCurrent
                                        ? 'Текущий план'
                                        : isDowngrade
                                            ? 'Доступно после окончания'
                                        : loading
                                            ? 'Создаём платёж…'
                                            : 'Оплатить'}
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default Subscriptions;
