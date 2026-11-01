import React from 'react';
import { EstimateStatus } from '../../types';
import { IconArrowLeft } from '@devigner-ui/icons';
import { StatusBadge } from './StatusBadge';

interface EstimateEditorHeaderProps {
    /** Номер сметы; при создании новой не передаётся. */
    estimateNumber?: string;
    status: EstimateStatus;
    onBack?: () => void;
}

// Компактная шапка редактора: номер сметы + бейдж статуса слева, кнопка
// возврата в историю справа (юнит 1, interfaces.md).
export const EstimateEditorHeader: React.FC<EstimateEditorHeaderProps> = ({ estimateNumber, status, onBack }) => (
    <div className="mb-3 flex flex-col gap-2 border-b border-border pb-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <h2 className="text-base font-semibold tracking-tight text-text-primary sm:text-lg">
                {estimateNumber ? `Смета №${estimateNumber}` : 'Новая смета'}
            </h2>
            <StatusBadge status={status} />
        </div>
        <button
            onClick={() => onBack?.()}
            className="flex min-h-[44px] shrink-0 items-center gap-1.5 self-start rounded-lg border border-border px-2.5 py-1.5 text-sm text-text-secondary transition-colors hover:bg-background hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50 active:scale-95 md:min-h-9 sm:self-auto"
        >
            <IconArrowLeft aria-hidden="true" className="size-4" />
            Назад к истории
        </button>
    </div>
);
