import React from 'react';
import { motion } from 'motion/react';

// Adapted from the devignerui "goo switch" recipe for this project's dark
// theme (R12.1): liquid-feel thumb via motion spring; the goo filter of the
// original is dropped as too heavy for the token set. role="switch" with
// Space/Enter toggling comes free from the native button.

export interface SwitchProps {
    checked: boolean;
    onChange: (value: boolean) => void;
    /** Видимая подпись рядом с тумблером (весь ряд — одна кнопка). */
    label?: string;
    /** Доступное имя; используется, когда видимой подписи нет. */
    ariaLabel: string;
    className?: string;
}

export const Switch: React.FC<SwitchProps> = ({ checked, onChange, label, ariaLabel, className }) => (
    <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label ? undefined : ariaLabel}
        onClick={() => onChange(!checked)}
        className={`inline-flex min-h-[44px] items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 md:min-h-9 ${className ?? ''}`}
    >
        <span
            aria-hidden="true"
            className={`relative flex h-6 w-10 shrink-0 items-center rounded-full border transition-colors ${
                checked ? 'border-primary bg-primary' : 'border-border bg-background/60'
            }`}
        >
            <motion.span
                layout
                transition={{ type: 'spring', stiffness: 500, damping: 32 }}
                className={`absolute h-4 w-4 rounded-full shadow-sm ${checked ? 'right-1 bg-white' : 'left-1 bg-text-secondary'}`}
            />
        </span>
        {label && <span className="text-sm text-text-primary">{label}</span>}
    </button>
);
