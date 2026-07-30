import { useCallback, useRef } from 'react';
import { addTemplate as addTemplateToDb, deleteEstimateById, deleteEstimates, deleteEstimatesByNumber, deleteTemplate as deleteTemplateFromDb, saveEstimates } from '../services/database';
import { validateEstimate } from '../services/estimateValidation';
import { canCreateEstimate, canDeleteEstimate } from '../services/subscriptionService';
import { Estimate, EstimateStatus, ProjectTemplate, SubscriptionLimits, SubscriptionUsage, View } from '../types';
import { buildEstimateDuplicateDeletePlan, type EstimateDuplicateDeleteRequest } from '../services/estimateIntelligence';
import { applyEstimateSave, setEstimateChainArchived } from '../services/estimateLifecycle';

type SaveMode = 'overwrite' | 'new';

type UseEstimateCrudParams = {
  estimates: Estimate[];
  subscriptionUsage: SubscriptionUsage;
  subscriptionLimits: SubscriptionLimits;
  subscriptionLoading: boolean;
  goToView: (view: View) => void;
  openAccessModal?: (title: string, description: string) => void;
  recalculateWorkPrices: (estimate: Estimate) => Estimate;
  consumeDeleteLimit: () => void;
  setEstimates: React.Dispatch<React.SetStateAction<Estimate[]>>;
  setTemplates: React.Dispatch<React.SetStateAction<ProjectTemplate[]>>;
  setCurrentEstimate: React.Dispatch<React.SetStateAction<Estimate | null>>;
  setEditorValidationResult: React.Dispatch<React.SetStateAction<ReturnType<typeof validateEstimate> | null>>;
  setEditorDirty: React.Dispatch<React.SetStateAction<boolean>>;
  setEditorDraft: React.Dispatch<React.SetStateAction<Estimate | null>>;
  setShowSaveOptions: React.Dispatch<React.SetStateAction<boolean>>;
  setShowUnsavedModal: React.Dispatch<React.SetStateAction<boolean>>;
  setPendingView: React.Dispatch<React.SetStateAction<View | null>>;
  setViewAfterSave: React.Dispatch<React.SetStateAction<View>>;
  setSync: React.Dispatch<React.SetStateAction<{ visible: boolean; message: string; type: 'success' | 'error' | 'info' }>>;
};

