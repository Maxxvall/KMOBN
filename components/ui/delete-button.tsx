import React from 'react';

// Adapted from the devignerui "delete-button" recipe for this project's dark
// theme. The original relies on motion/react; here the trash -> check swap is
// done with plain SVG and a CSS spinner. The confirm step stays with the
// caller (the existing template-delete handler already asks window.confirm),
// so firing onConfirm on click keeps the previous behaviour unchanged.

const BIN = 'M18.834 8.5l-.46 6.9c-.177 2.654-.266 3.981-1.13 4.79-.866.81-2.196.81-4.857.81h-.773c-2.661 0-3.992 0-4.857-.81-.865-.809-.953-2.136-1.13-4.79l-.46-6.9';
const TICKS = 'M9.5 11l.5 5M14.5 11l-.5 5';
const LID = 'M3.5 6h17';
const HANDLE = 'M6.5 6h.11a2 2 0 0 0 1.83-1.32l.034-.103.097-.291c.083-.249.125-.373.18-.479a1.5 1.5 0 0 1 1.094-.788C9.962 3 10.093 3 10.355 3h3.29c.262 0 .393 0 .51.019a1.5 1.5 0 0 1 1.094.788c.055.106.097.23.18.479l.097.291A2 2 0 0 0 17.5 6';
const CHECK = 'M5.5 12.6 9.7 17 18.5 7';

const RESET_AFTER_MS = 1400;

export interface DeleteButtonProps
    extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'onAnimationStart' | 'onDragStart' | 'onDragEnd' | 'onDrag'> {
    /** Вызывается по клику; может вернуть промис — тогда кнопка покажет спиннер, а после — галочку. */
    onConfirm?: () => void | Promise<unknown>;
    /** Доступное имя кнопки (title + aria-label). */
    label?: string;
}

export const DeleteButton: React.FC<DeleteButtonProps> = ({ onConfirm, label = 'Delete', className, title, disabled, ...props }) => {
    const [phase, setPhase] = React.useState<'idle' | 'pending' | 'done'>('idle');
    const resetTimer = React.useRef<number | null>(null);

    React.useEffect(() => () => {
        if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    }, []);

    const handleClick = () => {
        if (disabled || phase === 'pending') return;
        const result = onConfirm?.();
        if (!result || typeof result.then !== 'function') return;
        setPhase('pending');
        result.then(
            () => {
                setPhase('done');
                resetTimer.current = window.setTimeout(() => setPhase('idle'), RESET_AFTER_MS);
            },
            () => setPhase('idle'),
        );
    };

    return (
        <button
            type="button"
            onClick={handleClick}
            disabled={disabled}
            aria-label={label}
            title={title ?? label}
            aria-busy={phase === 'pending'}
            className={`flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-transparent text-red-500 transition-colors hover:border-red-500/20 hover:bg-red-500/10 hover:text-red-400 focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50 md:min-h-9 md:min-w-9 ${phase === 'done' ? 'text-emerald-400' : ''} ${className ?? ''}`}
            {...props}
        >
            {phase === 'pending' ? (
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="animate-spin">
                    <path d="M21 12a9 9 0 1 1-6.2-8.56" />
                </svg>
            ) : phase === 'done' ? (
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d={CHECK} />
                </svg>
            ) : (
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d={BIN} />
                    <path d={TICKS} />
                    <path d={LID} />
                    <path d={HANDLE} />
                </svg>
            )}
        </button>
    );
};
