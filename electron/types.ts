export interface ElectronAPI {
  getStore: (key: string) => Promise<unknown>;
  setStore: (key: string, value: unknown) => Promise<boolean>;
  getTheme: () => Promise<'dark' | 'light'>;
  minimizeWindow: () => Promise<void>;
  maximizeWindow: () => Promise<void>;
  closeWindow: () => Promise<void>;
  checkForUpdates: () => Promise<void>;
  downloadUpdate: () => Promise<void>;
  installUpdate: () => Promise<void>;
  cancelUpdate: () => Promise<void>;
  getAppVersion: () => Promise<string>;
  isElectron: boolean;
  openExternal?: (url: string) => Promise<void>;
  onAuthCallback?: (callback: (url: string) => void) => void;
  onUpdateAvailable?: (callback: (info: { version: string }) => void) => void;
  onUpdateDownloadProgress?: (callback: (progress: { percent: number; bytesPerSecond: number; transferred: number; total: number }) => void) => void;
  onUpdateDownloaded?: (callback: (info: { version: string }) => void) => void;
  onUpdateNotAvailable?: (callback: () => void) => void;
  onUpdateError?: (callback: (error: string) => void) => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};