export const useEstimateCrud = ({
  estimates,
  subscriptionUsage,
  subscriptionLimits,
  subscriptionLoading,
  goToView,
  openAccessModal,
  recalculateWorkPrices,
  consumeDeleteLimit,
  setEstimates,
  setTemplates,
  setCurrentEstimate,
  setEditorValidationResult,
  setEditorDirty,
  setEditorDraft,
  setShowSaveOptions,
  setShowUnsavedModal,
  setPendingView,
  setViewAfterSave,
  setSync,
}: UseEstimateCrudParams) => {
  const estimatesRef = useRef(estimates);
  estimatesRef.current = estimates;
  const archiveMutationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const handleCreateNew = useCallback(() => {
    // Don't block action while subscription is loading — allow creation with subsequent check
    if (!subscriptionLoading && !canCreateEstimate(subscriptionUsage, subscriptionLimits)) {
      openAccessModal?.('Лимит смет исчерпан', 'Перейдите на платный план, чтобы создавать больше смет.');
      return;
    }
    setCurrentEstimate(null);
    setEditorValidationResult(null);
    setEditorDirty(false);
    setEditorDraft(null);
    setPendingView(null);
    setShowSaveOptions(false);
    setShowUnsavedModal(false);
    goToView(View.EDITOR);
  }, [
    subscriptionUsage,
    subscriptionLimits,
    subscriptionLoading,
    openAccessModal,
    setCurrentEstimate,
    setEditorValidationResult,
    setEditorDirty,
    setEditorDraft,
    setPendingView,
    setShowSaveOptions,
    setShowUnsavedModal,
    goToView,
  ]);

  const handleEdit = useCallback((estimate: Estimate) => {
    let nextEstimate = estimate;
    if (estimate.status === EstimateStatus.DRAFT && estimate.needsPriceUpdate) {
      nextEstimate = recalculateWorkPrices(estimate);
      setEstimates(prev => prev.map(item => item.id === estimate.id ? nextEstimate : item));
    }
    setCurrentEstimate(nextEstimate);
    setEditorValidationResult(null);
    setEditorDirty(false);
    setEditorDraft(null);
    setPendingView(null);
    setShowSaveOptions(false);
    setShowUnsavedModal(false);
    goToView(View.EDITOR);
  }, [
    recalculateWorkPrices,
    setEstimates,
    setCurrentEstimate,
    setEditorValidationResult,
    setEditorDirty,
    setEditorDraft,
    setPendingView,
    setShowSaveOptions,
    setShowUnsavedModal,
    goToView,
  ]);

  const handleSaveEstimate = useCallback((draft: Estimate, saveMode: SaveMode, afterSaveView: View = View.HISTORY, restoreFromArchive = true) => {
    if (!draft) return;

    const validation = validateEstimate(draft);
    if (validation.issues.length > 0) {
      setEditorValidationResult(validation);
      setShowSaveOptions(false);
      setShowUnsavedModal(false);
      setPendingView(null);
      goToView(View.EDITOR);

      alert(
        `Есть ошибки в смете:\n` +
        `Проблемных строк: ${validation.invalidItemIds.size}. Ошибок: ${validation.issues.length}.\n` +
        `Исправьте перед сохранением.`,
      );
      return;
    }

    const updatedEstimates = applyEstimateSave({
      estimates,
      draft,
      saveMode,
      now: new Date().toISOString(),
      newId: `sm-id-${Date.now()}`,
      restoreFromArchive,
    });

    // Save directly to DB first, then update state — prevents cache event from overwriting stale data
    void saveEstimates(updatedEstimates).then(() => {
      setEstimates(updatedEstimates);
      setEditorDirty(false);
      setEditorDraft(null);
      setShowSaveOptions(false);
      setPendingView(null);
      setShowUnsavedModal(false);
      setViewAfterSave(View.HISTORY);
      goToView(afterSaveView);
    }).catch((error) => {
      console.error('Failed to save estimate to DB:', error);
      setSync({ visible: true, message: 'Ошибка сохранения сметы в БД', type: 'error' });
      setTimeout(() => setSync(s => ({ ...s, visible: false })), 4000);
    });
  }, [
    estimates,
    goToView,
    setEstimates,
    setEditorValidationResult,
    setShowSaveOptions,
    setShowUnsavedModal,
    setPendingView,
    setEditorDirty,
    setEditorDraft,
    setViewAfterSave,
    setSync,
  ]);

  const handleSetArchived = useCallback((estimate: Estimate, archived: boolean) => {
    archiveMutationQueueRef.current = archiveMutationQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        const updatedEstimates = setEstimateChainArchived(estimatesRef.current, estimate.estimateNumber, archived);
        await saveEstimates(updatedEstimates);
        estimatesRef.current = updatedEstimates;
        setEstimates(updatedEstimates);
        setSync({
          visible: true,
          message: archived ? 'Смета перемещена в архив и исключена из расчёта дома' : 'Смета возвращена в текущие',
          type: 'success',
        });
        setTimeout(() => setSync(state => ({ ...state, visible: false })), 3000);
      })
      .catch(error => {
        console.error('Failed to update estimate archive state:', error);
        setSync({ visible: true, message: 'Не удалось изменить архив', type: 'error' });
      });
  }, [setEstimates, setSync]);

  const handleDeleteEstimate = useCallback(async (estimateToDelete: Estimate) => {
    if (!canDeleteEstimate(subscriptionUsage, subscriptionLimits)) {
      alert('Удаление смет доступно на платных планах.');
      goToView(View.SUBSCRIPTIONS);
      return;
    }
    if (!window.confirm(`Вы уверены, что хотите удалить смету №${estimateToDelete.estimateNumber} и все ее версии? Это действие необратимо.`)) return;
    const estimateNumberToDelete = estimateToDelete.estimateNumber;
    try {
      await deleteEstimatesByNumber(estimateNumberToDelete);
      setEstimates(prevEstimates => prevEstimates.filter(e => e.estimateNumber !== estimateNumberToDelete));
      consumeDeleteLimit();
      setSync({ visible: true, message: 'Сметы удалены из БД', type: 'success' });
      setTimeout(() => setSync(s => ({ ...s, visible: false })), 2000);
    } catch (error) {
      console.error('Failed to delete estimates from DB:', error);
      setSync({ visible: true, message: 'Ошибка удаления смет в БД', type: 'error' });
      setTimeout(() => setSync(s => ({ ...s, visible: false })), 4000);
    }
  }, [subscriptionUsage, subscriptionLimits, goToView, setEstimates, consumeDeleteLimit, setSync]);

  const handleDeleteEstimateVersion = useCallback(async (estimateToDelete: Estimate) => {
    if (!canDeleteEstimate(subscriptionUsage, subscriptionLimits)) {
      alert('Удаление смет доступно на платных планах.');
      goToView(View.SUBSCRIPTIONS);
      return;
    }
    const estimateNumber = estimateToDelete.estimateNumber;
    const versionHistory = estimates
      .filter(e => e.estimateNumber === estimateNumber)
      .sort((a, b) => b.version - a.version);

    if (versionHistory.length === 0) {
      alert('Версия не найдена. Обновите список и попробуйте снова.');
      return;
    }

    const isOnlyVersion = versionHistory.length === 1;
    const latestVersionId = versionHistory[0].id;
    const isLatest = estimateToDelete.id === latestVersionId;

    let confirmMessage = '';
    if (isOnlyVersion) {
      confirmMessage = `Вы уверены, что хотите удалить смету №${estimateToDelete.estimateNumber} целиком? Это удалит единственную версию и всю цепочку.`;
    } else if (!isLatest) {
      confirmMessage = `Вы удаляете промежуточную версию v${estimateToDelete.version}. Это может нарушить историю изменений. Продолжить?`;
    } else {
      confirmMessage = `Вы уверены, что хотите удалить версию v${estimateToDelete.version} сметы №${estimateToDelete.estimateNumber}?`;
    }

    if (!window.confirm(confirmMessage)) return;

    try {
      if (isOnlyVersion) {
        await deleteEstimateById(estimateToDelete.id);
        const updatedEstimates = estimates.filter(e => e.id !== estimateToDelete.id);
        await saveEstimates(updatedEstimates);
        setEstimates(updatedEstimates);
        consumeDeleteLimit();
        setSync({ visible: true, message: 'Смета полностью удалена', type: 'success' });
      } else {
        const deletedId = estimateToDelete.id;
        const remainingVersions = versionHistory.filter(e => e.id !== deletedId);
        const newRoot = [...remainingVersions].sort((a, b) => {
          const vA = typeof a.version === 'number' ? a.version : 0;
          const vB = typeof b.version === 'number' ? b.version : 0;
          if (vB !== vA) return vB - vA;
          return new Date(b.date).getTime() - new Date(a.date).getTime();
        })[0];

        // Reparent: ensure all remaining versions point to valid root
        const reparentMap = new Map<string, { parentId?: string; isArchived?: boolean }>();
        for (const e of remainingVersions) {
          if (e.id === newRoot.id) {
            // New root: remove parentId, keep status as-is
            reparentMap.set(e.id, { parentId: undefined });
          } else {
            // Non-root: ensure parentId points to new root if it was pointing to deleted version
            const needsReparent = e.parentId === deletedId || e.parentId === undefined;
            reparentMap.set(e.id, {
              parentId: needsReparent ? newRoot.id : e.parentId,
            });
          }
        }

        await deleteEstimateById(deletedId);
        const updatedEstimates = estimates
          .filter(e => e.id !== deletedId)
          .map(e => {
            const patch = reparentMap.get(e.id);
            return patch ? { ...e, ...patch } : e;
          });
        await saveEstimates(updatedEstimates);
        setEstimates(updatedEstimates);
        consumeDeleteLimit();
        const msg = isLatest ? 'Версия удалена, главная обновлена' : 'Версия сметы удалена';
        setSync({ visible: true, message: msg, type: 'success' });
      }
      setTimeout(() => setSync(s => ({ ...s, visible: false })), 2000);
    } catch (error) {
      console.error('Failed to delete estimate version from DB:', error);
      setSync({ visible: true, message: 'Ошибка удаления версии в БД', type: 'error' });
      setTimeout(() => setSync(s => ({ ...s, visible: false })), 4000);
    }
  }, [subscriptionUsage, subscriptionLimits, goToView, estimates, setEstimates, consumeDeleteLimit, setSync]);

  const handleDeleteVersionDuplicates = useCallback(async (requests: EstimateDuplicateDeleteRequest[]): Promise<number> => {
    if (requests.length === 0) return 0;
    if (!canDeleteEstimate(subscriptionUsage, subscriptionLimits)) {
      goToView(View.SUBSCRIPTIONS);
      throw new Error('Удаление смет доступно на платных планах или месячный лимит удалений исчерпан.');
    }
    try {
      const plan = buildEstimateDuplicateDeletePlan(estimates, requests);
      if (plan.deleteIds.length === 0) return 0;
      await deleteEstimates(plan.deleteIds);
      const deleteSet = new Set(plan.deleteIds);
      setEstimates(current => current.filter(estimate => !deleteSet.has(estimate.id)));
      consumeDeleteLimit();
      return plan.deleteIds.length;
    } catch (error) {
      console.error('Failed to delete version duplicates:', error);
      throw error;
    }
  }, [subscriptionUsage, subscriptionLimits, goToView, estimates, setEstimates, consumeDeleteLimit]);

  const handleSaveAsTemplate = useCallback(async (estimate: Estimate) => {
    const templateName = prompt('Введите название шаблона:');
    if (templateName) {
      const newTemplate: ProjectTemplate = {
        id: `template-${Date.now()}`,
        name: templateName,
        baseArea: estimate.area,
        items: estimate.items,
        sortOrder: Date.now(),
      };
      try {
        await addTemplateToDb(newTemplate);
        setTemplates(prev => [...prev, newTemplate]);
        alert('Шаблон сохранен!');
      } catch (error) {
        console.error('Failed to save template:', error);
        alert('Не удалось сохранить шаблон.');
      }
    }
  }, [setTemplates]);

  const handleDeleteTemplate = useCallback(async (templateId: string) => {
    if (window.confirm('Вы уверены, что хотите удалить этот шаблон?')) {
      try {
        await deleteTemplateFromDb(templateId);
        setTemplates(prev => prev.filter(t => t.id !== templateId));
      } catch (error) {
        console.error('Failed to delete template:', error);
        alert('Не удалось удалить шаблон.');
      }
    }
  }, [setTemplates]);

  return {
    handleCreateNew,
    handleEdit,
    handleSaveEstimate,
    handleDeleteEstimate,
    handleDeleteEstimateVersion,
    handleDeleteVersionDuplicates,
    handleSetArchived,
    handleSaveAsTemplate,
    handleDeleteTemplate,
  };
};
