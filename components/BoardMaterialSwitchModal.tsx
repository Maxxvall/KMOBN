import React, { useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom';
import FocusLock from 'react-focus-lock';
import { BoardSpec, Estimate, Material } from '../types';
import {
  BoardSwitchPlan,
  formatBoardDimensions,
} from '../services/boardMaterialSwitch';

type BoardSwitchApplySelection = {
  selectedItemIds: Set<string>;
  targetMaterialIdsByItemId: Record<string, string>;
};

type Props = {
  isOpen: boolean;
  plan: BoardSwitchPlan | null;
  estimate: Estimate;
  materials: Material[];
  onClose: () => void;
  onApply: (selection: BoardSwitchApplySelection) => void;
  onAddMaterial?: (
    name: string,
    category: Material['category'],
    price?: number,
    link?: string,
    boardSpec?: BoardSpec,
  ) => Promise<Material | null>;
  onUpdateMaterial?: (material: Material) => Promise<Material | null>;
};

const targetLabel = (plan: BoardSwitchPlan): string => (
  plan.target === 'dry-planed' ? 'СС' : 'ЕВ'
);

const sourceLabel = (plan: BoardSwitchPlan): string => (
  plan.target === 'dry-planed' ? 'ЕВ' : 'СС'
);

const BoardMaterialSwitchModal: React.FC<Props> = ({
  isOpen,
  plan,
  estimate,
  materials,
  onClose,
  onApply,
  onAddMaterial,
  onUpdateMaterial,
}) => {
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [manualTargets, setManualTargets] = useState<Record<string, string>>({});
  const [missingPrices, setMissingPrices] = useState<Record<string, string>>({});
  const [unpricedValues, setUnpricedValues] = useState<Record<string, string>>({});
  const [ambiguousPrices, setAmbiguousPrices] = useState<Record<string, string>>({});
  const [isSavingCatalog, setIsSavingCatalog] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !plan) return;
    setSelectedItemIds(new Set(plan.replacements.map(replacement => replacement.itemId)));
    setManualTargets({});
    setMissingPrices({});
    setUnpricedValues(Object.fromEntries(plan.unpriced.map(entry => [entry.targetMaterial.id, String(entry.targetMaterial.price || '')])));
    setAmbiguousPrices({});
    setCatalogError(null);
  }, [isOpen, plan]);

  useEffect(() => {
    if (!isOpen || isSavingCatalog) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, isSavingCatalog, onClose]);

  const itemsById = useMemo(() => new Map(estimate.items.map(item => [item.id, item])), [estimate.items]);
  const materialsById = useMemo(() => new Map(materials.map(material => [material.id, material])), [materials]);

  const manuallyResolvedItemIds = useMemo(() => Object.entries(manualTargets)
    .filter(([, materialId]) => {
      const material = materialsById.get(materialId);
      return Boolean(material && Number.isFinite(material.price) && material.price > 0);
    })
    .map(([itemId]) => itemId), [manualTargets, materialsById]);

  const resolvedManualTargets = useMemo(() => Object.fromEntries(
    manuallyResolvedItemIds.map(itemId => [itemId, manualTargets[itemId]]),
  ), [manualTargets, manuallyResolvedItemIds]);

  const ambiguousUnpricedMaterials = useMemo(() => {
    const result = new Map<string, Material>();
    for (const materialId of Object.values(manualTargets)) {
      const material = materialsById.get(materialId);
      if (material && (!Number.isFinite(material.price) || material.price <= 0)) result.set(material.id, material);
    }
    return [...result.values()];
  }, [manualTargets, materialsById]);

  const selectedCount = selectedItemIds.size + manuallyResolvedItemIds.length;
  const priceDelta = useMemo(() => {
    if (!plan) return 0;
    let delta = 0;
    for (const replacement of plan.replacements) {
      if (!selectedItemIds.has(replacement.itemId)) continue;
      const item = itemsById.get(replacement.itemId);
      if (item) delta += item.quantity * (replacement.targetMaterial.price - item.price);
    }
    for (const itemId of manuallyResolvedItemIds) {
      const item = itemsById.get(itemId);
      const material = materialsById.get(manualTargets[itemId]);
      if (item && material) delta += item.quantity * (material.price - item.price);
    }
    return delta;
  }, [itemsById, manuallyResolvedItemIds, manualTargets, materialsById, plan, selectedItemIds]);

  if (!isOpen || !plan || typeof document === 'undefined') return null;

  const toggleItem = (itemId: string) => {
    setSelectedItemIds(previous => {
      const next = new Set(previous);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const handleCatalogSave = async () => {
    if (
      (!onAddMaterial && plan.missing.length > 0)
      || (!onUpdateMaterial && (plan.unpriced.length > 0 || ambiguousUnpricedMaterials.length > 0))
    ) return;
    const invalidMissing = plan.missing.some(entry => !(Number(missingPrices[entry.sourceMaterial.id]) > 0));
    const invalidUnpriced = plan.unpriced.some(entry => !(Number(unpricedValues[entry.targetMaterial.id]) > 0));
    const invalidAmbiguous = ambiguousUnpricedMaterials.some(material => !(Number(ambiguousPrices[material.id]) > 0));
    if (invalidMissing || invalidUnpriced || invalidAmbiguous) {
      setCatalogError('Укажите цену больше нуля для каждой позиции.');
      return;
    }

    setIsSavingCatalog(true);
    setCatalogError(null);
    try {
      for (const entry of plan.missing) {
        const created = await onAddMaterial?.(
          entry.suggestedName,
          entry.sourceMaterial.category,
          Number(missingPrices[entry.sourceMaterial.id]),
          undefined,
          entry.targetSpec,
        );
        if (!created) throw new Error(`Не удалось добавить «${entry.suggestedName}».`);
      }
      for (const entry of plan.unpriced) {
        const updated = await onUpdateMaterial?.({
          ...entry.targetMaterial,
          price: Number(unpricedValues[entry.targetMaterial.id]),
          isManualPrice: true,
        });
        if (!updated) throw new Error(`Не удалось обновить цену «${entry.targetMaterial.name}».`);
      }
      for (const material of ambiguousUnpricedMaterials) {
        const updated = await onUpdateMaterial?.({
          ...material,
          price: Number(ambiguousPrices[material.id]),
          isManualPrice: true,
        });
        if (!updated) throw new Error(`Не удалось обновить цену «${material.name}».`);
      }
    } catch (error) {
      setCatalogError(error instanceof Error ? error.message : 'Не удалось обновить каталог. Смета не изменена.');
    } finally {
      setIsSavingCatalog(false);
    }
  };

  const problemCount = plan.missing.length + plan.unpriced.length + plan.ambiguous.length;
  const modal = (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/80 sm:items-center sm:p-4"
      onMouseDown={(event) => { if (!isSavingCatalog && event.target === event.currentTarget) onClose(); }}
    >
      <FocusLock returnFocus>
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="board-switch-title"
          aria-describedby="board-switch-description"
          className="flex max-h-[100dvh] w-screen flex-col overflow-hidden bg-surface shadow-2xl sm:max-h-[90vh] sm:max-w-5xl sm:rounded-xl sm:border sm:border-border"
        >
          <header className="shrink-0 border-b border-border p-4 sm:p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="board-switch-title" className="text-lg font-bold text-text-primary sm:text-xl">
                  Вся доска: {sourceLabel(plan)} → {targetLabel(plan)}
                </h2>
                <p id="board-switch-description" className="mt-1 text-sm text-text-secondary">
                  Проверьте размеры и цены. Смета изменится только после подтверждения.
                </p>
              </div>
              <button type="button" onClick={onClose} disabled={isSavingCatalog} aria-label="Закрыть" className="min-h-[44px] min-w-[44px] rounded-md text-2xl text-text-secondary hover:bg-background disabled:opacity-50">×</button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              <div className="rounded-md bg-background/60 p-2"><span className="block text-xs text-text-secondary">Готово</span><strong>{plan.replacements.length}</strong></div>
              <div className="rounded-md bg-background/60 p-2"><span className="block text-xs text-text-secondary">Нужно проверить</span><strong>{problemCount}</strong></div>
              <div className="rounded-md bg-background/60 p-2"><span className="block text-xs text-text-secondary">Выбрано</span><strong>{selectedCount}</strong></div>
              <div className="rounded-md bg-background/60 p-2"><span className="block text-xs text-text-secondary">Изменение</span><strong className={priceDelta > 0 ? 'text-amber-300' : 'text-emerald-300'}>{priceDelta > 0 ? '+' : ''}{priceDelta.toLocaleString('ru-RU')} ₽</strong></div>
            </div>
          </header>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 sm:p-5">
            {plan.replacements.length > 0 && (
              <section>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 className="font-semibold text-text-primary">Доступные замены</h3>
                  <button
                    type="button"
                    onClick={() => setSelectedItemIds(new Set(plan.replacements.map(replacement => replacement.itemId)))}
                    className="min-h-[44px] rounded-md px-2 text-xs font-semibold text-primary hover:bg-background"
                  >
                    Выбрать все
                  </button>
                </div>
                <div className="space-y-2">
                  {plan.replacements.map(replacement => {
                    const item = itemsById.get(replacement.itemId);
                    if (!item) return null;
                    return (
                      <label key={replacement.itemId} className="grid cursor-pointer gap-3 rounded-lg border border-border bg-background/35 p-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
                        <input type="checkbox" checked={selectedItemIds.has(replacement.itemId)} onChange={() => toggleItem(replacement.itemId)} className="h-5 w-5 accent-primary" aria-label={`Заменить ${item.name} на ${replacement.targetMaterial.name}`} />
                        <div className="min-w-0">
                          <div className="text-sm text-text-secondary">{item.name}</div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 font-semibold text-text-primary">
                            <span className="rounded bg-black/20 px-2 py-1">{replacement.sourceMaterial.boardSpec ? formatBoardDimensions(replacement.sourceMaterial.boardSpec) : '—'}</span>
                            <span aria-hidden="true" className="text-primary">→</span>
                            <span className="rounded bg-primary/10 px-2 py-1 text-primary">{replacement.targetMaterial.boardSpec ? formatBoardDimensions(replacement.targetMaterial.boardSpec) : '—'}</span>
                          </div>
                          <div className="mt-1 truncate text-xs text-text-secondary">{replacement.targetMaterial.name}</div>
                        </div>
                        <div className="text-right text-sm tabular-nums">
                          <div>{item.quantity} {item.unit}</div>
                          <div className="text-text-secondary">{item.price.toLocaleString('ru-RU')} → {replacement.targetMaterial.price.toLocaleString('ru-RU')} ₽</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </section>
            )}

            {(plan.missing.length > 0 || plan.unpriced.length > 0 || ambiguousUnpricedMaterials.length > 0) && (
              <section className="rounded-lg border border-amber-500/35 bg-amber-500/10 p-3 sm:p-4">
                <h3 className="font-semibold text-amber-100">Нет материала или цены</h3>
                <p className="mt-1 text-sm text-amber-100/75">Заполните цены — позиции добавятся или обновятся в каталоге, затем список замен проверится заново.</p>
                <div className="mt-3 space-y-3">
                  {plan.missing.map(entry => (
                    <div key={entry.sourceMaterial.id} className="grid gap-2 rounded-md bg-background/55 p-3 sm:grid-cols-[minmax(0,1fr)_150px] sm:items-center">
                      <div><div className="font-medium text-text-primary">{entry.suggestedName}</div><div className="text-xs text-text-secondary">Нет в каталоге · затронуто строк: {entry.affectedItemIds.length}</div></div>
                      <input type="number" min="0.01" step="0.01" value={missingPrices[entry.sourceMaterial.id] ?? ''} onChange={(event) => setMissingPrices(current => ({ ...current, [entry.sourceMaterial.id]: event.target.value }))} placeholder="Цена, ₽" aria-label={`Цена ${entry.suggestedName}`} className="min-h-[44px] rounded-md border border-border bg-background p-2 text-right text-text-primary" />
                    </div>
                  ))}
                  {plan.unpriced.map(entry => (
                    <div key={entry.targetMaterial.id} className="grid gap-2 rounded-md bg-background/55 p-3 sm:grid-cols-[minmax(0,1fr)_150px] sm:items-center">
                      <div><div className="font-medium text-text-primary">{entry.targetMaterial.name}</div><div className="text-xs text-text-secondary">Материал есть, цена не заполнена</div></div>
                      <input type="number" min="0.01" step="0.01" value={unpricedValues[entry.targetMaterial.id] ?? ''} onChange={(event) => setUnpricedValues(current => ({ ...current, [entry.targetMaterial.id]: event.target.value }))} placeholder="Цена, ₽" aria-label={`Цена ${entry.targetMaterial.name}`} className="min-h-[44px] rounded-md border border-border bg-background p-2 text-right text-text-primary" />
                    </div>
                  ))}
                  {ambiguousUnpricedMaterials.map(material => (
                    <div key={`ambiguous-${material.id}`} className="grid gap-2 rounded-md bg-background/55 p-3 sm:grid-cols-[minmax(0,1fr)_150px] sm:items-center">
                      <div><div className="font-medium text-text-primary">{material.name}</div><div className="text-xs text-text-secondary">Выбранный аналог без цены</div></div>
                      <input type="number" min="0.01" step="0.01" value={ambiguousPrices[material.id] ?? ''} onChange={(event) => setAmbiguousPrices(current => ({ ...current, [material.id]: event.target.value }))} placeholder="Цена, ₽" aria-label={`Цена ${material.name}`} className="min-h-[44px] rounded-md border border-border bg-background p-2 text-right text-text-primary" />
                    </div>
                  ))}
                </div>
                {catalogError && <div role="alert" className="mt-3 text-sm font-medium text-red-300">{catalogError}</div>}
                <button type="button" onClick={() => void handleCatalogSave()} disabled={isSavingCatalog || (!onAddMaterial && plan.missing.length > 0) || (!onUpdateMaterial && (plan.unpriced.length > 0 || ambiguousUnpricedMaterials.length > 0))} className="mt-3 min-h-[44px] w-full rounded-md bg-amber-600 px-4 font-bold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">
                  {isSavingCatalog ? 'Сохраняю цены…' : `Добавить / обновить цены (${plan.missing.length + plan.unpriced.length + ambiguousUnpricedMaterials.length})`}
                </button>
              </section>
            )}

            {plan.ambiguous.length > 0 && (
              <section>
                <h3 className="font-semibold text-text-primary">Нужно выбрать аналог</h3>
                <div className="mt-2 space-y-3">
                  {plan.ambiguous.map(entry => (
                    <div key={`${entry.sourceMaterial.id}-${formatBoardDimensions(entry.targetSpec)}`} className="rounded-lg border border-border bg-background/35 p-3">
                      <div className="text-sm font-medium text-text-primary">{entry.sourceMaterial.name} → {formatBoardDimensions(entry.targetSpec)}</div>
                      <select
                        value={manualTargets[entry.affectedItemIds[0]] ?? ''}
                        onChange={(event) => {
                          const materialId = event.target.value;
                          setManualTargets(current => {
                            const next = { ...current };
                            for (const itemId of entry.affectedItemIds) {
                              if (materialId) next[itemId] = materialId;
                              else delete next[itemId];
                            }
                            return next;
                          });
                        }}
                        className="mt-2 min-h-[44px] w-full rounded-md border border-border bg-background p-2 text-text-primary"
                        aria-label={`Выбрать аналог для ${entry.sourceMaterial.name}`}
                      >
                        <option value="">Оставить без изменений</option>
                        {entry.candidates.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.name} — {candidate.price.toLocaleString('ru-RU')} ₽</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {plan.replacements.length === 0 && problemCount === 0 && (
              <div className="rounded-lg border border-border bg-background/35 p-6 text-center text-text-secondary">Нет досок {sourceLabel(plan)} для замены.</div>
            )}
          </div>

          <footer className="shrink-0 border-t border-border bg-surface p-4 sm:flex sm:items-center sm:justify-between sm:gap-3">
            <div aria-live="polite" className="mb-3 text-xs text-text-secondary sm:mb-0">Будут изменены только выбранные плановые строки. Фактические данные сохранятся.</div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <button type="button" onClick={onClose} disabled={isSavingCatalog} className="min-h-[44px] rounded-md border border-border px-4 font-semibold text-text-secondary hover:bg-background disabled:opacity-50">Отмена</button>
              <button
                type="button"
                disabled={selectedCount === 0 || isSavingCatalog}
                onClick={() => onApply({ selectedItemIds, targetMaterialIdsByItemId: resolvedManualTargets })}
                className="min-h-[44px] rounded-md bg-primary px-4 font-bold text-white transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                Заменить выбранные ({selectedCount})
              </button>
            </div>
          </footer>
        </section>
      </FocusLock>
    </div>
  );

  return ReactDOM.createPortal(modal, document.body);
};

export default BoardMaterialSwitchModal;
