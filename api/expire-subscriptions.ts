import { createClient } from '@supabase/supabase-js';

type ApiRequest = {
    method?: string;
};

type ApiResponse = {
    status: (code: number) => ApiResponse;
    json: (data: Record<string, unknown>) => void;
    send: (data: string) => void;
    setHeader: (name: string, value: string) => void;
};

export default async function handler(req: ApiRequest, res: ApiResponse) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        res.status(405).send('Method Not Allowed');
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

    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
        .from('user_subscriptions')
        .update({
            status: 'expired',
            subscription_tier: 'free',
            updated_at: nowIso,
        })
        .eq('status', 'active')
        .not('expires_at', 'is', null)
        .lt('expires_at', nowIso)
        .select('user_id');

    if (error) {
        res.status(500).send('Failed to expire subscriptions');
        return;
    }

    res.status(200).json({ ok: true, expired: data?.length ?? 0 });
}