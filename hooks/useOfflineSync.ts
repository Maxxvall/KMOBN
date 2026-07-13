import { useState, useEffect, useCallback, useRef } from 'react';
import { offlineQueue, type PendingChange } from '../services/offlineQueue';
import { processOfflineQueue } from '../services/offlineSync';
import { healthMonitor, type ServiceStatus } from '../services/healthMonitor';

export type SyncStatus = 'idle' | 'syncing' | 'error';

export const useOfflineSync = (userId: string | null) => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [serviceStatus, setServiceStatus] = useState<ServiceStatus>({
    supabase: false,
    googleAuth: false,
    lastCheck: '',
  });
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([]);
  const [legacyPendingCount, setLegacyPendingCount] = useState(0);
  const [quarantinedErrorCount, setQuarantinedErrorCount] = useState(0);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [syncedCount, setSyncedCount] = useState(0);
  const [syncedTables, setSyncedTables] = useState<string[]>([]);
  const [syncCycle, setSyncCycle] = useState(0);
  const syncingRef = useRef(false);

  const refreshPending = useCallback(async () => {
    if (!userId) {
      setPendingChanges([]);
      setLegacyPendingCount(0);
      setQuarantinedErrorCount(0);
      return;
    }
    try {
      const [pending, totalQuarantined, claimableQuarantined] = await Promise.all([
        offlineQueue.getAll(userId),
        offlineQueue.getQuarantinedCount(),
        offlineQueue.getClaimableQuarantinedCount(),
      ]);
      setPendingChanges(pending);
      setLegacyPendingCount(claimableQuarantined);
      setQuarantinedErrorCount(totalQuarantined - claimableQuarantined);
    } catch (error) {
      console.error('Failed to read offline queue:', error);
      setSyncStatus('error');
    }
  }, [userId]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      void refreshPending();
    };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [refreshPending]);

  useEffect(() => {
    void refreshPending();
    return offlineQueue.subscribe(() => { void refreshPending(); });
  }, [refreshPending]);

  useEffect(() => {
    healthMonitor.startPeriodicCheck(setServiceStatus);
    healthMonitor.check().then(setServiceStatus);
    return () => healthMonitor.stopPeriodicCheck();
  }, []);

  const syncNow = useCallback(async () => {
    if (syncingRef.current) return;
    if (!navigator.onLine || !userId || userId === 'anon') {
      setSyncStatus('error');
      return;
    }

    syncingRef.current = true;
    setSyncStatus('syncing');
    setSyncedCount(0);
    let completed = false;
    try {
      const result = await processOfflineQueue(userId);
      setSyncedCount(result.syncedCount);
      setSyncedTables(result.syncedTables);
      setSyncStatus('idle');
      completed = true;
    } catch (error) {
      console.error('Sync failed:', error);
      setSyncStatus('error');
    } finally {
      syncingRef.current = false;
      const remaining = await offlineQueue.getAll(userId);
      setPendingChanges(remaining);
      // A newer version of the same record may have been queued while its
      // previous version was being sent. Start one more snapshot only after a
      // successful pass; failures remain visible and wait for reconnect/manual retry.
      if (completed && navigator.onLine && remaining.length > 0) {
        setSyncCycle(value => value + 1);
      }
    }
  }, [userId]);

  const claimLegacyChanges = useCallback(async () => {
    if (!userId) return 0;
    const migrated = await offlineQueue.claimQuarantined(userId);
    await refreshPending();
    return migrated;
  }, [refreshPending, userId]);

  useEffect(() => {
    if (isOnline && userId && userId !== 'anon' && pendingChanges.length > 0 && !syncingRef.current) {
      void syncNow();
    }
  }, [isOnline, pendingChanges.length, syncCycle, syncNow, userId]);

  return {
    isOnline,
    isSupabaseConnected: serviceStatus.supabase,
    isGoogleAuthOk: serviceStatus.googleAuth,
    pendingChanges,
    syncStatus,
    syncNow,
    syncedCount,
    syncedTables,
    legacyPendingCount,
    quarantinedErrorCount,
    claimLegacyChanges,
  };
};
