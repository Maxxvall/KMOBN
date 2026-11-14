import React from 'react';
import { IconClose, IconDownload } from '@devigner-ui/icons';
import { Island } from './ui/island';
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
    <div className="fixed right-4 top-4 z-50 w-[calc(100%-2rem)] max-w-md">
      <Island open>
        {/* Пилюля → раскрытие: строка статуса, при скачивании добавляется прогресс */}
        <div className="flex w-full min-w-0 flex-col gap-2 py-0.5">
          <div className="flex min-w-0 items-center gap-2">
            <IconDownload
              aria-hidden="true"
              className={`size-5 shrink-0 text-text-primary ${isDownloading ? 'animate-pulse' : ''}`}
            />
            <span className="min-w-0 truncate text-sm text-text-primary">
              {downloaded
                ? `Обновление v${version} готово к установке`
                : isDownloading
                  ? `Загрузка обновления v${version}`
                  : `Доступна версия v${version}`}
            </span>
            <div className="ml-auto flex shrink-0 items-center gap-1.5">
              {downloaded && (
                <button
                  onClick={onInstall}
                  className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-primary-hover active:scale-95"
                >
                  Установить
                </button>
              )}
              {!downloaded && !isDownloading && (
                <button
                  onClick={onDownload}
                  className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-primary-hover active:scale-95"
                >
                  Скачать
                </button>
              )}
              <button
                onClick={onDismiss}
                className="rounded-md p-1.5 text-text-secondary transition-colors hover:bg-white/10 hover:text-text-primary"
                aria-label="Закрыть"
              >
                <IconClose aria-hidden="true" className="size-4" />
              </button>
            </div>
          </div>
          {isDownloading && (
            <div
              className="flex items-center gap-2"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              aria-label="Прогресс загрузки обновления"
            >
              <div className="h-1.5 min-w-[4rem] flex-1 overflow-hidden rounded-full bg-border">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <span className="shrink-0 text-xs font-semibold tabular-nums text-text-primary">{percent}%</span>
              {progress && (
                <span className="hidden shrink-0 text-xs text-text-secondary lg:inline">
                  {formatBytes(progress.bytesPerSecond)}/с
                </span>
              )}
            </div>
          )}
        </div>
      </Island>
    </div>
  );
};

export default UpdateBanner;
