import { useState, useEffect, useCallback, useRef } from 'react';
import { getOfflineCoverage, type CacheTableKey } from '../services/indexedDbCache';
import { isWorkspacePendingChange, offlineQueue, type PendingChange } from '../services/offlineQueue';
import { processOfflineQueue } from '../services/offlineSync';
import { prepareOfflineWorkspace } from '../services/offlineWorkspace';
import { healthMonitor, type ServiceStatus } from '../services/healthMonitor';

export type SyncStatus = 'idle' | 'syncing' | 'error';
export type WorkspaceStatus = 'checking' | 'syncing' | 'downloading' | 'ready' | 'partial' | 'error';

export const useOfflineSync = (userId: string | null) => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isAppShellReady, setIsAppShellReady] = useState(
    Boolean(window.electronAPI?.isElectron || navigator.serviceWorker?.controller),
  );
  const [serviceStatus, setServiceStatus] = useState<ServiceStatus>({
    supabase: false,
    googleAuth: false,
    lastCheck: '',
  });
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([]);
  const [pendingChangesLoaded, setPendingChangesLoaded] = useState(false);
  const [legacyPendingCount, setLegacyPendingCount] = useState(0);
  const [quarantinedErrorCount, setQuarantinedErrorCount] = useState(0);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [workspaceStatus, setWorkspaceStatus] = useState<WorkspaceStatus>('checking');
  const [missingTables, setMissingTables] = useState<CacheTableKey[]>([]);
  const [lastPreparedAt, setLastPreparedAt] = useState<string | null>(null);
  const [retryAt, setRetryAt] = useState<string | null>(null);
  const [workspaceVersion, setWorkspaceVersion] = useState(0);
  const [syncedCount, setSyncedCount] = useState(0);
  const [syncedTables, setSyncedTables] = useState<string[]>([]);
  const syncingRef = useRef(false);
  const preparedUserRef = useRef<string | null>(null);
  const manualRetryRequiredRef = useRef(false);

  const applyCoverage = useCallback(async (activeUserId: string) => {
    const coverage = await getOfflineCoverage(activeUserId);
    setMissingTables(coverage.missingTables);
    setLastPreparedAt(coverage.lastPreparedAt);
    if (!navigator.onLine) setWorkspaceStatus(coverage.ready ? 'ready' : 'partial');
    return coverage;
  }, []);

  const refreshPending = useCallback(async () => {
    if (!userId) {
      setPendingChanges([]);
      setPendingChangesLoaded(true);
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
      const workspacePending = pending.filter(isWorkspacePendingChange);
      if (workspacePending.some(change => Boolean(change.lastError) || change.failureKind === 'permanent')) {
        manualRetryRequiredRef.current = true;
        setWorkspaceStatus('error');
      }
      setPendingChanges(workspacePending);
      setPendingChangesLoaded(true);
      setLegacyPendingCount(claimableQuarantined);
      setQuarantinedErrorCount(totalQuarantined - claimableQuarantined);
    } catch (error) {
      console.error('Failed to read offline queue:', error);
      setSyncStatus('error');
      setWorkspaceStatus('error');
    }
  }, [userId]);

  useEffect(() => {
    if (window.electronAPI?.isElectron) {
      setIsAppShellReady(true);
      return;
    }
    if (!('serviceWorker' in navigator)) {
      setIsAppShellReady(false);
      return;
    }
    let active = true;
    const markControlled = () => {
      if (active) setIsAppShellReady(Boolean(navigator.serviceWorker.controller));
    };
    navigator.serviceWorker.addEventListener('controllerchange', markControlled);
    void navigator.serviceWorker.ready.then(() => {
      if (active) setIsAppShellReady(true);
    });
    return () => {
      active = false;
      navigator.serviceWorker.removeEventListener('controllerchange', markControlled);
    };
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      preparedUserRef.current = null;
      setIsOnline(true);
      setWorkspaceStatus('checking');
      void refreshPending();
    };
    const handleOffline = () => {
      setIsOnline(false);
      if (userId) void applyCoverage(userId);
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [applyCoverage, refreshPending, userId]);

  useEffect(() => {
    preparedUserRef.current = null;
    manualRetryRequiredRef.current = false;
    setPendingChangesLoaded(false);
    setWorkspaceStatus('checking');
    if (userId) void applyCoverage(userId);
    void refreshPending();
    return offlineQueue.subscribe(() => { void refreshPending(); });
  }, [applyCoverage, refreshPending, userId]);

  useEffect(() => {
    healthMonitor.startPeriodicCheck(setServiceStatus);
    healthMonitor.check().then(setServiceStatus);
    return () => healthMonitor.stopPeriodicCheck();
  }, []);

  const runPreparation = useCallback(async () => {
    if (syncingRef.current || !navigator.onLine || !userId || userId === 'anon') return;
    syncingRef.current = true;
    setSyncStatus('syncing');
    setSyncedCount(0);
    setRetryAt(null);
    try {
      const result = await prepareOfflineWorkspace(userId, true, {
        onPhase: setWorkspaceStatus,
      });
      setSyncedCount(result.sync?.syncedCount ?? 0);
      setSyncedTables(result.sync?.syncedTables ?? []);
      setLastPreparedAt(result.coverage.lastPreparedAt);
      const refreshIncomplete = Boolean(result.refresh?.failedTables.length || result.refresh?.skippedTables.length);
      const incompleteTables = new Set<CacheTableKey>([
        ...result.coverage.missingTables,
        ...(result.refresh?.failedTables ?? []),
        ...(result.refresh?.skippedTables ?? []),
      ]);
      setMissingTables([...incompleteTables]);
      setWorkspaceStatus(result.coverage.ready && !refreshIncomplete ? 'ready' : 'partial');
      setSyncStatus('idle');
      preparedUserRef.current = userId;
      setWorkspaceVersion(value => value + 1);
      if (refreshIncomplete) {
        manualRetryRequiredRef.current = true;
      } else {
        manualRetryRequiredRef.current = false;
      }
    } catch (error) {
      console.error('Offline workspace preparation failed:', error);
      manualRetryRequiredRef.current = true;
      setSyncStatus('error');
      setWorkspaceStatus('error');
      preparedUserRef.current = null;
    } finally {
      syncingRef.current = false;
      await refreshPending();
    }
  }, [refreshPending, userId]);

  const runPendingSync = useCallback(async () => {
    if (syncingRef.current || !navigator.onLine || !userId || userId === 'anon') return;
    syncingRef.current = true;
    setSyncStatus('syncing');
    setRetryAt(null);
    try {
      const result = await processOfflineQueue(userId);
      if (result.pendingCount > 0) {
        manualRetryRequiredRef.current = true;
        setSyncStatus('error');
        setWorkspaceStatus('error');
      } else {
        manualRetryRequiredRef.current = false;
        setSyncStatus('idle');
        setWorkspaceStatus(missingTables.length === 0 ? 'ready' : 'partial');
      }
    } catch (error) {
      console.error('Background offline sync failed:', error);
      manualRetryRequiredRef.current = true;
      setSyncStatus('error');
      setWorkspaceStatus('error');
    } finally {
      await refreshPending();
      syncingRef.current = false;
    }
  }, [missingTables.length, refreshPending, userId]);

  const syncNow = useCallback(() => {
    preparedUserRef.current = null;
    manualRetryRequiredRef.current = false;
    setRetryAt(null);
    void runPreparation();
  }, [runPreparation]);

  const claimLegacyChanges = useCallback(async () => {
    if (!userId) return 0;
    const migrated = await offlineQueue.claimQuarantined(userId);
    preparedUserRef.current = null;
    await refreshPending();
    return migrated;
  }, [refreshPending, userId]);

  useEffect(() => {
    setRetryAt(null);
    if (!pendingChangesLoaded) return;
    if (!isOnline || !userId || userId === 'anon' || syncingRef.current) return;
    if (manualRetryRequiredRef.current) return;
    if (preparedUserRef.current === userId && pendingChanges.length > 0) {
      void runPendingSync();
    } else if (preparedUserRef.current !== userId || pendingChanges.length > 0) {
      void runPreparation();
    }
  }, [isOnline, pendingChanges, pendingChangesLoaded, runPendingSync, runPreparation, userId]);

  return {
    isOnline,
    isAppShellReady,
    isSupabaseConnected: serviceStatus.supabase,
    isGoogleAuthOk: serviceStatus.googleAuth,
    pendingChanges,
    syncStatus,
    workspaceStatus,
    missingTables,
    lastPreparedAt,
    retryAt,
    workspaceVersion,
    syncNow,
    syncedCount,
    syncedTables,
    legacyPendingCount,
    quarantinedErrorCount,
    claimLegacyChanges,
  };
};
