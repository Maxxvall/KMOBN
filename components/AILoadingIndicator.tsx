import React from 'react';

const AILoadingIndicator = ({ message }: { message: string }) => {
  return (
    <div className="p-3 border border-border bg-background/40 rounded-md">
      <div className="flex items-center gap-3">
        <div className="text-lg" aria-hidden>
          🤖
        </div>
        <div className="flex-1">
          <div className="font-semibold text-text-primary">{message}</div>
          <div className="text-sm text-text-secondary">Анализирую историю смет и генерирую рекомендации...</div>
        </div>
      </div>
    </div>
  );
};

export default AILoadingIndicator;
