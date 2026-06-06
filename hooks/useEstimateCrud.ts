import { useCallback } from 'react';
import { addTemplate as addTemplateToDb, deleteEstimateById, deleteEstimatesByNumber, deleteTemplate as deleteTemplateFromDb, saveEstimates } from '../services/database';
import { validateEstimate } from '../services/estimateValidation';
import { canCreateEstimate, canDeleteEstimate } from '../services/subscriptionService';
import { Estimate, EstimateStatus, ProjectTemplate, SubscriptionLimits, SubscriptionUsage, View } from '../types';

type SaveMode = 'overwrite' | 'new';

type UseEstimateCrudParams = {
  estimates: Estimate[];
  subscriptionUsage: SubscriptionUsage;
  subscriptionLimits: SubscriptionLimits;
  subscriptionLoading: boolean;
  goToView: (view: View) => void;
  openAccessModal: (title: string, description: string) => void;
  recalculateEstimatePrices: (estimate: Estimate) => Estimate;
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
  recalculateEstimatePrices,
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
  const handleCreateNew = useCallback(() => {
    // Don't block action while subscription is loading — allow creation with subsequent check
    if (!subscriptionLoading && !canCreateEstimate(subscriptionUsage, subscriptionLimits)) {
      openAccessModal('Лимит смет исчерпан', 'Перейдите на платный план, чтобы создавать больше смет.');
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
      nextEstimate = recalculateEstimatePrices(estimate);
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
    recalculateEstimatePrices,
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

  const handleSaveEstimate = useCallback((draft: Estimate, saveMode: SaveMode, afterSaveView: View = View.HISTORY) => {
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

    // Compute the new array using current state (not prevEstimates inside setter)
    const now = new Date().toISOString();
    let updatedEstimates: Estimate[];
    const existingIndex = estimates.findIndex(e => e.id === draft.id);
    if (existingIndex !== -1) {
      const existing = estimates[existingIndex];
      if (saveMode === 'overwrite') {
        const updated = {
          ...draft,
          version: existing.version,
          parentId: existing.parentId,
          date: now,
          sortOrder: existing.sortOrder,
        };
        updatedEstimates = [...estimates];
        updatedEstimates[existingIndex] = updated;
      } else {
        const allVersions = estimates.filter(e => e.estimateNumber === existing.estimateNumber);
        const maxVersion = Math.max(...allVersions.map(e => e.version), 0);
        const nextVersion = maxVersion + 1;

        const duplicate = allVersions.find(e => e.version === nextVersion && e.id !== existing.id);
        if (duplicate) {
          updatedEstimates = [...estimates];
          const dupIdx = updatedEstimates.findIndex(e => e.id === duplicate.id);
          updatedEstimates[dupIdx] = {
            ...duplicate,
            ...draft,
            id: duplicate.id,
            version: nextVersion,
            date: now,
            isArchived: false,
          };
          updatedEstimates[existingIndex] = { ...existing, isArchived: true, status: EstimateStatus.ARCHIVED };
        } else {
          const archivedEstimate = { ...existing, isArchived: true, status: EstimateStatus.ARCHIVED };
          const newVersion: Estimate = {
            ...draft,
            id: `sm-id-${Date.now()}`,
            version: nextVersion,
            date: now,
            parentId: existing.parentId || existing.id,
            isArchived: false,
            sortOrder: existing.sortOrder,
          };
          updatedEstimates = [...estimates];
          updatedEstimates[existingIndex] = archivedEstimate;
          updatedEstimates.push(newVersion);
        }
      }
    } else {
      updatedEstimates = [...estimates, draft];
    }

    // Save directly to DB immediately — no debounce, no race condition
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
        const remainingVersions = versionHistory.filter(e => e.id !== estimateToDelete.id);
        const hasChildren = remainingVersions.some(e => e.parentId === estimateToDelete.id);
        const isRootVersion = !estimateToDelete.parentId || hasChildren;
        const shouldNormalize = remainingVersions.length > 0 && (isRootVersion || isLatest);

        if (shouldNormalize) {
          const [newRoot] = [...remainingVersions].sort((a, b) => {
            if (b.version !== a.version) return b.version - a.version;
            return new Date(b.date).getTime() - new Date(a.date).getTime();
          });
          const reparented = remainingVersions.map(e => {
            const isNewRoot = e.id === newRoot.id;
            return {
              ...e,
              parentId: isNewRoot ? undefined : newRoot.id,
              isArchived: isNewRoot ? false : true,
              status: isNewRoot ? e.status : EstimateStatus.ARCHIVED,
            };
          });

          await deleteEstimateById(estimateToDelete.id);
          const updatedEstimates = estimates
            .filter(e => e.id !== estimateToDelete.id)
            .map(e => reparented.find(r => r.id === e.id) ?? e);
          await saveEstimates(updatedEstimates);
          setEstimates(updatedEstimates);
          consumeDeleteLimit();
          setSync({ visible: true, message: 'Версия удалена, главная обновлена', type: 'success' });
        } else {
          await deleteEstimateById(estimateToDelete.id);
          const updatedEstimates = estimates.filter(e => e.id !== estimateToDelete.id);
          await saveEstimates(updatedEstimates);
          setEstimates(updatedEstimates);
          consumeDeleteLimit();
          setSync({ visible: true, message: 'Версия сметы удалена', type: 'success' });
        }
      }
      setTimeout(() => setSync(s => ({ ...s, visible: false })), 2000);
    } catch (error) {
      console.error('Failed to delete estimate version from DB:', error);
      setSync({ visible: true, message: 'Ошибка удаления версии в БД', type: 'error' });
      setTimeout(() => setSync(s => ({ ...s, visible: false })), 4000);
    }
  }, [subscriptionUsage, subscriptionLimits, goToView, estimates, setEstimates, consumeDeleteLimit, setSync]);

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
    handleSaveAsTemplate,
    handleDeleteTemplate,
  };
};
