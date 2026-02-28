import { createClient } from '@supabase/supabase-js';
import type { SubscriptionTier } from '../types';

type ApiRequest = {
    method?: string;
    headers: Record<string, string | string[] | undefined>;
    body?: string | Record<string, unknown> | null;
};

type ApiResponse = {
    status: (code: number) => ApiResponse;
    json: (data: Record<string, unknown>) => void;
    send: (data: string) => void;
    setHeader: (name: string, value: string) => void;
};

type CreatePaymentPayload = {
    tier: SubscriptionTier;
    userId: string;
    successUrl?: string;
    cancelUrl?: string;
};

type UserSubscriptionRow = {
    subscription_tier: SubscriptionTier;
    expires_at: string | null;
    status: string | null;
};

type RateLimitEntry = {
    count: number;
    resetAt: number;
};

const PRICE_BY_TIER: Record<SubscriptionTier, number> = {
    free: 0,
    basic: 20,
    premium: 50,
};

const DEFAULT_PRICE_CURRENCY = 'usdttrc20';
const DEFAULT_INVOICE_PRICE_CURRENCY = 'usd';
const DEFAULT_PAY_CURRENCIES = ['usdttrc20', 'usdt', 'btc', 'eth'];

const TIER_ORDER: Record<SubscriptionTier, number> = {
    free: 0,
    basic: 1,
    premium: 2,
};

const resolveHeader = (headers: Record<string, string | string[] | undefined>, key: string): string | undefined => {
    const value = headers[key] ?? headers[key.toLowerCase()];
    if (Array.isArray(value)) return value[0];
    return value;
};

const isSandboxMode = (): boolean => {
    const raw = process.env.NOWPAYMENTS_SANDBOX_MODE;
    if (!raw) return false;
    return ['1', 'true', 'yes', 'on'].includes(String(raw).trim().toLowerCase());
};

const parsePayload = (body: ApiRequest['body']): CreatePaymentPayload | null => {
    if (!body) return null;
    const parsed = typeof body === 'string' ? JSON.parse(body) : body;
    if (!parsed || typeof parsed !== 'object') return null;
    const candidate = parsed as Record<string, unknown>;
    if (typeof candidate.tier !== 'string' || typeof candidate.userId !== 'string') return null;
    return {
        tier: candidate.tier as SubscriptionTier,
        userId: candidate.userId,
        successUrl: typeof candidate.successUrl === 'string' ? candidate.successUrl : undefined,
        cancelUrl: typeof candidate.cancelUrl === 'string' ? candidate.cancelUrl : undefined,
    };
};

const parsePayCurrencies = (value: string | undefined): string[] => {
    if (!value) return [];
    return value
        .split(',')
        .map(item => item.trim().toLowerCase())
        .filter(Boolean);
};

const resolvePriceCurrency = (): string => {
    const raw = process.env.NOWPAYMENTS_PRICE_CURRENCY;
    return raw ? raw.trim().toLowerCase() : DEFAULT_PRICE_CURRENCY;
};

const resolvePayCurrencies = (): string[] => {
    const fromEnv = parsePayCurrencies(process.env.NOWPAYMENTS_PAY_CURRENCIES);
    return fromEnv.length > 0 ? fromEnv : DEFAULT_PAY_CURRENCIES;
};

const resolveInvoicePriceCurrency = (): string => {
    const raw = process.env.NOWPAYMENTS_INVOICE_PRICE_CURRENCY;
    return raw ? raw.trim().toLowerCase() : DEFAULT_INVOICE_PRICE_CURRENCY;
};

const normalizeAmount = (value: number, decimals = 2): number => {
    if (!Number.isFinite(value)) return value;
    const factor = Math.pow(10, decimals);
    return Math.ceil(value * factor) / factor;
};

const isActiveSubscription = (subscription: UserSubscriptionRow | null): boolean => {
    if (!subscription) return false;
    if (subscription.status !== 'active') return false;
    if (!subscription.expires_at) return false;
    const expiresMs = Date.parse(subscription.expires_at);
    if (!Number.isFinite(expiresMs)) return false;
    return expiresMs > Date.now();
};

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const rateLimitStore = new Map<string, RateLimitEntry>();

// Periodic cleanup of expired rate-limit entries to prevent memory leaks
const cleanupRateLimitStore = (): void => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore) {
        if (entry.resetAt <= now) {
            rateLimitStore.delete(key);
        }
    }
};

