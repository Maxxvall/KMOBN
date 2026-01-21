import { SubscriptionTier } from '../types';

export type CreatePaymentRequest = {
    tier: SubscriptionTier;
    userId: string;
    successUrl?: string;
    cancelUrl?: string;
};

export type CreatePaymentResponse = {
    paymentUrl: string;
    orderId: string;
    paymentId?: string | null;
};

type PaymentErrorResponse = {
    error?: {
        message?: string;
        code?: string;
    };
    message?: string;
    code?: string;
};

export const createPayment = async (payload: CreatePaymentRequest): Promise<CreatePaymentResponse> => {
    const response = await fetch('/api/create-payment', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const contentType = response.headers.get('content-type') || '';
        let errorMessage = 'Failed to create payment';
        let errorCode: string | undefined;

        if (contentType.includes('application/json')) {
            const payload = (await response.json()) as PaymentErrorResponse;
            errorMessage = payload.error?.message || payload.message || errorMessage;
            errorCode = payload.error?.code || payload.code;
        } else {
            const text = await response.text();
            if (text) {
                errorMessage = text;
            }
        }

        const err = new Error(errorMessage) as Error & { code?: string };
        if (errorCode) {
            err.code = errorCode;
        }
        throw err;
    }

    const data = (await response.json()) as CreatePaymentResponse;
    if (!data?.paymentUrl) {
        throw new Error('Payment URL missing');
    }
    return data;
};
