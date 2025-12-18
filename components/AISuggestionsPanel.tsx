import React from 'react';
import { EstimateItem } from '../types';

const AISuggestionsPanel = ({
  suggestions,
  onAccept,
  onReject,
}: {
  suggestions: EstimateItem[];
  onAccept: (item: EstimateItem) => void;
  onReject: (item: EstimateItem) => void;
}) => {
  if (!suggestions || suggestions.length === 0) return null;

  return (
    <div className="p-4 bg-background/30 border border-border rounded-md">
      <h3 className="font-bold text-text-primary mb-3">🤖 AI рекомендует добавить:</h3>
      <div className="space-y-2">
        {suggestions.map(item => (
          <div key={item.id} className="flex items-start justify-between gap-3 p-2 border border-border rounded-md bg-background/20">
            <div className="flex-1">
              <div className="font-semibold text-text-primary">{item.name}</div>
              <div className="text-sm text-text-secondary">
                {item.quantity} {item.unit} × {item.price.toLocaleString('ru-RU')} ₽
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => onAccept(item)}
                className="text-sm bg-gray-600 hover:bg-gray-500 text-text-primary font-bold py-1 px-3 rounded transition-colors"
              >
                ✓ Добавить
              </button>
              <button
                onClick={() => onReject(item)}
                className="text-sm bg-gray-600 hover:bg-gray-500 text-text-primary font-bold py-1 px-3 rounded transition-colors"
              >
                ✗ Отклонить
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AISuggestionsPanel;
