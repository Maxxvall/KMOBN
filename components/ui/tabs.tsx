import React from 'react';
import { motion } from 'motion/react';

// Adapted from the devignerui "tabs" recipe for this project's dark theme
// (sliding pill via motion layoutId; the original recipe's extra variants are
// dropped). Keyboard ←/→/Home/End added per spec — the three consumers
// (EstimateHistory, EstimateSectionsSettings, Cutting) previously had none.
// Touch targets: min-h 44px mobile / 36px desktop, as agreed.

export interface TabItem<T extends string> {
    id: T;
    label: string;
    count?: number;
}

export interface TabsProps<T extends string> {
    tabs: readonly TabItem<T>[];
    active: T;
    onChange: (id: T) => void;
    /** Блокирует весь переключатель (SectionsSettings при orderDraft). */
    disabled?: boolean;
    ariaLabel: string;
    className?: string;
}

// Generic-компонент: React.FC не параметризуется дженериком, поэтому объявление функцией.
export function Tabs<T extends string>({ tabs, active, onChange, disabled = false, ariaLabel, className }: TabsProps<T>) {
    const buttonsRef = React.useRef<Array<HTMLButtonElement | null>>([]);
    const layoutId = React.useId();

    const selectAt = (index: number) => {
        const tab = tabs[index];
        if (!tab || disabled) return;
        onChange(tab.id);
        buttonsRef.current[index]?.focus();
    };

    const handleKeyDown = (event: React.KeyboardEvent) => {
        if (disabled) return;
        const index = tabs.findIndex((tab) => tab.id === active);
        switch (event.key) {
            case 'ArrowRight':
                event.preventDefault();
                selectAt((index + 1) % tabs.length);
                break;
            case 'ArrowLeft':
                event.preventDefault();
                selectAt((index - 1 + tabs.length) % tabs.length);
                break;
            case 'Home':
                event.preventDefault();
                selectAt(0);
                break;
            case 'End':
                event.preventDefault();
                selectAt(tabs.length - 1);
                break;
            default:
                break;
        }
    };

    return (
        <div
            role="tablist"
            aria-label={ariaLabel}
            className={`inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-background/60 p-1 ${className ?? ''}`}
        >
            {tabs.map((tab, index) => {
                const isActive = tab.id === active;
                return (
                    <button
                        key={tab.id}
                        ref={(el) => { buttonsRef.current[index] = el; }}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        tabIndex={isActive ? 0 : -1}
                        disabled={disabled}
                        onClick={() => selectAt(index)}
                        onKeyDown={handleKeyDown}
                        className={`relative flex min-h-[44px] min-w-0 items-center justify-center rounded-full px-3.5 text-sm font-semibold whitespace-nowrap transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50 md:min-h-9 ${
                            isActive ? 'text-white' : 'text-text-secondary hover:text-text-primary'
                        }`}
                    >
                        {isActive && (
                            <motion.span
                                layoutId={`tabs-pill-${layoutId}`}
                                aria-hidden="true"
                                className="absolute inset-0 rounded-full bg-primary"
                                transition={{ type: 'spring', bounce: 0.18, duration: 0.4 }}
                            />
                        )}
                        <span className="relative z-10 flex min-w-0 items-center gap-1.5">
                            <span className="truncate">{tab.label}</span>
                            {tab.count !== undefined && (
                                <span className="inline-flex shrink-0 items-center justify-center rounded-full bg-white/15 px-1.5 text-xs font-semibold tabular-nums">
                                    {tab.count}
                                </span>
                            )}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
