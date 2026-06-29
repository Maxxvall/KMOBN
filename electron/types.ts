export interface ElectronAPI {
  getStore: (key: string) => Promise<unknown>;
  setStore: (key: string, value: unknown) => Promise<boolean>;
  getTheme: () => Promise<'dark' | 'light'>;
  minimizeWindow: () => Promise<void>;
  maximizeWindow: () => Promise<void>;
  closeWindow: () => Promise<void>;
  isElectron: boolean;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};