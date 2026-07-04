import React, { useCallback, useMemo, useState } from 'react';
import { ESTIMATE_CATEGORIES } from '../types';
import { EstimateCategory, EstimateItem, EstimateSubgroup } from '../types';

export type NotInDbItem = {
  name: string;
  unit: string;
  quantity: number;
  price: number;
  category: EstimateCategory;
  subgroup: EstimateSubgroup;
};

const AIMissingItemsModal = ({
  isOpen,
  onClose,
  missing,
  optional,
  reasoning,
  onAddItem,
  addedItemIds,
  notInDbItems,
  onAddToCatalog,
  addedToCatalogNames,
}: {
  isOpen: boolean;
  onClose: () => void;
  missing: EstimateItem[];
  optional: EstimateItem[];
  reasoning: string[];
  onAddItem: (item: EstimateItem) => void;
  addedItemIds?: Set<string>;
  /** Items that AI wanted to add but they are not in the DB catalogs */
  notInDbItems?: NotInDbItem[];
  /** Callback to add material/work to the catalog */
  onAddToCatalog?: (item: NotInDbItem) => void;
  /** Names already added to catalog in this session */
  addedToCatalogNames?: Set<string>;
}) => {
  const [activeTab, setActiveTab] = useState<'recommendations' | 'notInDb'>('recommendations');

  const hasNotInDb = (notInDbItems?.length ?? 0) > 0;

  const grouped = useMemo(() => {
    type Entry = { item: EstimateItem; priority: 'critical' | 'recommended' };
    type Group = { materials: Entry[]; works: Entry[]; delivery: Entry[] };

    const map = new Map<string, Group>();
    const ensure = (category: string): Group => {
      const existing = map.get(category);
      if (existing) return existing;
      const g: Group = { materials: [], works: [], delivery: [] };
      map.set(category, g);
      return g;
    };

    const push = (item: EstimateItem, priority: Entry['priority']) => {
      const cat = item.category || 'ОБЩАЯ';
      const g = ensure(cat);
      const sg = item.subgroup || EstimateSubgroup.WORKS;
      const entry: Entry = { item, priority };
      if (sg === EstimateSubgroup.MATERIALS) g.materials.push(entry);
      else if (sg === EstimateSubgroup.DELIVERY) g.delivery.push(entry);
      else g.works.push(entry);
    };

    (missing || []).forEach((it) => push(it, 'critical'));
    (optional || []).forEach((it) => push(it, 'recommended'));

    const orderedCats = [
      ...ESTIMATE_CATEGORIES,
      ...Array.from(map.keys()).filter((c) => !ESTIMATE_CATEGORIES.includes(c as any)),
    ];

    return orderedCats
      .filter((c) => {
        const g = map.get(c);
        return g && (g.materials.length + g.works.length + g.delivery.length) > 0;
      })
      .map((c) => ({ category: c, group: map.get(c)! }));
  }, [missing, optional]);

  const handleAddAllMissing = useCallback(() => {
    const allItems = [...(missing || []), ...(optional || [])];
    for (const item of allItems) {
      if (addedItemIds?.has(item.id)) continue;
      onAddItem(item);
    }
  }, [missing, optional, addedItemIds, onAddItem]);

  const handleAddAllToCatalog = useCallback(() => {
    if (!onAddToCatalog || !notInDbItems) return;
    for (const item of notInDbItems) {
      if (addedToCatalogNames?.has(item.name)) continue;
      onAddToCatalog(item);
    }
  }, [notInDbItems, onAddToCatalog, addedToCatalogNames]);

  if (!isOpen) return null;

  const totalRecommendations = (missing?.length ?? 0) + (optional?.length ?? 0);

  const renderEntry = (entry: { item: EstimateItem; priority: 'critical' | 'recommended' }) => {
    const it = entry.item;
    const label = entry.priority === 'critical' ? 'Критично' : 'Рекомендуется';
    const labelClass = entry.priority === 'critical' ? 'bg-red-500/20 text-red-300' : 'bg-gray-500/20 text-text-secondary';

    return (
      <div key={`${it.id}-${entry.priority}`} className="flex items-start justify-between gap-3 p-2 border border-border rounded-md bg-background/20">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="font-semibold text-text-primary">{it.name}</div>
            <span className={`text-xs px-2 py-0.5 rounded ${labelClass}`}>{label}</span>
          </div>
          <div className="text-sm text-text-secondary">{it.quantity} {it.unit} × {it.price.toLocaleString('ru-RU')} ₽</div>
        </div>
        <button
          onClick={() => onAddItem(it)}
          disabled={addedItemIds?.has(it.id)}
          className={`text-sm font-bold py-1 px-3 rounded transition-colors ${addedItemIds?.has(it.id) ? 'bg-gray-500 text-text-secondary cursor-not-allowed' : 'bg-gray-600 hover:bg-gray-500 text-text-primary'}`}
        >
          {addedItemIds?.has(it.id) ? 'Добавлено' : '+ Добавить'}
        </button>
      </div>
    );
  };

  const renderNotInDbEntry = (item: NotInDbItem, idx: number) => {
    const isAdded = addedToCatalogNames?.has(item.name);
    const isMaterial = item.subgroup === EstimateSubgroup.MATERIALS;
    return (
      <div key={`notindb-${idx}`} className="flex items-start justify-between gap-3 p-2 border border-border rounded-md bg-background/20">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="font-semibold text-text-primary">{item.name}</div>
            <span className={`text-xs px-2 py-0.5 rounded ${isMaterial ? 'bg-blue-500/20 text-blue-300' : 'bg-purple-500/20 text-purple-300'}`}>
              {isMaterial ? 'Материал' : 'Работа'}
            </span>
            <span className="text-xs px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-300">
              Нет в БД
            </span>
          </div>
          <div className="text-sm text-text-secondary">
            {item.quantity} {item.unit} · {item.category}
          </div>
        </div>
        {onAddToCatalog && (
          <button
            onClick={() => onAddToCatalog(item)}
            disabled={isAdded}
            className={`text-sm font-bold py-1 px-3 rounded transition-colors whitespace-nowrap ${
              isAdded
                ? 'bg-green-500/20 text-green-300 cursor-not-allowed'
                : 'bg-primary/80 hover:bg-primary text-white'
            }`}
          >
            {isAdded ? '✓ В каталоге' : '+ В каталог'}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-3xl mx-4 bg-surface border border-border rounded-lg shadow-2xl max-h-[90vh] flex flex-col">
        <div className="p-4 border-b border-border flex items-center justify-between shrink-0">
          <div className="font-bold text-text-primary">🤖 AI-анализ сметы</div>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary text-lg">✖</button>
        </div>

        {/* Tabs */}
        {hasNotInDb && (
          <div className="px-4 pt-3 pb-0 border-b border-border/50 shrink-0 flex gap-1">
            <button
              onClick={() => setActiveTab('recommendations')}
              className={`px-4 py-2 text-sm font-semibold rounded-t-md transition-colors ${
                activeTab === 'recommendations'
                  ? 'bg-surface border border-border border-b-transparent text-text-primary -mb-px'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Рекомендации ({totalRecommendations})
            </button>
            <button
              onClick={() => setActiveTab('notInDb')}
              className={`px-4 py-2 text-sm font-semibold rounded-t-md transition-colors flex items-center gap-1.5 ${
                activeTab === 'notInDb'
                  ? 'bg-surface border border-border border-b-transparent text-text-primary -mb-px'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <span className="w-5 h-5 rounded-full bg-yellow-500/20 text-yellow-300 text-xs flex items-center justify-center font-bold">
                {notInDbItems?.length ?? 0}
              </span>
              Нет в БД
            </button>
          </div>
        )}

        <div className="p-4 space-y-4 overflow-auto flex-1">
          {activeTab === 'recommendations' && (
            <>
              {reasoning && reasoning.length > 0 && (
                <div className="p-3 border border-border rounded-md bg-background/30">
                  <div className="font-semibold text-text-primary mb-2">Обоснование</div>
                  <ul className="list-disc pl-5 text-sm text-text-secondary space-y-1">
                    {reasoning.map((r, idx) => (
                      <li key={idx}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Bulk add button */}
              {totalRecommendations > 1 && (
                <div className="flex justify-end">
                  <button
                    onClick={handleAddAllMissing}
                    className="text-sm bg-primary/80 hover:bg-primary text-white font-bold py-1.5 px-4 rounded transition-colors"
                  >
                    + Добавить все ({totalRecommendations})
                  </button>
                </div>
              )}

              <div className="p-3 border border-border rounded-md bg-background/20">
                <div className="font-semibold text-text-primary mb-2">Рекомендации по разделам</div>
                {grouped.length === 0 ? (
                  <div className="text-sm text-text-secondary">Нет рекомендаций.</div>
                ) : (
                  <div className="space-y-4">
                    {grouped.map(({ category, group }) => (
                      <div key={category} className="border border-border rounded-md bg-background/10">
                        <div className="p-2 border-b border-border bg-gray-900/30 font-semibold text-text-primary">{category}</div>
                        <div className="p-2 space-y-3">
                          {group.works.length > 0 && (
                            <div className="space-y-2">
                              <div className="text-sm font-semibold text-text-secondary">Работы</div>
                              <div className="space-y-2">
                                {group.works.map(renderEntry)}
                              </div>
                            </div>
                          )}

                          {group.materials.length > 0 && (
                            <div className="space-y-2">
                              <div className="text-sm font-semibold text-text-secondary">Материалы</div>
                              <div className="space-y-2">
                                {group.materials.map(renderEntry)}
                              </div>
                            </div>
                          )}

                          {group.delivery.length > 0 && (
                            <div className="space-y-2">
                              <div className="text-sm font-semibold text-text-secondary">Доставка</div>
                              <div className="space-y-2">
                                {group.delivery.map(renderEntry)}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {activeTab === 'notInDb' && (
            <>
              <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-md">
                <div className="text-sm text-yellow-300 space-y-1">
                  <div><strong>Позиции не найдены в справочниках</strong></div>
                  <div className="text-xs">
                    AI хотел добавить эти позиции в смету, но не нашёл их в вашей базе материалов и работ.
                    Нажмите «В каталог», чтобы добавить их в справочник — после этого они будут доступны для всех будущих смет.
                  </div>
                </div>
              </div>

              {/* Bulk add to catalog */}
              {(notInDbItems?.length ?? 0) > 1 && onAddToCatalog && (
                <div className="flex justify-end">
                  <button
                    onClick={handleAddAllToCatalog}
                    className="text-sm bg-primary/80 hover:bg-primary text-white font-bold py-1.5 px-4 rounded transition-colors"
                  >
                    + Добавить всё в каталог ({notInDbItems?.length})
                  </button>
                </div>
              )}

              <div className="space-y-2">
                {(notInDbItems || []).map((item, idx) => renderNotInDbEntry(item, idx))}
              </div>
            </>
          )}
        </div>

        <div className="p-4 border-t border-border flex justify-end shrink-0">
          <button onClick={onClose} className="bg-primary hover:bg-primary-hover text-white font-bold py-2 px-4 rounded-md transition-colors">
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};

export default AIMissingItemsModal;
