import { createClient } from '@supabase/supabase-js';

type ApiRequest = {
    method?: string;
    headers: Record<string, string | string[] | undefined>;
    body?: string | Record<string, unknown> | null;
};

type ApiResponse = {
    status: (code: number) => ApiResponse;
    json: (data: unknown) => void;
    send: (data: string) => void;
    setHeader: (name: string, value: string) => void;
};

type ChatMessage = {
    role: 'system' | 'user' | 'assistant';
    content: string;
};

type GatewayPayload = {
    model?: string;
    messages: ChatMessage[];
    temperature?: number;
    max_tokens?: number;
    response_format?: unknown;
};

type RateLimitEntry = { count: number; resetAt: number };

const rateLimits = new Map<string, RateLimitEntry>();
const MAX_CONTEXT_CHARS = 180_000;
const MAX_MESSAGES = 80;
const REQUEST_TIMEOUT_MS = 45_000;

const header = (headers: ApiRequest['headers'], name: string): string => {
    const value = headers[name] ?? headers[name.toLowerCase()];
    return Array.isArray(value) ? String(value[0] || '') : String(value || '');
};

const parsePositiveInt = (value: string | undefined, fallback: number): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

const checkRateLimit = (userId: string): { limited: boolean; retryAfterSeconds: number } => {
    const now = Date.now();
    const windowMs = 60_000;
    const maxRequests = parsePositiveInt(process.env.AI_GATEWAY_REQUESTS_PER_MINUTE, 30);
    const current = rateLimits.get(userId);
    if (!current || current.resetAt <= now) {
        rateLimits.set(userId, { count: 1, resetAt: now + windowMs });
        return { limited: false, retryAfterSeconds: 0 };
    }
    if (current.count >= maxRequests) {
        return { limited: true, retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
    }
    current.count += 1;
    return { limited: false, retryAfterSeconds: 0 };
};

const parsePayload = (body: ApiRequest['body']): GatewayPayload | null => {
    if (!body) return null;
    const raw = typeof body === 'string' ? JSON.parse(body) : body;
    if (!raw || typeof raw !== 'object') return null;
    const value = raw as Record<string, unknown>;
    if (!Array.isArray(value.messages) || value.messages.length === 0 || value.messages.length > MAX_MESSAGES) return null;
    const messages: ChatMessage[] = [];
    let totalChars = 0;
    for (const candidate of value.messages) {
        if (!candidate || typeof candidate !== 'object') return null;
        const message = candidate as Record<string, unknown>;
        if (!['system', 'user', 'assistant'].includes(String(message.role))) return null;
        if (typeof message.content !== 'string') return null;
        totalChars += message.content.length;
        if (totalChars > MAX_CONTEXT_CHARS) return null;
        messages.push({ role: message.role as ChatMessage['role'], content: message.content });
    }
    return {
        model: typeof value.model === 'string' ? value.model : undefined,
        messages,
        temperature: typeof value.temperature === 'number' ? value.temperature : undefined,
        max_tokens: typeof value.max_tokens === 'number' ? value.max_tokens : undefined,
        response_format: value.response_format,
    };
};

const resolveModel = (requested?: string): string => {
    const defaultModel = process.env.OPENROUTER_MODEL || 'nvidia/nemotron-3-ultra-550b-a55b:free';
    const allowed = new Set(
        (process.env.OPENROUTER_ALLOWED_MODELS || defaultModel)
            .split(',')
            .map(value => value.trim())
            .filter(Boolean),
    );
    return requested && allowed.has(requested) ? requested : defaultModel;
};

const configureCors = (req: ApiRequest, res: ApiResponse): boolean => {
    const origin = header(req.headers, 'origin');
    if (!origin) return true;
    const host = header(req.headers, 'x-forwarded-host') || header(req.headers, 'host');
    const sameOrigin = (() => {
        try { return new URL(origin).host === host; } catch { return false; }
    })();
    const allowed = new Set((process.env.AI_GATEWAY_ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean));
    const allowedElectronOrigin = origin === 'null' && process.env.AI_GATEWAY_ALLOW_NULL_ORIGIN === 'true';
    if (!sameOrigin && !allowed.has(origin) && !allowedElectronOrigin) return false;
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    return true;
};

export default async function handler(req: ApiRequest, res: ApiResponse) {
    if (!configureCors(req, res)) {
        res.status(403).send('Origin is not allowed');
        return;
    }
    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST, OPTIONS');
        res.status(405).send('Method Not Allowed');
        return;
    }

    const openRouterKey = process.env.OPENROUTER_API_KEY;
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseServerKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!openRouterKey || !supabaseUrl || !supabaseServerKey) {
        res.status(503).send('AI gateway is not configured');
        return;
    }

    const authorization = header(req.headers, 'authorization');
    const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
    if (!token) {
        res.status(401).send('Authentication required');
        return;
    }

    const supabase = createClient(supabaseUrl, supabaseServerKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData.user) {
        res.status(401).send('Invalid or expired session');
        return;
    }

    const limit = checkRateLimit(authData.user.id);
    if (limit.limited) {
        res.setHeader('Retry-After', String(limit.retryAfterSeconds));
        res.status(429).send('AI request limit exceeded');
        return;
    }

    let payload: GatewayPayload | null = null;
    try {
        payload = parsePayload(req.body);
    } catch {
        res.status(400).send('Invalid JSON payload');
        return;
    }
    if (!payload) {
        res.status(400).send('Invalid AI request');
        return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        const providerPayload: Record<string, unknown> = {
            model: resolveModel(payload.model),
            messages: payload.messages,
            temperature: Math.max(0, Math.min(1, payload.temperature ?? 0.2)),
            max_tokens: Math.max(128, Math.min(5000, Math.floor(payload.max_tokens ?? 2500))),
        };
        if (payload.response_format && typeof payload.response_format === 'object') {
            providerPayload.response_format = payload.response_format;
        }
        const providerResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${openRouterKey}`,
                'Content-Type': 'application/json',
                ...(process.env.OPENROUTER_SITE_URL ? { 'HTTP-Referer': process.env.OPENROUTER_SITE_URL } : {}),
                ...(process.env.OPENROUTER_SITE_NAME ? { 'X-Title': process.env.OPENROUTER_SITE_NAME } : {}),
            },
            body: JSON.stringify(providerPayload),
            signal: controller.signal,
        });
        if (!providerResponse.ok) {
            const retryAfter = providerResponse.headers.get('Retry-After');
            if (retryAfter) res.setHeader('Retry-After', retryAfter);
            res.status(providerResponse.status === 429 ? 429 : 502).send('AI provider request failed');
            return;
        }
        const responseBody = await providerResponse.json();
        res.status(200).json(responseBody);
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            res.status(504).send('AI provider timed out');
            return;
        }
        res.status(502).send('AI provider is unavailable');
    } finally {
        clearTimeout(timeout);
    }
}
