import React from 'react';
import { ESTIMATE_CATEGORIES } from '../constants';
import { EstimateItem, EstimateSubgroup } from '../types';

const AIMissingItemsModal = ({
  isOpen,
  onClose,
  missing,
  optional,
  reasoning,
  onAddItem,
  addedItemIds,
}: {
  isOpen: boolean;
  onClose: () => void;
  missing: EstimateItem[];
  optional: EstimateItem[];
  reasoning: string[];
  onAddItem: (item: EstimateItem) => void;
  addedItemIds?: Set<string>;
}) => {
  if (!isOpen) return null;

  const grouped = (() => {
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

    // stable order by app's category order first, then any extra categories
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
  })();

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-3xl mx-4 bg-surface border border-border rounded-lg shadow-2xl">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="font-bold text-text-primary">🤖 AI-анализ сметы</div>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary">✖</button>
        </div>

        <div className="p-4 space-y-4 max-h-[70vh] overflow-auto">
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
        </div>

        <div className="p-4 border-t border-border flex justify-end">
          <button onClick={onClose} className="bg-primary hover:bg-primary-hover text-white font-bold py-2 px-4 rounded-md transition-colors">
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};

export default AIMissingItemsModal;
