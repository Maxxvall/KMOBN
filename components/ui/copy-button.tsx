import React from 'react';
import { IconCheck, IconClose, IconCopy } from '@devigner-ui/icons';

// Adapted from the devignerui "copy-button" recipe for this project's dark
// theme (R09.1). Clicking copies getValue() to the clipboard: green phase on
// success, error phase when the clipboard is unavailable or writing failed.
// The text to copy is produced by services/estimateClipboard.ts where a
// formatted value is needed.

const RESET_AFTER_MS = 1600;

type CopyPhase = 'idle' | 'pending' | 'copied' | 'error';

const PHASE_STATUS: Record<CopyPhase, string> = {
    idle: '',
    pending: 'Копирование…',
    copied: 'Скопировано',
    error: 'Буфер обмена недоступен',
};

export interface CopyButtonProps {
    /** Возвращает текст для буфера; может быть асинхронной. */
    getValue: () => string | Promise<string>;
    /** Доступное имя кнопки в покое (title + aria-label). */
    label?: string;
    className?: string;
}

export const CopyButton: React.FC<CopyButtonProps> = ({ getValue, label = 'Копировать', className }) => {
    const [phase, setPhase] = React.useState<CopyPhase>('idle');
    const resetTimer = React.useRef<number | null>(null);

    React.useEffect(() => () => {
        if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    }, []);

    const handleClick = async () => {
        if (phase === 'pending') return;
        setPhase('pending');
        try {
            const text = await getValue();
            if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
                throw new Error('clipboard-unavailable');
            }
            await navigator.clipboard.writeText(text);
            setPhase('copied');
        } catch {
            setPhase('error');
        } finally {
            resetTimer.current = window.setTimeout(() => setPhase('idle'), RESET_AFTER_MS);
        }
    };

    const currentLabel = phase === 'copied' ? PHASE_STATUS.copied : phase === 'error' ? PHASE_STATUS.error : label;

    return (
        <>
            <button
                type="button"
                onClick={handleClick}
                disabled={phase === 'pending'}
                aria-label={currentLabel}
                title={currentLabel}
                className={`flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-transparent text-text-secondary transition-colors hover:border-border hover:bg-white/5 hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50 md:min-h-9 md:min-w-9 ${
                    phase === 'copied' ? 'text-emerald-400' : ''
                } ${phase === 'error' ? 'text-red-400' : ''} ${className ?? ''}`}
            >
                {phase === 'pending' ? (
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="animate-spin">
                        <path d="M21 12a9 9 0 1 1-6.2-8.56" />
                    </svg>
                ) : phase === 'copied' ? (
                    <IconCheck aria-hidden="true" className="size-4" />
                ) : phase === 'error' ? (
                    <IconClose aria-hidden="true" className="size-4" />
                ) : (
                    <IconCopy aria-hidden="true" className="size-4" />
                )}
            </button>
            <span className="sr-only" aria-live="polite">{PHASE_STATUS[phase]}</span>
        </>
    );
};
