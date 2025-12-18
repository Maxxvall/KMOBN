import React, { useEffect, useState } from 'react';

const AIGenerationModal = ({
  isOpen,
  initialValue,
  onCancel,
  onConfirm,
}: {
  isOpen: boolean;
  initialValue?: string;
  onCancel: () => void;
  onConfirm: (description: string) => void;
}) => {
  const [value, setValue] = useState(initialValue || '');

  useEffect(() => {
    if (isOpen) setValue(initialValue || '');
  }, [isOpen, initialValue]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} />
      <div className="relative w-full max-w-2xl mx-4 bg-surface border border-border rounded-lg shadow-2xl">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="font-bold text-text-primary">🤖 Уточнение для AI-генерации</div>
          <button onClick={onCancel} className="text-text-secondary hover:text-text-primary">✖</button>
        </div>

        <div className="p-4 space-y-3">
          <div className="text-sm text-text-secondary">
            Опишите, для чего смета и какие разделы/работы нужны. Примеры: «дом под ключ без электрики и сантехники», «ремонт крыши», «только работы без материалов».
          </div>
          <textarea
            value={value}
            onChange={e => setValue(e.target.value)}
            rows={6}
            className="w-full p-3 bg-background border border-border rounded-md text-text-primary focus:ring-primary focus:border-primary"
            placeholder="Например: Дом под ключ 110 м², без электрики и сантехники. Нужны фундамент, стены, кровля, окна/двери."
          />
        </div>

        <div className="p-4 border-t border-border flex justify-end gap-2">
          <button onClick={onCancel} className="text-sm bg-gray-600 hover:bg-gray-500 text-text-primary font-bold py-2 px-4 rounded transition-colors">
            Отмена
          </button>
          <button
            onClick={() => onConfirm(value.trim())}
            className="bg-primary hover:bg-primary-hover text-white font-bold py-2 px-4 rounded-md transition-colors"
          >
            Сгенерировать
          </button>
        </div>
      </div>
    </div>
  );
};

export default AIGenerationModal;