let rateLimitCleanupTimer: ReturnType<typeof setInterval> | null = null;
if (typeof setInterval !== 'undefined' && !rateLimitCleanupTimer) {
    rateLimitCleanupTimer = setInterval(cleanupRateLimitStore, RATE_LIMIT_CLEANUP_INTERVAL_MS);
    // Allow process to exit without waiting for the timer
    if (rateLimitCleanupTimer && typeof rateLimitCleanupTimer === 'object' && 'unref' in rateLimitCleanupTimer) {
        (rateLimitCleanupTimer as NodeJS.Timeout).unref();
    }
}

const resolveRateLimitKey = (payload: CreatePaymentPayload, headers: ApiRequest['headers']): string => {
    const userId = payload.userId.trim();
    const forwardedFor = resolveHeader(headers, 'x-forwarded-for');
    const ip = forwardedFor ? forwardedFor.split(',')[0]?.trim() : '';
    return `${userId}:${ip || 'unknown'}`;
};

const isRateLimited = (key: string, now = Date.now()): { limited: boolean; retryAfterSeconds: number } => {
    const entry = rateLimitStore.get(key);
    if (!entry || entry.resetAt <= now) {
        rateLimitStore.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
        return { limited: false, retryAfterSeconds: 0 };
    }

    if (entry.count >= RATE_LIMIT_MAX) {
        return { limited: true, retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000) };
    }

    entry.count += 1;
    rateLimitStore.set(key, entry);
    return { limited: false, retryAfterSeconds: 0 };
};

const fetchMinimumAmount = async (
    apiBase: string,
    apiKey: string,
    currencyFrom: string,
    currencyTo: string,
    amount: number,
): Promise<number | null> => {
    // If currencies are identical, no conversion/estimate is needed
    if (currencyFrom.trim().toLowerCase() === currencyTo.trim().toLowerCase()) {
        return amount;
    }

    try {
        const url = `${apiBase}/v1/min-amount?currency_from=${encodeURIComponent(currencyFrom)}&currency_to=${encodeURIComponent(currencyTo)}&amount=${encodeURIComponent(amount)}`;
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
            },
        });

        if (!response.ok) return null;
        const payload = (await response.json()) as Record<string, unknown>;
        const minAmount = (payload && (payload.min_amount || payload.minAmount || payload.min)) as unknown;
        if (typeof minAmount === 'number' && Number.isFinite(minAmount) && minAmount > 0) {
            return minAmount;
        }
        return null;
    } catch (err) {
        return null;
    }
};

const fetchInvoiceMinimumFiat = async (
    apiBase: string,
    apiKey: string,
    payCurrency: string,
    fiatCurrency: string,
): Promise<{ minCrypto?: number; fiatEquivalent?: number } | null> => {
    try {
        const url = `${apiBase}/v1/min-amount?currency_from=${encodeURIComponent(payCurrency)}&fiat_equivalent=${encodeURIComponent(fiatCurrency)}`;
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
            },
        });

        if (!response.ok) return null;
        const payload = (await response.json()) as Record<string, unknown>;
        const minAmount = payload.min_amount;
        const fiatEquivalent = payload.fiat_equivalent;
        return {
            minCrypto: typeof minAmount === 'number' && Number.isFinite(minAmount) ? minAmount : undefined,
            fiatEquivalent: typeof fiatEquivalent === 'number' && Number.isFinite(fiatEquivalent) ? fiatEquivalent : undefined,
        };
    } catch (err) {
        return null;
    }
};

