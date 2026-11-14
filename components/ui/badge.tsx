import React from 'react';
import { IconClose } from '@devigner-ui/icons';

// Adapted from the devignerui "badge" recipe for this project's dark theme
// (tokens: border/surface/primary in tailwind.config.js). The original recipe
// relies on motion + Tailwind 4 color-mix utilities; here only the tone pill
// is kept, with palette colors already matched to the dark theme.
// R03.1: added icon / count / onRemove — official-recipe API; tone and size
// untouched, StatusBadge and its consumers keep working as before.

const TONES = {
    neutral: 'border-border bg-background/60 text-text-secondary',
    warning: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
    info: 'border-sky-500/30 bg-sky-500/10 text-sky-200',
    success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
    danger: 'border-red-500/30 bg-red-500/10 text-red-200',
} as const;

const SIZES = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2 py-1 text-xs',
    lg: 'px-2.5 py-1 text-sm',
} as const;

export type BadgeTone = keyof typeof TONES;
export type BadgeSize = keyof typeof SIZES;

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
    /** Цвет текста, заливки и обводки пилюли. По умолчанию "neutral". */
    tone?: BadgeTone;
    /** Высота и размер текста. По умолчанию "md". */
    size?: BadgeSize;
    /** Иконка перед текстом (из @devigner-ui/icons; размер задаёт потребитель, обычно size-3.5). */
    icon?: React.ReactNode;
    /** Счётчик в маленьком чипе после текста. */
    count?: number;
    /** Кнопка-крестик удаления чипа; доступное имя — removeLabel. */
    onRemove?: () => void;
    /** Доступное имя кнопки удаления (по умолчанию «Убрать»). */
    removeLabel?: string;
}

export const Badge: React.FC<BadgeProps> = ({
    tone = 'neutral',
    size = 'md',
    icon,
    count,
    onRemove,
    removeLabel = 'Убрать',
    className,
    children,
    ...props
}) => (
    <span
        data-badge
        className={`inline-flex shrink-0 items-center gap-1 rounded-full border font-medium leading-none whitespace-nowrap ${SIZES[size]} ${TONES[tone]} ${className ?? ''}`}
        {...props}
    >
        {icon && <span className="flex shrink-0 items-center">{icon}</span>}
        {children}
        {count !== undefined && (
            <span className="inline-flex min-w-4 items-center justify-center rounded-full bg-white/10 px-1 text-[10px] font-semibold tabular-nums">
                {count}
            </span>
        )}
        {onRemove && (
            <button
                type="button"
                onClick={onRemove}
                aria-label={removeLabel}
                className="-mr-0.5 flex h-4 w-4 items-center justify-center rounded-full text-current transition-colors hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-current"
            >
                <IconClose aria-hidden="true" className="size-3" />
            </button>
        )}
    </span>
);
