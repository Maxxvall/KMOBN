import { createContext, useContext } from 'react';

type SyncToastState = {
  visible: boolean;
  message: string;
  type: 'success' | 'error' | 'info';
};

type SyncContextValue = {
  sync: SyncToastState;
  setSync: React.Dispatch<React.SetStateAction<SyncToastState>>;
  isSaving: boolean;
  lastSaved: Date | null;
  saveError: string | null;
  showToast: (message: string, type?: 'success' | 'error' | 'info', duration?: number) => void;
};

const SyncContext = createContext<SyncContextValue | undefined>(undefined);

export const SyncProvider = SyncContext.Provider;

export const useOptionalSyncContext = (): SyncContextValue | undefined => {
  return useContext(SyncContext);
};


