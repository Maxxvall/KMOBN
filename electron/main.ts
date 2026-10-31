// eslint-disable-next-line @typescript-eslint/no-require-imports
const { app, BrowserWindow, ipcMain, nativeTheme, shell, session } = require('electron') as typeof import('electron');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { pathToFileURL } = require('url');

import type { BrowserWindow as ElectronBrowserWindow } from 'electron';
import type { AppUpdater } from 'electron-updater';

const IS_E2E = process.env.KMOBN_E2E === '1';
const e2eUserDataDir = process.env.KMOBN_E2E_USER_DATA_DIR;
if (IS_E2E && e2eUserDataDir) {
  fs.mkdirSync(e2eUserDataDir, { recursive: true });
  app.setPath('userData', e2eUserDataDir);
  app.setPath('sessionData', path.join(e2eUserDataDir, 'session'));
}

// Structural view of the lazily imported electron-store instance: only
// get/set are used through the IPC handlers.
let store: { get(key: string): unknown; set(key: string, value: unknown): void } | null = null;
let mainWindow: ElectronBrowserWindow | null = null;
let autoUpdater: AppUpdater | null = null;
let pendingAuthUrl: string | null = null;

const LOG_FILE = path.join(app.getPath('userData'), 'app.log');
const PROTOCOL_NAME = 'karkasmaster';

function log(...args: unknown[]) {
  const msg = `[${new Date().toISOString()}] ${args.join(' ')}\n`;
  console.log(...args);
  try { fs.appendFileSync(LOG_FILE, msg); } catch {}
}

function getDistPath() {
  return path.join(__dirname, '../dist');
}

function openExternalUrl(url: string) {
  let parsed;
  try {
    parsed = new URL(String(url));
  } catch {
    return Promise.resolve(false);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    log('Blocked external URL with unsupported protocol:', parsed.protocol);
    return Promise.resolve(false);
  }
  return shell.openExternal(parsed.toString()).then(() => true).catch((e: unknown) => {
    log('Failed to open external URL:', e instanceof Error ? e.message : String(e));
    return false;
  });
}

function sendAuthToRenderer(url: string) {
  try {
    const parsed = new URL(url);
    log('Auth callback received:', `${parsed.protocol}//${parsed.host}${parsed.pathname}`);
  } catch {
    log('Auth callback received (invalid URL)');
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    mainWindow.webContents.send('auth-callback', url);
  } else {
    pendingAuthUrl = url;
    log('Window not ready, saved pending auth URL');
  }
}

async function initStore() {
  try {
    const { default: Store } = await import('electron-store');
    store = new Store();
    log('Store initialized');
  } catch (e: unknown) {
    log('Store init error:', e instanceof Error ? e.message : String(e));
  }
}

async function initAutoUpdater() {
  try {
    const { autoUpdater: updater } = await import('electron-updater');
    autoUpdater = updater;
    autoUpdater.logger = console;
    autoUpdater.autoDownload = false;

    autoUpdater.on('error', (error) => {
      log('Auto-update error:', error.message || String(error));
      if (mainWindow) {
        mainWindow.webContents.send('update-error', error.message || String(error));
      }
    });

    autoUpdater.on('update-available', (info) => {
      log('Update available:', info.version);
      if (mainWindow) {
        mainWindow.webContents.send('update-available', { version: info.version });
      }
    });

    autoUpdater.on('update-not-available', () => {
      log('Update not available. Current version is latest.');
      if (mainWindow) {
        mainWindow.webContents.send('update-not-available');
      }
    });

    autoUpdater.on('download-progress', (progress) => {
      if (mainWindow) {
        mainWindow.webContents.send('update-download-progress', {
          percent: progress.percent,
          bytesPerSecond: progress.bytesPerSecond,
          transferred: progress.transferred,
          total: progress.total,
        });
      }
    });

    autoUpdater.on('update-downloaded', (info) => {
      log('Update downloaded:', info.version);
      if (mainWindow) {
        mainWindow.webContents.send('update-downloaded', { version: info.version });
      }
    });
  } catch (e: unknown) {
    log('Auto-updater init error:', e instanceof Error ? e.message : String(e));
  }
}

