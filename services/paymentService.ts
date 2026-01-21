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

export const createPayment = async (payload: CreatePaymentRequest): Promise<CreatePaymentResponse> => {
    const response = await fetch('/api/create-payment', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(text || 'Failed to create payment');
    }

    const data = (await response.json()) as CreatePaymentResponse;
    if (!data?.paymentUrl) {
        throw new Error('Payment URL missing');
    }
    return data;
};
