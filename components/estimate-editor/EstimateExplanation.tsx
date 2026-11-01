import React, { useEffect, useRef, useState } from 'react';
import { ESTIMATE_EXPLANATION_MAX_LENGTH } from '../../types';
import { IconChevronDown } from '@devigner-ui/icons';
import { inputStyles } from './shared';

interface EstimateExplanationProps {
    value: string;
    onChange: (value: string) => void;
}

const PLACEHOLDER = 'Например: дом под ключ, тёплый контур, оптимальный или премиум';

// Сворачиваемое поле «Пояснение» (юнит 1, interfaces.md): по умолчанию —
// пилюля в одну строку (R14), пустое значение показывает placeholder (R14.1),
// по клику раскрывается в textarea. Открытость — внутреннее состояние.
export const EstimateExplanation: React.FC<EstimateExplanationProps> = ({ value, onChange }) => {
    const [open, setOpen] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);

    useEffect(() => {
        if (open) textareaRef.current?.focus();
    }, [open]);

    if (!open) {
        return (
            <div className="mb-2.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    title="Пояснение для расчёта дома"
                    aria-expanded={false}
                    className="flex min-h-[44px] min-w-0 flex-1 basis-64 items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 text-left transition-colors hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary/50 md:min-h-9"
                >
                    <span className="shrink-0 text-[11px] font-semibold text-text-secondary">Пояснение</span>
                    <span className={`min-w-0 flex-1 truncate text-sm ${value ? 'text-text-primary' : 'text-text-secondary'}`}>
                        {value || PLACEHOLDER}
                    </span>
                    <IconChevronDown aria-hidden="true" className="size-4 shrink-0 text-text-secondary" />
                </button>
                <span className="hidden shrink-0 text-[11px] text-text-secondary xl:inline">
                    Внутреннее поле — не выводится в документах
                </span>
            </div>
        );
    }

    return (
        <div className="mb-2.5 min-w-0">
            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-[11px] font-medium text-text-secondary">
                <span>Пояснение для расчёта дома</span>
                <span className="font-normal">Внутреннее поле — не выводится в документах</span>
            </div>
            <textarea
                ref={textareaRef}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                maxLength={ESTIMATE_EXPLANATION_MAX_LENGTH}
                placeholder={PLACEHOLDER}
                rows={2}
                className={`${inputStyles} min-h-[72px] min-w-0 resize-y py-2 leading-5 focus:outline-none focus:ring-2 focus:ring-primary/50`}
            />
            <div className="mt-1 flex justify-end">
                <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded px-2 py-1 text-xs text-text-secondary transition-colors hover:bg-white/5 hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                    Свернуть
                </button>
            </div>
        </div>
    );
};
