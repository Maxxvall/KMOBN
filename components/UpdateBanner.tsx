import React from 'react';
import type { UpdateDownloadProgress } from '../electron/types';
import { formatBytes } from '../services/format';

interface UpdateBannerProps {
  version: string;
  downloaded: boolean;
  downloading: boolean;
  progress: UpdateDownloadProgress | null;
  onDownload: () => void;
  onInstall: () => void;
  onDismiss: () => void;
}

const UpdateBanner: React.FC<UpdateBannerProps> = ({ version, downloaded, downloading, progress, onDownload, onInstall, onDismiss }) => {
  const isDownloading = downloading && !downloaded;
  const percent = progress ? Math.min(100, Math.max(0, Math.round(progress.percent))) : 0;

  return (
    <div className="bg-gradient-to-r from-blue-600/90 to-indigo-600/90 text-white px-4 py-3 flex items-center justify-between gap-4 text-sm backdrop-blur-sm border-b border-blue-500/30">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <svg
          className={`w-5 h-5 shrink-0 ${isDownloading ? 'animate-pulse' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        <span className="truncate">
          {downloaded
            ? `Обновление v${version} готово к установке`
            : isDownloading
              ? `Загрузка обновления v${version}`
              : `Доступна версия v${version}`}
        </span>
        {isDownloading && (
          <div
            className="flex flex-1 items-center gap-2 min-w-[4rem]"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-label="Прогресс загрузки обновления"
          >
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/25">
              <div
                className="h-full rounded-full bg-white transition-[width] duration-300 ease-out"
                style={{ width: `${percent}%` }}
              />
            </div>
            <span className="shrink-0 text-xs font-semibold tabular-nums">{percent}%</span>
            {progress && (
              <span className="hidden lg:inline shrink-0 text-xs text-white/70">
                {formatBytes(progress.bytesPerSecond)}/с
              </span>
            )}
          </div>
        )}
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
          !isDownloading && (
            <button
              onClick={onDownload}
              className="px-4 py-1.5 bg-white text-blue-600 rounded-md font-semibold hover:bg-blue-50 transition-colors active:scale-95"
            >
              Скачать
            </button>
          )
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
