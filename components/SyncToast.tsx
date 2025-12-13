import React from 'react';

type Props = {
  visible: boolean;
  message?: string;
  type?: 'success' | 'error' | 'info';
  onClose?: () => void;
};

const bgFor = (t?: Props['type']) => {
  switch (t) {
    case 'success': return 'bg-green-600';
    case 'error': return 'bg-red-600';
    default: return 'bg-slate-700';
  }
};

const SyncToast: React.FC<Props> = ({ visible, message, type = 'info', onClose }) => {
  if (!visible) return null;

  return (
    <div className={`fixed right-4 bottom-6 z-50 max-w-xs w-full ${bgFor(type)} text-white rounded shadow-lg`} role="status">
      <div className="px-4 py-3">
        <div className="flex items-start">
          <div className="flex-1 text-sm">{message}</div>
          <button onClick={onClose} className="ml-3 text-white opacity-90 hover:opacity-100">✕</button>
        </div>
      </div>
    </div>
  );
};

export default SyncToast;
