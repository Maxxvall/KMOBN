import React from 'react';

interface UpdateBannerProps {
  version: string;
  downloaded: boolean;
  onDownload: () => void;
  onInstall: () => void;
  onDismiss: () => void;
}

const UpdateBanner: React.FC<UpdateBannerProps> = ({ version, downloaded, onDownload, onInstall, onDismiss }) => {
  return (
    <div className="bg-gradient-to-r from-blue-600/90 to-indigo-600/90 text-white px-4 py-3 flex items-center justify-between gap-4 text-sm backdrop-blur-sm border-b border-blue-500/30">
      <div className="flex items-center gap-2 min-w-0">
        <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        <span className="truncate">
          {downloaded
            ? `Обновление v${version} готово к установке`
            : `Доступна версия v${version}`}
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {downloaded ? (
          <button
            onClick={onInstall}
            className="px-4 py-1.5 bg-white text-blue-600 rounded-md font-semibold hover:bg-blue-50 transition-colors active:scale-95"
          >
            Установить
          </button>
        ) : (
          <button
            onClick={onDownload}
            className="px-4 py-1.5 bg-white text-blue-600 rounded-md font-semibold hover:bg-blue-50 transition-colors active:scale-95"
          >
            Скачать
          </button>
        )}
        <button
          onClick={onDismiss}
          className="p-1.5 hover:bg-white/20 rounded-md transition-colors"
          aria-label="Закрыть"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default UpdateBanner;
