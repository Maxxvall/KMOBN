import { useState, useEffect, useCallback, useRef } from 'react';
import { getOfflineCoverage, type CacheTableKey } from '../services/indexedDbCache';
import { offlineQueue, type PendingChange } from '../services/offlineQueue';
import { prepareOfflineWorkspace } from '../services/offlineWorkspace';
import { healthMonitor, type ServiceStatus } from '../services/healthMonitor';

export type SyncStatus = 'idle' | 'syncing' | 'error';
export type WorkspaceStatus = 'checking' | 'syncing' | 'downloading' | 'ready' | 'partial' | 'error';

const retryDelay = (change: PendingChange | undefined): number | null => {
  if (!change || !change.lastError) return 0;
  if (change.failureKind === 'permanent') return null;
  if (!change.nextRetryAt) return 0;
  return Math.max(0, Date.parse(change.nextRetryAt) - Date.now());
};

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
  const [workspaceStatus, setWorkspaceStatus] = useState<WorkspaceStatus>('checking');
  const [missingTables, setMissingTables] = useState<CacheTableKey[]>([]);
  const [lastPreparedAt, setLastPreparedAt] = useState<string | null>(null);
  const [retryAt, setRetryAt] = useState<string | null>(null);
  const [workspaceVersion, setWorkspaceVersion] = useState(0);
  const [syncedCount, setSyncedCount] = useState(0);
  const [syncedTables, setSyncedTables] = useState<string[]>([]);
  const syncingRef = useRef(false);
  const preparedUserRef = useRef<string | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      setMissingTables(result.coverage.missingTables);
      setLastPreparedAt(result.coverage.lastPreparedAt);
      const refreshIncomplete = Boolean(result.refresh?.failedTables.length || result.refresh?.skippedTables.length);
      setWorkspaceStatus(result.coverage.ready && !refreshIncomplete ? 'ready' : 'partial');
      setSyncStatus('idle');
      preparedUserRef.current = userId;
      setWorkspaceVersion(value => value + 1);
    } catch (error) {
      console.error('Offline workspace preparation failed:', error);
      setSyncStatus('error');
      setWorkspaceStatus('error');
      preparedUserRef.current = null;
    } finally {
      syncingRef.current = false;
      await refreshPending();
    }
  }, [refreshPending, userId]);

  const syncNow = useCallback(() => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    retryTimerRef.current = null;
    preparedUserRef.current = null;
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
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    retryTimerRef.current = null;
    setRetryAt(null);
    if (!isOnline || !userId || userId === 'anon' || syncingRef.current) return;

    const firstPending = pendingChanges[0];
    const delay = retryDelay(firstPending);
    if (delay == null) {
      setWorkspaceStatus('error');
      return;
    }
    if (delay > 0) {
      setRetryAt(firstPending.nextRetryAt ?? null);
      retryTimerRef.current = setTimeout(() => void runPreparation(), delay);
      return () => {
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      };
    }
    if (preparedUserRef.current !== userId || pendingChanges.length > 0) {
      void runPreparation();
    }
  }, [isOnline, pendingChanges, runPreparation, userId]);

  return {
    isOnline,
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
