const { app, BrowserWindow, ipcMain, nativeTheme, dialog } = require('electron');
const path = require('path');

let store;
let mainWindow = null;
let autoUpdater = null;

function getDistPath() {
  return path.join(__dirname, '../dist');
}

async function initStore() {
  try {
    const Store = (await import('electron-store')).default;
    store = new Store();
  } catch (e) {
    console.error('Store init error:', e);
  }
}

async function initAutoUpdater() {
  try {
    const { autoUpdater: updater } = require('electron-updater');
    autoUpdater = updater;
    autoUpdater.logger = console;

    autoUpdater.on('error', (error) => {
      console.error('Auto-update error:', error);
    });

    autoUpdater.on('update-available', (info) => {
      console.log('Update available:', info.version);
      if (mainWindow) {
        mainWindow.webContents.send('update-available', info);
      }
    });

    autoUpdater.on('update-downloaded', (info) => {
      console.log('Update downloaded:', info.version);
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
      console.log('Update not available. Current version is latest.');
    });

    autoUpdater.on('checking-for-update', () => {
      console.log('Checking for updates...');
    });
  } catch (e) {
    console.error('Auto-updater init error:', e);
  }
}

function createWindow() {
  const distPath = getDistPath();
  const indexPath = path.join(distPath, 'index.html');
  const iconPath = path.join(__dirname, '../public/icon.png');

  console.log('Creating window...');
  console.log('Dist path:', distPath);
  console.log('Index path:', indexPath);
  console.log('Icon path:', iconPath);
  console.log('App path:', app.getAppPath());

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

    if (process.env.NODE_ENV === 'development') {
      mainWindow.loadURL('http://localhost:3000');
      mainWindow.webContents.openDevTools();
    } else {
      mainWindow.loadFile(indexPath);
    }

    mainWindow.once('ready-to-show', () => {
      mainWindow.show();
    });

    mainWindow.on('closed', () => {
      mainWindow = null;
    });

    // Check for updates after window is shown
    if (process.env.NODE_ENV !== 'development' && autoUpdater) {
      setTimeout(() => {
        autoUpdater.checkForUpdatesAndNotify().catch((e) => {
          console.error('Check for updates failed:', e);
        });
      }, 3000);
    }
  } catch (e) {
    console.error('Window creation error:', e);
  }
}

app.whenReady().then(async () => {
  console.log('App is ready. Starting...');

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
      console.error('Manual update check failed:', e);
    });
  }
});