import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

export const OFFLINE_TABLES = [
  'estimates',
  'templates',
  'materials',
  'works',
  'bundles',
  'salary_calculations',
] as const;

type OfflineTable = typeof OFFLINE_TABLES[number];
type StoredRow = Record<string, unknown> & { id?: string; user_id?: string; payload?: Record<string, unknown> };

export type RequestLog = {
  method: string;
  path: string;
  table: string | null;
  at: number;
};

const USER_ID = '00000000-0000-4000-8000-000000000001';
const USER_EMAIL = 'offline@example.test';

const base64Url = (value: object): string => Buffer.from(JSON.stringify(value)).toString('base64url');
const accessToken = [
  base64Url({ alg: 'none', typ: 'JWT' }),
  base64Url({ sub: USER_ID, email: USER_EMAIL, role: 'authenticated', aud: 'authenticated', exp: 4_102_444_800 }),
  'e2e',
].join('.');

const user = {
  id: USER_ID,
  aud: 'authenticated',
  role: 'authenticated',
  email: USER_EMAIL,
  email_confirmed_at: '2026-07-13T00:00:00.000Z',
  user_metadata: { full_name: 'Offline E2E' },
  app_metadata: { provider: 'email', providers: ['email'] },
  created_at: '2026-07-13T00:00:00.000Z',
  updated_at: '2026-07-13T00:00:00.000Z',
};

const subscription = {
  id: '00000000-0000-4000-8000-000000000002',
  user_id: USER_ID,
  subscription_tier: 'premium',
  status: 'active',
  started_at: '2026-07-13T00:00:00.000Z',
  expires_at: null,
  ai_requests_today: 0,
  last_ai_request_date: '2026-07-13',
  estimates_deleted_this_month: 0,
  limits_reset_date: '2026-07-13',
  updated_at: '2026-07-13T00:00:00.000Z',
};

const readBody = async (request: IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  if (!chunks.length) return null;
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
};

const sendJson = (response: ServerResponse, status: number, body: unknown, extraHeaders: Record<string, string> = {}) => {
  response.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'Content-Type': 'application/json',
    ...extraHeaders,
  });
  response.end(JSON.stringify(body));
};

export const startMockSupabaseServer = async (port = 54329) => {
  const logs: RequestLog[] = [];
  const rows: Record<OfflineTable, StoredRow[]> = Object.fromEntries(
    OFFLINE_TABLES.map(table => [table, []]),
  ) as Record<OfflineTable, StoredRow[]>;
  rows.estimates.push({ id: 'seed-estimate', user_id: USER_ID, payload: {
    id: 'seed-estimate', estimateNumber: 'KM-E2E-001', client: 'Клиент E2E', date: '2026-07-13',
    status: 'Черновик', version: 1, items: [], total: 0, buildingType: 'Каркасный дом', area: 100,
  } });
  rows.templates.push({ id: 'seed-template', user_id: USER_ID, payload: { id: 'seed-template', name: 'Шаблон E2E', baseArea: 100, items: [] } });
  rows.materials.push({ id: 'seed-material', user_id: USER_ID, payload: { id: 'seed-material', name: 'Материал E2E', price: 100, lastUpdated: '2026-07-13T00:00:00.000Z', category: 'ФУНДАМЕНТ' } });
  rows.works.push({ id: 'seed-work', user_id: USER_ID, payload: { id: 'seed-work', name: 'Работа E2E', price: 200, category: 'ФУНДАМЕНТ' } });
  rows.bundles.push({ id: 'seed-bundle', user_id: USER_ID, payload: { id: 'seed-bundle', name: 'Комплект E2E', items: [], category: 'ФУНДАМЕНТ' } });
  rows.salary_calculations.push({ id: 'seed-salary', user_id: USER_ID, payload: { id: 'seed-salary', estimateId: 'seed-estimate', estimateNumber: 'KM-E2E-001', workers: [], workAllocations: [], createdDate: '2026-07-13' } });

  const server = createServer(async (request, response) => {
    const method = request.method ?? 'GET';
    const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`);
    const table = url.pathname.startsWith('/rest/v1/') ? url.pathname.slice('/rest/v1/'.length) : null;
    logs.push({ method, path: `${url.pathname}${url.search}`, table, at: Date.now() });

    if (method === 'OPTIONS') {
      response.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
      });
      response.end();
      return;
    }

    if (url.pathname === '/auth/v1/token' && method === 'POST') {
      sendJson(response, 200, {
        access_token: accessToken,
        token_type: 'bearer',
        expires_in: 2_147_483_647,
        expires_at: 4_102_444_800,
        refresh_token: 'e2e-refresh-token',
        user,
      });
      return;
    }
    if (url.pathname === '/auth/v1/user' && method === 'GET') {
      sendJson(response, 200, user);
      return;
    }
    if (url.pathname === '/auth/v1/logout') {
      sendJson(response, 204, null);
      return;
    }

    if (table === 'user_subscriptions') {
      const wantsObject = String(request.headers.accept ?? '').includes('application/vnd.pgrst.object+json');
      if (method === 'GET') {
        sendJson(response, 200, wantsObject ? subscription : [subscription], { 'Content-Range': '0-0/1' });
        return;
      }
      const body = await readBody(request);
      sendJson(response, 200, wantsObject ? { ...subscription, ...(body as object) } : [{ ...subscription, ...(body as object) }]);
      return;
    }

    if (table && OFFLINE_TABLES.includes(table as OfflineTable)) {
      const offlineTable = table as OfflineTable;
      if (method === 'GET') {
        const offset = Math.max(0, Number(url.searchParams.get('offset') ?? 0));
        const limit = Math.max(1, Number(url.searchParams.get('limit') ?? 1000));
        const page = rows[offlineTable].slice(offset, offset + limit);
        sendJson(response, 200, page, {
          'Content-Range': page.length ? `${offset}-${offset + page.length - 1}/${rows[offlineTable].length}` : `*/${rows[offlineTable].length}`,
        });
        return;
      }
      if (method === 'POST') {
        const body = await readBody(request);
        const incoming = (Array.isArray(body) ? body : [body]) as StoredRow[];
        for (const next of incoming) {
          const index = rows[offlineTable].findIndex(current => current.id === next.id && current.user_id === next.user_id);
          if (index >= 0) rows[offlineTable][index] = next;
          else rows[offlineTable].push(next);
        }
        sendJson(response, 201, incoming, { 'Content-Range': `0-${Math.max(0, incoming.length - 1)}/${incoming.length}` });
        return;
      }
      if (method === 'DELETE') {
        const ids = (url.searchParams.get('id') ?? '').replace(/^in\.\(|\)$/g, '').split(',').filter(Boolean);
        rows[offlineTable] = rows[offlineTable].filter(row => !row.id || !ids.includes(String(row.id)));
        sendJson(response, 200, []);
        return;
      }
    }

    sendJson(response, 404, { message: `Unhandled mock route: ${method} ${url.pathname}` });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve());
  });

  return {
    logs,
    rows,
    user,
    close: () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())),
  };
};