function createWindow() {
  const distPath = getDistPath();
  const indexPath = path.join(distPath, 'index.html');
  const iconPath = path.join(__dirname, '../public/icon.png');

  log('=== Creating window ===');
  log('Index exists:', fs.existsSync(indexPath));

  try {
    const win = new BrowserWindow({
      width: 1400,
      height: 900,
      minWidth: 1024,
      minHeight: 768,
      icon: iconPath,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
      titleBarStyle: 'hiddenInset',
      backgroundColor: '#111827',
      show: false,
    });
    mainWindow = win;

    win.loadFile(indexPath);
    const trustedIndexUrl = new URL(pathToFileURL(indexPath).toString());
    const isTrustedAppNavigation = (targetUrl: string) => {
      try {
        const target = new URL(targetUrl);
        return target.protocol === trustedIndexUrl.protocol && target.pathname === trustedIndexUrl.pathname;
      } catch {
        return false;
      }
    };
    win.webContents.setWindowOpenHandler(({ url }) => {
      void openExternalUrl(url);
      return { action: 'deny' };
    });
    win.webContents.on('will-navigate', (event, url) => {
      if (isTrustedAppNavigation(url)) return;
      event.preventDefault();
      void openExternalUrl(url);
    });

    win.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
      log('did-fail-load:', errorCode, errorDescription, validatedURL);
    });

    win.webContents.on('render-process-gone', (event, details) => {
      log('render-process-gone:', details.reason, details.exitCode);
    });

    win.webContents.on('console-message', (event, level, message) => {
      log(`[renderer L${level}]:`, message);
    });

    win.once('ready-to-show', () => {
      log('Window ready-to-show');
      win.show();

      if (pendingAuthUrl) {
        log('Sending pending auth URL');
        win.webContents.send('auth-callback', pendingAuthUrl);
        pendingAuthUrl = null;
      }
    });

    win.on('closed', () => {
      mainWindow = null;
    });

    const updater = autoUpdater;
    if (updater) {
      setTimeout(() => {
        updater.checkForUpdates().catch((e: unknown) => {
          log('Check for updates failed:', e instanceof Error ? e.message : String(e));
        });
      }, 5000);
    }
  } catch (e: unknown) {
    log('Window creation error:', e instanceof Error ? e.message : String(e));
  }
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine) => {
    log('Second instance detected');
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    const protocolUrl = commandLine.find(arg => arg.startsWith(PROTOCOL_NAME + '://'));
    if (protocolUrl) {
      sendAuthToRenderer(protocolUrl);
    }
  });

  app.whenReady().then(async () => {
    log('=== App is ready ===');

    if (!IS_E2E && !app.isDefaultProtocolClient(PROTOCOL_NAME)) {
      app.setAsDefaultProtocolClient(PROTOCOL_NAME);
      log('Registered protocol:', PROTOCOL_NAME);
    }

    await initStore();
    if (!IS_E2E) await initAutoUpdater();
    if (IS_E2E && process.env.KMOBN_E2E_INITIAL_OFFLINE === '1') {
      await session.defaultSession.enableNetworkEmulation({ offline: true });
    }
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('open-url', (event, url) => {
  event.preventDefault();
  log('open-url callback received');
  sendAuthToRenderer(url);
});

ipcMain.handle('get-store', (_, key: string) => {
  return store ? store.get(key) : null;
});

ipcMain.handle('set-store', (_, key: string, value: unknown) => {
  if (store) {
    store.set(key, value);
    return true;
  }
  return false;
});

ipcMain.handle('get-theme', () => {
  return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
});

ipcMain.handle('minimize-window', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('maximize-window', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.handle('close-window', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.handle('check-for-updates', async () => {
  if (!autoUpdater) throw new Error('Проверка обновлений недоступна');
  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log('Manual update check failed:', message);
    throw new Error(message);
  }
});

ipcMain.handle('download-update', () => {
  const updater = autoUpdater;
  if (updater) {
    updater.downloadUpdate().catch((e: unknown) => {
      log('Download update failed:', e instanceof Error ? e.message : String(e));
    });
  }
});

ipcMain.handle('install-update', () => {
  if (autoUpdater) {
    autoUpdater.quitAndInstall();
  }
});

ipcMain.handle('cancel-update', () => {
  log('Update cancelled by user');
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('open-external', (_, url: string) => {
  return openExternalUrl(url);
});
