import React, { useEffect, useMemo, useRef, useState } from 'react';

type QuickLink = {
    id: string;
    label: string;
    description?: string;
    wikiCategoryId?: string;
    wikiArticleId?: string;
    wikiQuery?: string;
};

type NoticeTone = 'info' | 'warning';

type TabDescriptionProps = {
    storageKey: string;
    summary: string;
    actions: string[];
    steps: string[];
    examples?: string[];
    quickLinks?: QuickLink[];
    notice?: {
        tone?: NoticeTone;
        text: string;
    };
};

const STORAGE_PREFIX = 'kmobn:tab-description:';

const HelpHint: React.FC<{ text: string }> = ({ text }) => {
    return (
        <span className="relative inline-flex items-center group">
            <button
                type="button"
                className="ml-2 inline-flex h-5 w-5 items-center justify-center rounded-full border border-border text-[10px] text-text-secondary hover:text-text-primary"
                aria-label="Подсказка"
            >
                ?
            </button>
            <span
                role="tooltip"
                className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 w-56 -translate-x-1/2 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-text-secondary opacity-0 shadow-lg transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100"
            >
                {text}
            </span>
        </span>
    );
};

const TabDescription: React.FC<TabDescriptionProps> = ({
    storageKey,
    summary,
    actions,
    steps,
    examples,
    notice,
}) => {
    const [expanded, setExpanded] = useState(false);
    const [contentHeight, setContentHeight] = useState(0);
    const contentRef = useRef<HTMLDivElement | null>(null);

    const storageKeyExpanded = useMemo(() => `${STORAGE_PREFIX}${storageKey}`, [storageKey]);
    const contentId = useMemo(() => `tab-description-${storageKey}`, [storageKey]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            const saved = localStorage.getItem(storageKeyExpanded);
            if (saved === 'expanded') {
                setExpanded(true);
            }
            if (saved === 'collapsed') {
                setExpanded(false);
            }
        } catch {
            return;
        }
    }, [storageKeyExpanded]);

    useEffect(() => {
        if (!contentRef.current) return;
        setContentHeight(contentRef.current.scrollHeight);
    }, [expanded, summary, actions.length, steps.length, examples?.length, notice?.text]);

    const persistExpanded = (next: boolean) => {
        if (typeof window === 'undefined') return;
        try {
            localStorage.setItem(storageKeyExpanded, next ? 'expanded' : 'collapsed');
        } catch {
            return;
        }
    };

    const handleToggle = () => {
        setExpanded(prev => {
            const next = !prev;
            persistExpanded(next);
            return next;
        });
    };

    const noticeTone = notice?.tone ?? 'info';
    const noticeClasses = noticeTone === 'warning'
        ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
        : 'border-primary/40 bg-primary/10 text-text-secondary';

    return (
        <section className="rounded-xl border border-border bg-surface p-4 sm:p-6 shadow mb-6" aria-labelledby={`${contentId}-title`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                    <span className="text-lg" aria-hidden>
                        ℹ️
                    </span>
                    <h3 id={`${contentId}-title`} className="text-lg sm:text-xl font-semibold text-text-primary">
                        Как работает эта вкладка?
                    </h3>
                </div>
                <button
                    type="button"
                    onClick={handleToggle}
                    className="inline-flex items-center justify-center rounded-md border border-border px-3 py-2 text-sm text-text-primary hover:bg-background/70"
                    aria-expanded={expanded}
                    aria-controls={contentId}
                >
                    {expanded ? 'Свернуть' : 'Развернуть'}
                </button>
            </div>

            <p className="mt-2 text-sm text-text-secondary">{summary}</p>

            <div
                id={contentId}
                ref={contentRef}
                style={{
                    maxHeight: expanded ? contentHeight : 0,
                    opacity: expanded ? 1 : 0,
                }}
                className="overflow-hidden transition-all duration-300 ease-in-out"
            >
                {actions.length > 0 && (
                    <div className="mt-4">
                        <div className="flex items-center">
                            <h4 className="text-sm font-semibold text-text-primary">Что можно сделать</h4>
                            <HelpHint text="Доступные действия в этой вкладке." />
                        </div>
                        <ul className="mt-2 space-y-2 text-sm text-text-primary">
                            {actions.map(action => (
                                <li key={action} className="flex items-start gap-2">
                                    <span aria-hidden>✅</span>
                                    <span>{action}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {steps.length > 0 && (
                    <div className="mt-4">
                        <div className="flex items-center">
                            <h4 className="text-sm font-semibold text-text-primary">Как это работает</h4>
                            <HelpHint text="Пошаговая логика работы и базовый сценарий." />
                        </div>
                        <ol className="mt-2 space-y-2 text-sm text-text-primary list-decimal list-inside">
                            {steps.map(step => (
                                <li key={step}>{step}</li>
                            ))}
                        </ol>
                    </div>
                )}

                {examples && examples.length > 0 && (
                    <div className="mt-4">
                        <div className="flex items-center">
                            <h4 className="text-sm font-semibold text-text-primary">Примеры использования</h4>
                            <HelpHint text="Идеи, как применять вкладку в работе." />
                        </div>
                        <ul className="mt-2 space-y-2 text-sm text-text-secondary">
                            {examples.map(example => (
                                <li key={example} className="flex items-start gap-2">
                                    <span aria-hidden>💡</span>
                                    <span>{example}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {notice && (
                    <div className={`mt-4 rounded-lg border px-3 py-2 text-xs ${noticeClasses}`}>
                        {notice.text}
                    </div>
                )}
            </div>
        </section>
    );
};

export default TabDescription;
