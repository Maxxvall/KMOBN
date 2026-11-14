import React from 'react';
import { motion } from 'motion/react';
import { IconCheck, IconTrash } from '@devigner-ui/icons';

// Adapted from the devignerui "delete-button" recipe for this project's dark
// theme. R04.1: the confirm step now lives INSIDE the button (idle → confirm →
// pending → done), replacing the previous fire-on-click behaviour whose
// confirm dialog stayed with the caller (window.confirm). Promise contract is
// kept: reject = cancel (back to idle), resolve = check mark for 1400 ms.
// Esc or clicking outside the button cancels the confirm step. Icons come
// from @devigner-ui/icons; only the spinner stays inline (project-wide look).

const RESET_AFTER_MS = 1400;

type DeletePhase = 'idle' | 'confirm' | 'pending' | 'done';

export interface DeleteButtonProps
    extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'onAnimationStart' | 'onDragStart' | 'onDragEnd' | 'onDrag'> {
    /** Вызывается после встроенного подтверждения; промис: reject = отмена (idle), resolve = галочка на 1400 мс. */
    onConfirm?: () => void | Promise<unknown>;
    /** Доступное имя кнопки в покое (title + aria-label). */
    label?: string;
    /** Текст шага подтверждения внутри кнопки. */
    confirmLabel?: string;
}

export const DeleteButton: React.FC<DeleteButtonProps> = ({
    onConfirm,
    label = 'Delete',
    confirmLabel = 'Подтвердить?',
    className,
    title,
    disabled,
    ...props
}) => {
    const [phase, setPhase] = React.useState<DeletePhase>('idle');
    const resetTimer = React.useRef<number | null>(null);

    React.useEffect(() => () => {
        if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    }, []);

    const scheduleReset = () => {
        resetTimer.current = window.setTimeout(() => setPhase('idle'), RESET_AFTER_MS);
    };

    const cancelConfirm = React.useCallback(() => setPhase((current) => (current === 'confirm' ? 'idle' : current)), []);

    const handleClick = () => {
        if (disabled || phase === 'pending') return;
        if (phase === 'idle') {
            setPhase('confirm');
            return;
        }
        if (phase === 'confirm') {
            const result = onConfirm?.();
            if (result && typeof result.then === 'function') {
                setPhase('pending');
                result.then(
                    () => {
                        setPhase('done');
                        scheduleReset();
                    },
                    () => setPhase('idle'),
                );
                return;
            }
            setPhase('done');
            scheduleReset();
        }
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
        if (event.key === 'Escape') cancelConfirm();
    };

    const currentLabel = phase === 'confirm' ? confirmLabel : label;

    return (
        <motion.button
            type="button"
            layout
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            onBlur={cancelConfirm}
            disabled={disabled}
            aria-label={currentLabel}
            title={title ?? currentLabel}
            aria-busy={phase === 'pending'}
            transition={{ type: 'spring', bounce: 0.15, duration: 0.3 }}
            className={`flex min-h-[44px] items-center justify-center gap-1.5 border text-red-500 transition-colors hover:border-red-500/20 hover:bg-red-500/10 hover:text-red-400 focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50 md:min-h-9 ${
                phase === 'confirm'
                    ? 'min-w-[44px] rounded-full border-red-500/30 bg-red-500/10 px-3 md:min-w-9'
                    : 'min-w-[44px] rounded-md border-transparent px-2 md:min-w-9'
            } ${phase === 'done' ? 'text-emerald-400' : ''} ${className ?? ''}`}
            {...props}
        >
            {phase === 'pending' ? (
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="animate-spin">
                    <path d="M21 12a9 9 0 1 1-6.2-8.56" />
                </svg>
            ) : phase === 'done' ? (
                <IconCheck aria-hidden="true" className="size-[18px]" />
            ) : (
                <>
                    <IconTrash aria-hidden="true" className="size-[18px] shrink-0" />
                    {phase === 'confirm' && (
                        <motion.span
                            initial={{ opacity: 0, x: -4 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="text-xs font-semibold whitespace-nowrap"
                        >
                            {confirmLabel}
                        </motion.span>
                    )}
                </>
            )}
        </motion.button>
    );
};
