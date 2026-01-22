import React from 'react';

const SubscriptionGateModal = ({
    isOpen,
    title,
    description,
    onClose,
    onConfirm,
    confirmLabel = 'Перейти к планам',
}: {
    isOpen: boolean;
    title: string;
    description: string;
    onClose: () => void;
    onConfirm: () => void;
    confirmLabel?: string;
}) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60" onClick={onClose} />
            <div className="relative w-full max-w-lg mx-4 rounded-2xl border border-border bg-surface shadow-2xl">
                <div className="flex items-center justify-between border-b border-border px-6 py-4">
                    <div className="flex items-center gap-2">
                        <span className="text-xl">🔒</span>
                        <h3 className="text-lg font-semibold text-text-primary">{title}</h3>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-text-secondary hover:text-text-primary"
                        aria-label="Закрыть"
                    >
                        ×
                    </button>
                </div>
                <div className="px-6 py-4">
                    <p className="text-sm text-text-secondary leading-relaxed">{description}</p>
                    <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
                        <button
                            type="button"
                            onClick={onConfirm}
                            className="w-full sm:w-auto rounded-md bg-primary px-5 py-2 text-text-primary font-semibold hover:bg-primary-hover"
                        >
                            {confirmLabel}
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="w-full sm:w-auto rounded-md border border-border bg-background px-5 py-2 text-text-primary font-medium hover:bg-surface"
                        >
                            Закрыть
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SubscriptionGateModal;
