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

const PRICE_BY_TIER: Record<SubscriptionTier, number> = {
    free: 0,
    basic: 3,
    premium: 10,
};

const DEFAULT_PRICE_CURRENCY = 'usd';
const DEFAULT_PAY_CURRENCIES = ['usdttrc20', 'usdt', 'btc', 'eth'];

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

    const price = PRICE_BY_TIER[payload.tier];
    const proto = resolveHeader(req.headers, 'x-forwarded-proto') || 'https';
    const host = resolveHeader(req.headers, 'x-forwarded-host') || resolveHeader(req.headers, 'host');
    const baseUrl = host ? `${proto}://${host}` : '';
    const orderId = `sub_${payload.tier}_${payload.userId}_${Date.now()}`;

    const priceCurrency = resolvePriceCurrency();
    const payCurrencies = resolvePayCurrencies();

    const apiBase = sandboxMode ? 'https://api-sandbox.nowpayments.io' : 'https://api.nowpayments.io';
    let lastErrorMessage = 'NowPayments error';
    let lastErrorCode: string | undefined;
    let lastStatus = 502;

    for (const payCurrency of payCurrencies) {
        const nowPaymentsPayload = {
            price_amount: price,
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

            if (errorCode === 'CURRENCY_UNAVAILABLE') {
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

        const data = (await response.json()) as Record<string, unknown>;
        const paymentUrl = typeof data.payment_url === 'string' ? data.payment_url : '';
        const paymentId = typeof data.payment_id === 'string' ? data.payment_id : null;

        if (!paymentUrl) {
            res.status(502).send('NowPayments response missing payment_url');
            return;
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
