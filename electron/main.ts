const { app, BrowserWindow, ipcMain, nativeTheme, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let store = null;
let mainWindow = null;
let autoUpdater = null;
let pendingAuthUrl = null;

const LOG_FILE = path.join(app.getPath('userData'), 'app.log');
const PROTOCOL_NAME = 'karkasmaster';

function log(...args) {
  const msg = `[${new Date().toISOString()}] ${args.join(' ')}\n`;
  console.log(...args);
  try { fs.appendFileSync(LOG_FILE, msg); } catch {}
}

function getDistPath() {
  return path.join(__dirname, '../dist');
}

function sendAuthToRenderer(url) {
  log('Auth callback received:', url);
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
  } catch (e) {
    log('Store init error:', e.message);
  }
}

async function initAutoUpdater() {
  try {
    const { autoUpdater: updater } = await import('electron-updater');
    autoUpdater = updater;
    autoUpdater.logger = console;

    autoUpdater.on('error', (error) => {
      log('Auto-update error:', error.message || String(error));
    });

    autoUpdater.on('update-available', (info) => {
      log('Update available:', info.version);
      if (mainWindow) {
        mainWindow.webContents.send('update-available', info);
      }
    });

    autoUpdater.on('update-downloaded', (info) => {
      log('Update downloaded:', info.version);
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Обновление доступно',
        message: 'Новая версия приложения загружена и готова к установке.',
        buttons: ['Установить сейчас', 'Позже'],
        defaultId: 0,
        cancelId: 1,
      }).then(({ response }) => {
        if (response === 0) {
          autoUpdater.quitAndInstall();
        }
      });
    });

    autoUpdater.on('update-not-available', () => {
      log('Update not available. Current version is latest.');
    });
  } catch (e) {
    log('Auto-updater init error:', e.message);
  }
}

function createWindow() {
  const distPath = getDistPath();
  const indexPath = path.join(distPath, 'index.html');
  const iconPath = path.join(__dirname, '../public/icon.png');

  log('=== Creating window ===');
  log('Index exists:', fs.existsSync(indexPath));

  try {
    mainWindow = new BrowserWindow({
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

    mainWindow.loadFile(indexPath);

    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
      log('did-fail-load:', errorCode, errorDescription, validatedURL);
    });

    mainWindow.webContents.on('render-process-gone', (event, details) => {
      log('render-process-gone:', details.reason, details.exitCode);
    });

    mainWindow.webContents.on('console-message', (event, level, message) => {
      if (level >= 2) {
        log('[renderer]:', message);
      }
    });

    mainWindow.once('ready-to-show', () => {
      log('Window ready-to-show');
      mainWindow.show();

      if (pendingAuthUrl) {
        log('Sending pending auth URL');
        mainWindow.webContents.send('auth-callback', pendingAuthUrl);
        pendingAuthUrl = null;
      }
    });

    mainWindow.on('closed', () => {
      mainWindow = null;
    });

    if (autoUpdater) {
      setTimeout(() => {
        autoUpdater.checkForUpdatesAndNotify().catch((e) => {
          log('Check for updates failed:', e.message);
        });
      }, 5000);
    }
  } catch (e) {
    log('Window creation error:', e.message);
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

    if (!app.isDefaultProtocolClient(PROTOCOL_NAME)) {
      app.setAsDefaultProtocolClient(PROTOCOL_NAME);
      log('Registered protocol:', PROTOCOL_NAME);
    }

    await initStore();
    await initAutoUpdater();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });

  app.on('open-url', (event, url) => {
    event.preventDefault();
    log('open-url:', url);
    sendAuthToRenderer(url);
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  event.preventDefault();
  callback(true);
});

ipcMain.handle('get-store', (_, key) => {
  return store ? store.get(key) : null;
});

ipcMain.handle('set-store', (_, key, value) => {
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

ipcMain.handle('check-for-updates', () => {
  if (autoUpdater) {
    autoUpdater.checkForUpdatesAndNotify().catch((e) => {
      log('Manual update check failed:', e.message);
    });
  }
});