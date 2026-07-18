import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { OFFLINE_TABLES, startMockSupabaseServer } from './mockSupabaseServer';

const projectRoot = process.cwd();

const launchApp = async (userDataDir: string, initialOffline: boolean): Promise<{ app: ElectronApplication; page: Page }> => {
  const app = await electron.launch({
    args: [projectRoot],
    cwd: projectRoot,
    env: {
      ...process.env,
      KMOBN_E2E: '1',
      KMOBN_E2E_USER_DATA_DIR: userDataDir,
      KMOBN_E2E_INITIAL_OFFLINE: initialOffline ? '1' : '0',
    },
  });
  if (initialOffline) await app.context().setOffline(true);
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  return { app, page };
};

test('persists an offline material across Electron restart and syncs push before pull', async () => {
  const mock = await startMockSupabaseServer();
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kmobn-electron-e2e-'));
  let firstApp: ElectronApplication | null = null;
  let secondApp: ElectronApplication | null = null;

  try {
    const first = await launchApp(userDataDir, false);
    firstApp = first.app;

    await first.page.getByRole('button', { name: 'Войти', exact: true }).first().click();
    const loginDialog = first.page.getByRole('dialog');
    await loginDialog.locator('input[autocomplete="email"]').fill('offline@example.test');
    await loginDialog.locator('input[autocomplete="current-password"]').fill('password');
    await loginDialog.getByRole('button', { name: 'Войти', exact: true }).click();

    await expect(first.page.getByTestId('offline-readiness').first()).toContainText('Офлайн готово');
    const initiallyFetched = new Set(
      mock.logs.filter(log => log.method === 'GET' && log.table && OFFLINE_TABLES.includes(log.table as typeof OFFLINE_TABLES[number])).map(log => log.table),
    );
    expect(initiallyFetched).toEqual(new Set(OFFLINE_TABLES));

    await first.page.getByRole('button', { name: 'Цены', exact: true }).first().click();
    const backgroundSyncLogStart = mock.logs.length;
    await first.page.getByPlaceholder('Наименование материала').fill('Материал из фоновой синхронизации');
    await first.page.getByPlaceholder('Цена (₽)').fill('777');
    await first.page.getByRole('button', { name: 'Добавить', exact: true }).click();
    await expect(first.page.getByText('Материал из фоновой синхронизации', { exact: true }).first()).toBeVisible();
    await expect.poll(() => mock.logs.slice(backgroundSyncLogStart).some(log => log.method === 'POST' && log.table === 'materials')).toBe(true);
    await expect(first.page.getByTestId('offline-readiness').first()).toContainText('Офлайн готово');
    expect(mock.logs.slice(backgroundSyncLogStart).some(log => log.method === 'GET' && log.table && OFFLINE_TABLES.includes(log.table as typeof OFFLINE_TABLES[number]))).toBe(false);

    await first.app.context().setOffline(true);
    await first.page.getByRole('button', { name: 'Цены', exact: true }).first().click();
    await first.page.getByPlaceholder('Наименование материала').fill('Материал из оффлайна');
    await first.page.getByPlaceholder('Цена (₽)').fill('1234');
    await first.page.getByRole('button', { name: 'Добавить', exact: true }).click();
    await expect(first.page.getByText('Материал из оффлайна', { exact: true }).first()).toBeVisible();
    await expect(first.page.getByTestId('sync-pending-count')).toContainText('1');

    await first.app.close();
    firstApp = null;

    const second = await launchApp(userDataDir, true);
    secondApp = second.app;
    await expect(second.page.getByRole('button', { name: 'Цены', exact: true }).first()).toBeVisible();
    const offlineSeedIds = await second.page.evaluate(async tables => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('kmobn_indexeddb_cache');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      return Promise.all(tables.map(table => new Promise<string[]>((resolve, reject) => {
        const request = database.transaction(table, 'readonly').objectStore(table).getAll();
        request.onsuccess = () => resolve((request.result as Array<{ id: string }>).map(row => row.id));
        request.onerror = () => reject(request.error);
      })));
    }, [...OFFLINE_TABLES]);
    expect(offlineSeedIds.map(ids => ids.some(id => id.startsWith('seed-')))).toEqual(OFFLINE_TABLES.map(() => true));
    await second.page.getByRole('button', { name: 'Цены', exact: true }).first().click();
    await expect(second.page.getByText('Материал из оффлайна', { exact: true }).first()).toBeVisible();
    await expect(second.page.getByTestId('sync-pending-count')).toContainText('1');
    await expect(second.page.getByTestId('offline-readiness').first()).toContainText('Офлайн готово');

    const reconnectLogStart = mock.logs.length;
    await second.app.context().setOffline(false);

    await expect.poll(() => mock.logs.slice(reconnectLogStart).some(log => log.method === 'POST' && log.table === 'materials')).toBe(true);
    await expect(second.page.getByTestId('sync-pending-count')).toHaveCount(0);
    await expect(second.page.getByTestId('offline-readiness').first()).toContainText('Офлайн готово');
    await expect(second.page.getByText(/Данные синхронизированы \(1\)/)).toBeVisible();

    const reconnectLogs = mock.logs.slice(reconnectLogStart);
    const pushIndex = reconnectLogs.findIndex(log => log.method === 'POST' && log.table === 'materials');
    const pullIndex = reconnectLogs.findIndex((log, index) => index > pushIndex && log.method === 'GET' && log.table === 'materials');
    expect(pushIndex).toBeGreaterThanOrEqual(0);
    expect(pullIndex).toBeGreaterThan(pushIndex);
    expect(mock.rows.materials.some(row => row.payload?.name === 'Материал из оффлайна')).toBe(true);
  } finally {
    await firstApp?.close().catch(() => undefined);
    await secondApp?.close().catch(() => undefined);
    await mock.close();
    await fs.rm(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(() => undefined);
  }
});
