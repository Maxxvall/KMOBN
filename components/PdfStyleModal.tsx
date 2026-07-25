import React, { useState } from 'react';
import FocusLock from 'react-focus-lock';

type PdfStyle = 'simple' | 'colored' | 'word-contract';

interface PdfStyleModalProps {
    onClose: () => void;
    onSelectStyle: (style: PdfStyle) => void | Promise<void>;
}

const PdfStyleModal: React.FC<PdfStyleModalProps> = ({ onClose, onSelectStyle }) => {
    const [pendingStyle, setPendingStyle] = useState<PdfStyle | null>(null);
    const isGenerating = pendingStyle !== null;

    const handleKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === 'Escape' && !isGenerating) onClose();
    };

    const handleSelect = async (style: PdfStyle) => {
        if (isGenerating) return;
        setPendingStyle(style);
        try {
            await onSelectStyle(style);
        } finally {
            setPendingStyle(null);
        }
    };

    const optionClass = 'w-full rounded-xl border p-4 text-left transition focus:outline-none focus:ring-2 focus:ring-primary/60 disabled:cursor-wait disabled:opacity-60';

    return (
        <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-4 sm:items-center"
            onClick={() => !isGenerating && onClose()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="pdf-style-title"
            aria-busy={isGenerating}
            onKeyDown={handleKeyDown}
        >
            <FocusLock returnFocus>
                <div
                    className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-surface p-5 shadow-2xl sm:p-6"
                    onClick={(event) => event.stopPropagation()}
                >
                    <div className="mb-6">
                        <div className="mb-2 h-1 w-14 rounded-full bg-primary" />
                        <h2 id="pdf-style-title" className="text-xl font-bold text-text-primary sm:text-2xl">
                            PDF для клиента
                        </h2>
                        <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                            Выберите оформление документа. Данные и итоговая стоимость будут одинаковыми во всех вариантах.
                        </p>
                    </div>

                    <div className="space-y-3">
                        <button
                            type="button"
                            onClick={() => void handleSelect('colored')}
                            disabled={isGenerating}
                            className={`${optionClass} border-primary/50 bg-[#171b21] text-white hover:border-primary hover:bg-[#1d2229]`}
                        >
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <div className="mb-1 text-lg font-bold">
                                        Премиальный PDF
                                    </div>
                                    <div className="text-sm leading-relaxed text-gray-300">
                                        Фирменный стиль каталога КаркасМастер, удобные таблицы и кликабельные контакты.
                                    </div>
                                </div>
                                <span className="shrink-0 rounded-full bg-primary px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white">
                                    Рекомендуем
                                </span>
                            </div>
                            {pendingStyle === 'colored' && (
                                <div className="mt-3 text-sm font-semibold text-primary">Создаём премиальный PDF…</div>
                            )}
                        </button>

                        <button
                            type="button"
                            onClick={() => void handleSelect('simple')}
                            disabled={isGenerating}
                            className={`${optionClass} border-border bg-background text-text-primary hover:border-gray-500 hover:bg-gray-700/40`}
                        >
                            <div className="font-bold">Простой PDF</div>
                            <div className="mt-1 text-sm leading-relaxed text-text-secondary">
                                Компактная классическая смета с минимальным оформлением.
                            </div>
                            {pendingStyle === 'simple' && (
                                <div className="mt-3 text-sm font-semibold text-primary">Создаём PDF…</div>
                            )}
                        </button>

                        <button
                            type="button"
                            onClick={() => void handleSelect('word-contract')}
                            disabled={isGenerating}
                            className={`${optionClass} border-border bg-background text-text-primary hover:border-blue-500/70 hover:bg-blue-500/10`}
                        >
                            <div className="font-bold">Приложение к договору</div>
                            <div className="mt-1 text-sm leading-relaxed text-text-secondary">
                                Официальная табличная форма для согласования и подписания.
                            </div>
                        </button>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isGenerating}
                        className="mt-6 min-h-[44px] w-full rounded-lg border border-border bg-background px-4 py-2 font-semibold text-text-primary transition hover:bg-gray-700/50 focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:cursor-wait disabled:opacity-50"
                    >
                        Отмена
                    </button>
                </div>
            </FocusLock>
        </div>
    );
};

export default React.memo(PdfStyleModal);
