import React, { useMemo } from 'react';
import { SubscriptionLimits, SubscriptionTier, SubscriptionUsage, UserSubscription } from '../types';
import { getSubscriptionLabel } from '../services/subscriptionService';

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
        price: '$0',
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
        price: '$3',
        priceNote: 'в месяц',
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
        price: '$10',
        priceNote: 'в месяц',
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

const Subscriptions: React.FC<{
    subscription: UserSubscription | null;
    limits: SubscriptionLimits;
    usage: SubscriptionUsage;
    onStartPayment: (tier: SubscriptionTier) => void;
    isLoading?: boolean;
}> = ({ subscription, limits, usage, onStartPayment, isLoading }) => {
    const currentTier: SubscriptionTier = subscription?.subscription_tier ?? 'free';
    const statusLabel = formatStatus(subscription?.status);
    const remainingLabel = formatRemainingDays(subscription?.expires_at ?? null);

    const usageSummary = useMemo(() => {
        return [
            `Сметы: ${usage.estimatesCreated}/${formatLimit(limits.estimates.max)}`,
            `Материалы: ${usage.materialsCreated}/${formatLimit(limits.materials.max)}`,
            `Работы: ${usage.worksCreated}/${formatLimit(limits.works.max)}`,
            `Комплекты: ${usage.bundlesCreated}/${formatLimit(limits.bundles.max)}`,
            `AI сегодня: ${usage.aiRequestsToday}/${formatLimit(limits.aiRequestsPerDay)}`,
        ];
    }, [limits, usage]);

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
                    return (
                        <div
                            key={plan.tier}
                            className={`rounded-xl border border-border bg-surface p-5 flex flex-col justify-between ${
                                plan.highlight ? 'ring-2 ring-primary/50' : ''
                            }`}
                        >
                            <div>
                                <div className="flex items-center justify-between">
                                    <h3 className="text-lg font-semibold text-text-primary">{plan.title}</h3>
                                    {isCurrent && (
                                        <span className="text-xs text-primary border border-primary px-2 py-1 rounded-full">
                                            Текущий
                                        </span>
                                    )}
                                </div>
                                <div className="mt-3 text-3xl font-bold text-text-primary">{plan.price}</div>
                                <div className="text-sm text-text-secondary">{plan.priceNote}</div>
                                <ul className="mt-4 space-y-2 text-sm text-text-primary">
                                    {plan.features.map(feature => (
                                        <li key={feature} className="flex items-start gap-2">
                                            <span aria-hidden>✅</span>
                                            <span>{feature}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                            <button
                                type="button"
                                onClick={() => onStartPayment(plan.tier)}
                                disabled={isCurrent || isLoading || plan.tier === 'free'}
                                className={`mt-6 w-full rounded-md px-4 py-2 font-semibold transition-colors ${
                                    isCurrent || plan.tier === 'free'
                                        ? 'bg-gray-700 text-text-secondary cursor-not-allowed'
                                        : 'bg-primary text-white hover:bg-primary-hover'
                                }`}
                            >
                                {plan.tier === 'free'
                                    ? 'Бесплатно'
                                    : isCurrent
                                        ? 'Текущий план'
                                        : isLoading
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
