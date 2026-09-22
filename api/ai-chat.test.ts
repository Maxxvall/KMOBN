import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ getUser: vi.fn() }));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ auth: { getUser: auth.getUser } })),
}));

const createResponseRecorder = () => {
  const state: { status?: number; body?: unknown; headers: Record<string, string> } = { headers: {} };
  const response = {
    status(code: number) { state.status = code; return response; },
    json(data: unknown) { state.body = data; },
    send(data: string) { state.body = data; },
    setHeader(name: string, value: string) { state.headers[name] = value; },
  };
  return { state, response };
};

describe('AI gateway', () => {
  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = 'server-secret';
    process.env.OPENROUTER_MODEL = 'allowed-model';
    process.env.OPENROUTER_ALLOWED_MODELS = 'allowed-model';
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'server-role';
    auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_MODEL;
    delete process.env.OPENROUTER_ALLOWED_MODELS;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  it('validates the Supabase token and forwards a bounded request with the server key', async () => {
    const providerResponse = { choices: [{ message: { content: '{}' } }] };
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => ({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => providerResponse,
    } as Response));
    vi.stubGlobal('fetch', fetchMock);
    const { default: handler } = await import('./ai-chat');
    const { state, response } = createResponseRecorder();

    await handler({
      method: 'POST',
      headers: { authorization: 'Bearer user-token' },
      body: {
        model: 'unapproved-model',
        messages: [{ role: 'user', content: 'Составь смету' }],
        temperature: 5,
        max_tokens: 99_999,
      },
    }, response);

    expect(auth.getUser).toHaveBeenCalledWith('user-token');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer server-secret');
    const forwarded = JSON.parse(String(init?.body));
    expect(forwarded.model).toBe('allowed-model');
    expect(forwarded.temperature).toBe(1);
    expect(forwarded.max_tokens).toBe(5000);
    expect(state.status).toBe(200);
    expect(state.body).toEqual(providerResponse);
  });

  it('rejects requests without a user token before contacting the provider', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { default: handler } = await import('./ai-chat');
    const { state, response } = createResponseRecorder();

    await handler({ method: 'POST', headers: {}, body: { messages: [{ role: 'user', content: 'test' }] } }, response);

    expect(state.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
