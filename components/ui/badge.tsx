import React from 'react';

// Adapted from the devignerui "badge" recipe for this project's dark theme
// (tokens: border/surface/primary in tailwind.config.js). The original recipe
// relies on motion + Tailwind 4 color-mix utilities; here only the tone pill
// is kept, with palette colors already matched to the dark theme.

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
}

export const Badge: React.FC<BadgeProps> = ({ tone = 'neutral', size = 'md', className, children, ...props }) => (
    <span
        data-badge
        className={`inline-flex shrink-0 items-center gap-1 rounded-full border font-medium leading-none whitespace-nowrap ${SIZES[size]} ${TONES[tone]} ${className ?? ''}`}
        {...props}
    >
        {children}
    </span>
);
