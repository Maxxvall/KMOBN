import { createHmac, timingSafeEqual } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import type { SubscriptionTier } from '../types';

type ApiRequest = {
    method?: string;
    headers: Record<string, string | string[] | undefined>;
    body?: string | Record<string, unknown> | null;
    on?: (event: 'data' | 'end' | 'error', listener: (chunk?: Buffer | string) => void) => void;
};

type ApiResponse = {
    status: (code: number) => ApiResponse;
    json: (data: Record<string, unknown>) => void;
    send: (data: string) => void;
};

type NowPaymentsPayload = {
    payment_status?: string;
    status?: string;
    order_id?: string;
    payment_id?: string;
    price_amount?: number;
    price_currency?: string;
    pay_currency?: string;
    actually_paid?: number;
    outcome_amount?: number;
    outcome_currency?: string;
    [key: string]: unknown;
};

const resolveHeader = (headers: Record<string, string | string[] | undefined>, key: string): string | undefined => {
    const value = headers[key] ?? headers[key.toLowerCase()];
    if (Array.isArray(value)) return value[0];
    return value;
};

const readRawBody = (req: ApiRequest): Promise<Buffer> => {
    return new Promise((resolve, reject) => {
        if (req.on) {
            const chunks: Buffer[] = [];
            req.on('data', chunk => {
                if (typeof chunk === 'string') chunks.push(Buffer.from(chunk));
                else if (chunk instanceof Buffer) chunks.push(chunk);
            });
            req.on('end', () => resolve(Buffer.concat(chunks)));
            req.on('error', () => reject(new Error('Stream error')));
            return;
        }

        const fallback = typeof req.body === 'string'
            ? req.body
            : JSON.stringify(req.body ?? {});
        resolve(Buffer.from(fallback));
    });
};

const parseOrder = (orderId?: string): { tier: SubscriptionTier; userId: string } | null => {
    if (!orderId) return null;
    const match = orderId.match(/^sub_(free|basic|premium)_(.+?)_\d+$/i);
    if (!match) return null;
    return { tier: match[1] as SubscriptionTier, userId: match[2] };
};

const addDays = (days: number): string => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString();
};

export default async function handler(req: ApiRequest, res: ApiResponse) {
    if (req.method !== 'POST') {
        res.status(405).send('Method Not Allowed');
        return;
    }

    const ipnSecret = process.env.NOWPAYMENTS_IPN_SECRET;
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!ipnSecret || !supabaseUrl || !supabaseKey) {
        res.status(500).send('Missing server configuration');
        return;
    }

    let rawBody: Buffer;
    try {
        rawBody = await readRawBody(req);
    } catch (error) {
        res.status(400).send('Invalid body');
        return;
    }

    const signature = resolveHeader(req.headers, 'x-nowpayments-sig');
    if (!signature) {
        res.status(403).send('Missing signature');
        return;
    }

    const expected = createHmac('sha512', ipnSecret).update(rawBody).digest('hex');
    const expectedBuf = Buffer.from(expected, 'utf8');
    const actualBuf = Buffer.from(signature, 'utf8');

    if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
        res.status(403).send('Invalid signature');
        return;
    }

    let payload: NowPaymentsPayload;
    try {
        payload = JSON.parse(rawBody.toString('utf8')) as NowPaymentsPayload;
    } catch (error) {
        res.status(400).send('Invalid JSON');
        return;
    }

    const status = String(payload.payment_status || payload.status || '').toLowerCase();
    const orderInfo = parseOrder(payload.order_id);

    if (!orderInfo) {
        res.status(400).send('Invalid order_id');
        return;
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    });

    const paymentId = payload.payment_id || null;
    const amount = typeof payload.price_amount === 'number'
        ? payload.price_amount
        : typeof payload.actually_paid === 'number'
            ? payload.actually_paid
            : typeof payload.outcome_amount === 'number'
                ? payload.outcome_amount
                : null;
    const currency = payload.price_currency || payload.pay_currency || payload.outcome_currency || null;

    if (paymentId) {
        await supabase.from('payment_history').upsert({
            user_id: orderInfo.userId,
            payment_id: paymentId,
            order_id: payload.order_id || '',
            amount: amount ?? 0,
            currency: currency ?? 'USD',
            status: status || 'unknown',
            subscription_tier: orderInfo.tier,
            nowpayments_data: payload,
        }, { onConflict: 'payment_id' });
    }

    if (status !== 'finished') {
        res.status(200).json({ ok: true, status });
        return;
    }

    const expiresAt = orderInfo.tier === 'free' ? null : addDays(30);

    const { error } = await supabase
        .from('user_subscriptions')
        .update({
            subscription_tier: orderInfo.tier,
            status: 'active',
            started_at: new Date().toISOString(),
            expires_at: expiresAt,
            last_payment_id: paymentId,
            last_payment_amount: amount,
            last_payment_currency: currency,
            last_payment_date: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        })
        .eq('user_id', orderInfo.userId);

    if (error) {
        res.status(500).send('Failed to update subscription');
        return;
    }

    res.status(200).json({ ok: true });
}
