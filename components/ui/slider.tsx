import React from 'react';

// Adapted from the devignerui "slider" recipe for this project's dark theme
// (R15.1): a styled native range input with a value bubble shown while
// dragging (and while focused, for keyboard users). The original recipe's
// Stardust particles are dropped. Styling uses Tailwind arbitrary variants —
// no keyframes were added to tailwind.config.js.

export interface SliderProps {
    min: number;
    max: number;
    step?: number;
    value: number;
    onChange: (value: number) => void;
    ariaLabel: string;
    /** Формат значения в всплывающей подсказке; по умолчанию — само число. */
    formatValue?: (value: number) => string;
    className?: string;
}

const TRACK_BASE = '#374151';
const TRACK_FILL = '#DC2626';

export const Slider: React.FC<SliderProps> = ({ min, max, step, value, onChange, ariaLabel, formatValue, className }) => {
    const [isActive, setIsActive] = React.useState(false);
    const displayValue = formatValue ? formatValue(value) : String(value);
    const percent = max > min ? Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100)) : 0;

    return (
        <div className={`relative flex min-h-[44px] items-center md:min-h-9 ${className ?? ''}`}>
            {isActive && (
                <span
                    aria-hidden="true"
                    style={{ left: `calc(${percent}% + ${(0.5 - percent / 100) * 20}px)` }}
                    className="pointer-events-none absolute -top-7 z-10 -translate-x-1/2 rounded-md border border-border bg-surface px-1.5 py-0.5 text-xs font-semibold tabular-nums text-text-primary shadow-lg whitespace-nowrap"
                >
                    {displayValue}
                </span>
            )}
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(event) => onChange(Number(event.target.value))}
                aria-label={ariaLabel}
                aria-valuetext={displayValue}
                onPointerDown={() => setIsActive(true)}
                onPointerUp={() => setIsActive(false)}
                onPointerCancel={() => setIsActive(false)}
                onFocus={() => setIsActive(true)}
                onBlur={() => setIsActive(false)}
                style={{ background: `linear-gradient(to right, ${TRACK_FILL} 0%, ${TRACK_FILL} ${percent}%, ${TRACK_BASE} ${percent}%, ${TRACK_BASE} 100%)` }}
                className="h-2 w-full cursor-pointer appearance-none rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:cursor-grab [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:shadow [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow"
            />
        </div>
    );
};
