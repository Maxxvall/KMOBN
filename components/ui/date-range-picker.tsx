import React from 'react';
import { IconCalendar } from '@devigner-ui/icons';

// Adapted from the devignerui "date-range-picker" recipe for this project's
// dark theme. The original popover calendar depends on motion/react and the
// devignerui runtime; per spec the fallback is native date inputs inside one
// bordered control — same contract (from/to, ISO yyyy-mm-dd), no new deps.

export interface DateRangePickerProps {
    /** Начало периода, ISO yyyy-mm-dd; '' — не задано. */
    from?: string;
    /** Конец периода, ISO yyyy-mm-dd; '' — не задано. */
    to?: string;
    onFromChange: (value: string) => void;
    onToChange: (value: string) => void;
    /** Доступные имена полей «с»/«по». */
    fromLabel?: string;
    toLabel?: string;
    className?: string;
}

const inputClass =
    'min-h-[44px] w-[132px] bg-transparent px-1.5 text-sm text-text-primary tabular-nums focus:outline-none md:min-h-9';

export const DateRangePicker: React.FC<DateRangePickerProps> = ({
    from = '',
    to = '',
    onFromChange,
    onToChange,
    fromLabel = 'Период с',
    toLabel = 'Период по',
    className,
}) => (
    <div
        role="group"
        aria-label={`${fromLabel} — ${toLabel}`}
        className={`flex items-center gap-1 rounded-lg border border-border bg-background/60 px-2 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30 ${className ?? ''}`}
    >
        <IconCalendar aria-hidden="true" className="size-4 shrink-0 text-text-secondary" />
        <label className="flex items-center gap-1">
            <span className="text-xs text-text-secondary">с</span>
            <input
                type="date"
                value={from}
                max={to || undefined}
                onChange={(e) => onFromChange(e.target.value)}
                aria-label={fromLabel}
                className={inputClass}
            />
        </label>
        <span aria-hidden="true" className="text-xs text-text-secondary">—</span>
        <label className="flex items-center gap-1">
            <span className="text-xs text-text-secondary">по</span>
            <input
                type="date"
                value={to}
                min={from || undefined}
                onChange={(e) => onToChange(e.target.value)}
                aria-label={toLabel}
                className={inputClass}
            />
        </label>
    </div>
);
