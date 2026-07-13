import { refreshOfflineWorkspace, type OfflineWorkspaceRefreshResult } from './database';
import {
  getOfflineCoverage,
  type OfflineCoverage,
} from './indexedDbCache';
import { offlineQueue } from './offlineQueue';
import { processOfflineQueue, type OfflineSyncResult } from './offlineSync';

export type PrepareOfflineWorkspaceResult = {
  coverage: OfflineCoverage;
  sync: OfflineSyncResult | null;
  refresh: OfflineWorkspaceRefreshResult | null;
};

type Dependencies = {
  processQueue: typeof processOfflineQueue;
  refreshWorkspace: typeof refreshOfflineWorkspace;
  readCoverage: typeof getOfflineCoverage;
  countPending: typeof offlineQueue.count;
  onPhase?: (phase: 'syncing' | 'downloading') => void;
};

const defaultDependencies: Dependencies = {
  processQueue: processOfflineQueue,
  refreshWorkspace: refreshOfflineWorkspace,
  readCoverage: getOfflineCoverage,
  countPending: offlineQueue.count,
};

/**
 * The one safe online order is push first and pull second. Offline startup only
 * inspects the local coverage marker and never attempts a network request.
 */
export const prepareOfflineWorkspace = async (
  userId: string,
  online: boolean,
  dependencyOverrides: Partial<Dependencies> = {},
): Promise<PrepareOfflineWorkspaceResult> => {
  if (!userId || userId === 'anon') throw new Error('Authenticated user is required');
  const dependencies = { ...defaultDependencies, ...dependencyOverrides };

  if (!online) {
    return {
      coverage: await dependencies.readCoverage(userId),
      sync: null,
      refresh: null,
    };
  }

  dependencies.onPhase?.('syncing');
  const sync = await dependencies.processQueue(userId);
  if (sync.pendingCount > 0 || await dependencies.countPending(userId) > 0) {
    throw new Error('Локальные изменения ещё не отправлены; обновление кэша отложено.');
  }

  dependencies.onPhase?.('downloading');
  const refresh = await dependencies.refreshWorkspace(userId);
  return {
    coverage: await dependencies.readCoverage(userId),
    sync,
    refresh,
  };
};