export default async function handler(req: ApiRequest, res: ApiResponse) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        res.status(405).send('Method Not Allowed');
        return;
    }

    const sandboxMode = isSandboxMode();
    const apiKey = sandboxMode
        ? process.env.NOWPAYMENTS_SANDBOX_API_KEY
        : process.env.NOWPAYMENTS_API_KEY;
    if (!apiKey) {
        res.status(500).send(sandboxMode
            ? 'NOWPAYMENTS_SANDBOX_API_KEY is missing'
            : 'NOWPAYMENTS_API_KEY is missing');
        return;
    }

    let payload: CreatePaymentPayload | null = null;
    try {
        payload = parsePayload(req.body);
    } catch (error) {
        res.status(400).send('Invalid JSON payload');
        return;
    }

    if (!payload || !['basic', 'premium', 'free'].includes(payload.tier)) {
        res.status(400).send('Invalid payload');
        return;
    }

    if (payload.tier === 'free') {
        res.status(400).send('Free tier does not require payment');
        return;
    }

    const rateKey = resolveRateLimitKey(payload, req.headers);
    const limitResult = isRateLimited(rateKey);
    if (limitResult.limited) {
        res.status(429).send(`Rate limit exceeded. Retry after ${limitResult.retryAfterSeconds} seconds.`);
        return;
    }

    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
        res.status(500).send('Missing server configuration');
        return;
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: existingSubscription, error: subError } = await supabase
        .from('user_subscriptions')
        .select('subscription_tier, expires_at, status')
        .eq('user_id', payload.userId)
        .maybeSingle();

    if (subError) {
        res.status(500).send('Failed to load subscription');
        return;
    }

    const activeSubscription = isActiveSubscription(existingSubscription as UserSubscriptionRow | null)
        ? (existingSubscription as UserSubscriptionRow)
        : null;

    if (activeSubscription) {
        const currentIndex = TIER_ORDER[activeSubscription.subscription_tier];
        const nextIndex = TIER_ORDER[payload.tier];
        if (nextIndex < currentIndex) {
            res.status(400).send('Downgrade is not allowed while subscription is active');
            return;
        }
    }

    const price = PRICE_BY_TIER[payload.tier];
    const proto = resolveHeader(req.headers, 'x-forwarded-proto') || 'https';
    const host = resolveHeader(req.headers, 'x-forwarded-host') || resolveHeader(req.headers, 'host');
    const baseUrl = host ? `${proto}://${host}` : '';
    const orderId = `sub_${payload.tier}_${payload.userId}_${Date.now()}`;

    const priceCurrency = resolvePriceCurrency();
    const payCurrencies = resolvePayCurrencies();
    const invoicePriceCurrency = resolveInvoicePriceCurrency();

    const apiBase = sandboxMode ? 'https://api-sandbox.nowpayments.io' : 'https://api.nowpayments.io';
    let lastErrorMessage = 'NowPayments error';
    let lastErrorCode: string | undefined;
    let lastStatus = 502;

    // 1) Try invoice flow first to obtain redirect URL
    try {
        const invoicePayCurrency = payCurrencies[0];
        const invoiceMin = await fetchInvoiceMinimumFiat(apiBase, apiKey, invoicePayCurrency, invoicePriceCurrency);
        const minFiat = invoiceMin?.fiatEquivalent;
        const invoiceBaseAmount = minFiat && minFiat > price ? minFiat : price;
        const invoicePriceAmount = normalizeAmount(
            sandboxMode ? invoiceBaseAmount * 1.05 : invoiceBaseAmount,
            2,
        );

        const invoicePayload = {
            price_amount: invoicePriceAmount,
            price_currency: invoicePriceCurrency,
            pay_currency: invoicePayCurrency,
            order_id: orderId,
            order_description: `Subscription ${payload.tier}`,
            ipn_callback_url: `${baseUrl}/api/webhook`,
            success_url: payload.successUrl || baseUrl,
            cancel_url: payload.cancelUrl || baseUrl,
            partially_paid_url: payload.successUrl || baseUrl,
        };

        const invoiceResponse = await fetch(`${apiBase}/v1/invoice`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
            },
            body: JSON.stringify(invoicePayload),
        });

        if (invoiceResponse.ok) {
            const invoiceData = (await invoiceResponse.json()) as Record<string, unknown>;
            const invoiceUrl =
                (typeof invoiceData.invoice_url === 'string' && invoiceData.invoice_url) ||
                (typeof (invoiceData as any).invoiceUrl === 'string' && (invoiceData as any).invoiceUrl) ||
                (typeof invoiceData.payment_url === 'string' && invoiceData.payment_url) ||
                (typeof invoiceData.url === 'string' && invoiceData.url) ||
                '';
            const invoiceId = typeof invoiceData.id === 'string' ? invoiceData.id : null;

            if (invoiceUrl) {
                res.status(200).json({
                    paymentUrl: invoiceUrl,
                    orderId,
                    paymentId: invoiceId,
                });
                return;
            }

            lastErrorMessage = `NowPayments invoice response missing invoice_url; body=${JSON.stringify(invoiceData)}`;
            lastErrorCode = 'INTERNAL_ERROR';
            lastStatus = 502;
        } else {
            const contentType = invoiceResponse.headers.get('content-type') || '';
            let errorMessage = 'NowPayments invoice error';
            let errorCode: string | undefined;

            if (contentType.includes('application/json')) {
                const payload = (await invoiceResponse.json()) as Record<string, unknown>;
                if (typeof payload.message === 'string') {
                    errorMessage = payload.message;
                }
                if (typeof payload.code === 'string') {
                    errorCode = payload.code;
                }
            } else {
                const text = await invoiceResponse.text();
                if (text) {
                    errorMessage = text;
                }
            }

            lastErrorMessage = errorMessage;
            lastErrorCode = errorCode;
            lastStatus = invoiceResponse.status;

            if (!(
                errorCode === 'CURRENCY_UNAVAILABLE' ||
                errorCode === 'AMOUNT_MINIMAL_ERROR' ||
                errorCode === 'INTERNAL_ERROR' ||
                /Can not get estimate/i.test(errorMessage)
            )) {
                res.status(invoiceResponse.status).json({
                    error: {
                        message: errorMessage,
                        code: errorCode,
                    },
                });
                return;
            }
        }
    } catch (error) {
        lastErrorMessage = 'Failed to call NowPayments invoice API';
        lastErrorCode = 'INTERNAL_ERROR';
        lastStatus = 502;
    }

    for (const payCurrency of payCurrencies) {
        const minAmount = await fetchMinimumAmount(apiBase, apiKey, priceCurrency, payCurrency, price);
        const adjustedAmount = minAmount && minAmount > price ? minAmount : price;
        const priceAmount = normalizeAmount(adjustedAmount, 2);

        const nowPaymentsPayload = {
            price_amount: priceAmount,
            price_currency: priceCurrency,
            pay_currency: payCurrency,
            order_id: orderId,
            order_description: `Subscription ${payload.tier}`,
            ipn_callback_url: `${baseUrl}/api/webhook`,
            success_url: payload.successUrl || baseUrl,
            cancel_url: payload.cancelUrl || baseUrl,
        };

        const response = await fetch(`${apiBase}/v1/payment`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
            },
            body: JSON.stringify(nowPaymentsPayload),
        });

        if (!response.ok) {
            const contentType = response.headers.get('content-type') || '';
            let errorMessage = 'NowPayments error';
            let errorCode: string | undefined;

            if (contentType.includes('application/json')) {
                const payload = (await response.json()) as Record<string, unknown>;
                if (typeof payload.message === 'string') {
                    errorMessage = payload.message;
                }
                if (typeof payload.code === 'string') {
                    errorCode = payload.code;
                }
            } else {
                const text = await response.text();
                if (text) {
                    errorMessage = text;
                }
            }

            if ((response.status === 401 || response.status === 403) && !errorCode) {
                errorCode = 'INVALID_API_KEY';
            }

            lastErrorMessage = errorMessage;
            lastErrorCode = errorCode;
            lastStatus = response.status;

            // treat some errors as recoverable: try next currency
            if (
                errorCode === 'CURRENCY_UNAVAILABLE' ||
                errorCode === 'AMOUNT_MINIMAL_ERROR' ||
                errorCode === 'INTERNAL_ERROR' ||
                /Can not get estimate/i.test(errorMessage)
            ) {
                continue;
            }

            res.status(response.status).json({
                error: {
                    message: errorMessage,
                    code: errorCode,
                },
            });
            return;
        }

        let data: Record<string, unknown> | null = null;
        try {
            data = (await response.json()) as Record<string, unknown>;
        } catch (err) {
            lastErrorMessage = 'Failed to parse NowPayments JSON response';
            lastStatus = 502;
            continue;
        }

        const paymentUrl =
            (typeof data.payment_url === 'string' && data.payment_url) ||
            (typeof data.invoice_url === 'string' && data.invoice_url) ||
            (typeof (data as any).invoiceUrl === 'string' && (data as any).invoiceUrl) ||
            (typeof data.url === 'string' && data.url) ||
            (typeof data.redirect_url === 'string' && data.redirect_url) ||
            (typeof (data as any).redirectUrl === 'string' && (data as any).redirectUrl) ||
            '';

        const paymentId = typeof data.payment_id === 'string' ? data.payment_id : null;

        if (!paymentUrl) {
            // keep body for diagnostics and try next currency
            lastErrorMessage = `NowPayments response missing payment_url; body=${JSON.stringify(data)}`;
            lastStatus = 502;
            continue;
        }

        res.status(200).json({
            paymentUrl,
            orderId,
            paymentId,
        });
        return;
    }

    res.status(lastStatus).json({
        error: {
            message: lastErrorMessage,
            code: lastErrorCode,
        },
    });
}
