import { useState, useEffect, useCallback, useRef } from 'react';
import { offlineQueue, PendingChange } from '../services/offlineQueue';
import { healthMonitor, ServiceStatus } from '../services/healthMonitor';
import {
  saveEstimates,
  saveMaterials,
  saveWorks,
  saveBundles,
  deleteEstimates,
  deleteMaterials,
  deleteWorks,
  deleteBundles,
} from '../services/database';

export type SyncStatus = 'idle' | 'syncing' | 'error';

export const useOfflineSync = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [serviceStatus, setServiceStatus] = useState<ServiceStatus>({
    supabase: false,
    googleAuth: false,
    lastCheck: '',
  });
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const syncedRef = useRef(false);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    const refreshPending = async () => {
      const changes = await offlineQueue.getAll();
      setPendingChanges(changes);
    };
    refreshPending();
  }, []);

  useEffect(() => {
    healthMonitor.startPeriodicCheck(setServiceStatus);
    healthMonitor.check().then(setServiceStatus);
    return () => healthMonitor.stopPeriodicCheck();
  }, []);

  const syncNow = useCallback(async () => {
    if (syncStatus === 'syncing') return;
    setSyncStatus('syncing');
    try {
      const changes = await offlineQueue.getAll();
      if (changes.length === 0) {
        setSyncStatus('idle');
        return;
      }

      const grouped = offlineQueue.groupByTable(changes);

      for (const [table, tableChanges] of grouped) {
        for (const change of tableChanges) {
          if (change.operation === 'delete' && Array.isArray(change.data)) {
            switch (table) {
              case 'estimates':
                await deleteEstimates(change.data);
                break;
              case 'materials':
                await deleteMaterials(change.data);
                break;
              case 'works':
                await deleteWorks(change.data);
                break;
              case 'bundles':
                await deleteBundles(change.data);
                break;
            }
          } else if (change.operation === 'upsert') {
            switch (table) {
              case 'estimates':
                await saveEstimates(change.data);
                break;
              case 'materials':
                await saveMaterials(change.data);
                break;
              case 'works':
                await saveWorks(change.data);
                break;
              case 'bundles':
                await saveBundles(change.data);
                break;
            }
          }
        }
      }

      await offlineQueue.clear();
      setPendingChanges([]);
      setSyncStatus('idle');
    } catch (error) {
      console.error('Sync failed:', error);
      setSyncStatus('error');
    }
  }, [syncStatus]);

  useEffect(() => {
    if (isOnline && pendingChanges.length > 0 && !syncedRef.current) {
      syncedRef.current = true;
      syncNow().finally(() => { syncedRef.current = false; });
    }
  }, [isOnline, pendingChanges.length, syncNow]);

  const queueChange = useCallback(async (table: string, operation: 'upsert' | 'delete', data: any) => {
    await offlineQueue.add({ table, operation, data });
    const updated = await offlineQueue.getAll();
    setPendingChanges(updated);
  }, []);

  return {
    isOnline,
    isSupabaseConnected: serviceStatus.supabase,
    isGoogleAuthOk: serviceStatus.googleAuth,
    pendingChanges,
    syncStatus,
    syncNow,
    queueChange,
  };
};
