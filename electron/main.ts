const { app, BrowserWindow, ipcMain, nativeTheme, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let store;
let mainWindow = null;
let autoUpdater = null;

const LOG_FILE = path.join(app.getPath('userData'), 'app.log');

function log(...args) {
  const msg = `[${new Date().toISOString()}] ${args.join(' ')}\n`;
  console.log(...args);
  try { fs.appendFileSync(LOG_FILE, msg); } catch {}
}

function getDistPath() {
  return path.join(__dirname, '../dist');
}

async function initStore() {
  try {
    const Store = (await import('electron-store')).default;
    store = new Store();
    log('Store initialized');
  } catch (e) {
    log('Store init error:', e.message);
  }
}

async function initAutoUpdater() {
  try {
    const { autoUpdater: updater } = require('electron-updater');
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
  const fs2 = require('fs');

  log('=== Creating window ===');
  log('Dist path:', distPath);
  log('Index path:', indexPath);
  log('App path:', app.getAppPath());
  log('NODE_ENV:', process.env.NODE_ENV);
  log('index.html exists:', fs2.existsSync(indexPath));
  log('dist contents:', fs2.readdirSync(distPath).join(', '));

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
        devTools: true,
      },
      titleBarStyle: 'hiddenInset',
      backgroundColor: '#111827',
      show: false,
    });

    mainWindow.loadFile(indexPath);

    // Log renderer errors
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
      log('did-fail-load:', errorCode, errorDescription, validatedURL);
    });

    mainWindow.webContents.on('render-process-gone', (event, details) => {
      log('render-process-gone:', details.reason, details.exitCode);
    });

    mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
      const levels = ['verbose', 'info', 'warning', 'error'];
      const msg = `[renderer ${levels[level] || level}]: ${message}`;
      log(msg);
    });

    mainWindow.webContents.on('did-finish-load', () => {
      log('Page loaded successfully');
    });

    mainWindow.once('ready-to-show', () => {
      log('Window ready-to-show');
      mainWindow.show();
      // Open DevTools in production for debugging (remove later)
      mainWindow.webContents.openDevTools();
    });

    mainWindow.on('closed', () => {
      mainWindow = null;
    });

    if (process.env.NODE_ENV !== 'development' && autoUpdater) {
      setTimeout(() => {
        autoUpdater.checkForUpdatesAndNotify().catch((e) => {
          log('Check for updates failed:', e.message);
        });
      }, 5000);
    }
  } catch (e) {
    log('Window creation error:', e.message, e.stack);
  }
}

app.whenReady().then(async () => {
  log('=== App is ready ===');
  log('userData:', app.getPath('userData'));

  await initStore();
  await initAutoUpdater();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  event.preventDefault();
  callback(true);
});

// IPC handlers
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
  if (process.env.NODE_ENV !== 'development' && autoUpdater) {
    autoUpdater.checkForUpdatesAndNotify().catch((e) => {
      log('Manual update check failed:', e.message);
    });
  }
});