import React from 'react';
import { EstimateItem } from '../types';

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
            <div className="font-semibold text-text-primary mb-2">Критически важные недостающие позиции</div>
            {missing.length === 0 ? (
              <div className="text-sm text-text-secondary">Нет рекомендаций.</div>
            ) : (
              <div className="space-y-2">
                {missing.map(it => (
                  <div key={it.id} className="flex items-start justify-between gap-3 p-2 border border-border rounded-md bg-background/20">
                    <div className="flex-1">
                      <div className="font-semibold text-text-primary">{it.name}</div>
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
                ))}
              </div>
            )}
          </div>

          <div className="p-3 border border-border rounded-md bg-background/20">
            <div className="font-semibold text-text-primary mb-2">Рекомендуемые дополнительные позиции</div>
            {optional.length === 0 ? (
              <div className="text-sm text-text-secondary">Нет рекомендаций.</div>
            ) : (
              <div className="space-y-2">
                {optional.map(it => (
                  <div key={it.id} className="flex items-start justify-between gap-3 p-2 border border-border rounded-md bg-background/20">
                    <div className="flex-1">
                      <div className="font-semibold text-text-primary">{it.name}</div>
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
