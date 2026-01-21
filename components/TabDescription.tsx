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
const WIKI_QUICK_LINK_KEY = 'kmobn:wikiQuickLink';

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
    quickLinks,
    notice,
}) => {
    const [expanded, setExpanded] = useState(true);
    const [feedback, setFeedback] = useState<'yes' | 'no' | null>(null);
    const [contentHeight, setContentHeight] = useState(0);
    const contentRef = useRef<HTMLDivElement | null>(null);

    const storageKeyExpanded = useMemo(() => `${STORAGE_PREFIX}${storageKey}`, [storageKey]);
    const storageKeyFeedback = useMemo(() => `${STORAGE_PREFIX}${storageKey}:feedback`, [storageKey]);
    const contentId = useMemo(() => `tab-description-${storageKey}`, [storageKey]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            const saved = localStorage.getItem(storageKeyExpanded);
            if (saved === 'collapsed') {
                setExpanded(false);
            }
            const savedFeedback = localStorage.getItem(storageKeyFeedback);
            if (savedFeedback === 'yes' || savedFeedback === 'no') {
                setFeedback(savedFeedback);
            }
        } catch {
            return;
        }
    }, [storageKeyExpanded, storageKeyFeedback]);

    useEffect(() => {
        if (!contentRef.current) return;
        setContentHeight(contentRef.current.scrollHeight);
    }, [expanded, summary, actions.length, steps.length, examples?.length, quickLinks?.length, notice?.text]);

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

    const handleFeedback = (value: 'yes' | 'no') => {
        setFeedback(value);
        if (typeof window === 'undefined') return;
        try {
            localStorage.setItem(storageKeyFeedback, value);
        } catch {
            return;
        }
    };

    const openWikiLink = (link: QuickLink) => {
        if (typeof window === 'undefined') return;
        const detail = {
            categoryId: link.wikiCategoryId,
            articleId: link.wikiArticleId,
            query: link.wikiQuery,
        };
        try {
            localStorage.setItem(WIKI_QUICK_LINK_KEY, JSON.stringify({ ...detail, at: new Date().toISOString() }));
        } catch {
            // ignore
        }
        window.dispatchEvent(new CustomEvent('kmobn:open-wiki', { detail }));
    };

    const openMail = (kind: 'issue' | 'idea') => {
        if (typeof window === 'undefined') return;
        const subject = kind === 'issue'
            ? `Проблема во вкладке: ${storageKey}`
            : `Предложение по вкладке: ${storageKey}`;
        const body = kind === 'issue'
            ? 'Опишите, что произошло и как воспроизвести проблему.'
            : 'Опишите, что можно улучшить и почему это важно.';
        const url = `mailto:support@kmobn.ru?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        window.open(url, '_blank', 'noopener,noreferrer');
    };

    const noticeTone = notice?.tone ?? 'info';
    const noticeClasses = noticeTone === 'warning'
        ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
        : 'border-primary/40 bg-primary/10 text-text-secondary';

    return (
        <section className="rounded-xl border border-border bg-surface p-4 sm:p-6 shadow" aria-labelledby={`${contentId}-title`}>
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

                {quickLinks && quickLinks.length > 0 && (
                    <div className="mt-4">
                        <div className="flex items-center">
                            <h4 className="text-sm font-semibold text-text-primary">Быстрые ссылки на Wiki</h4>
                            <HelpHint text="Откройте полезные статьи без поиска." />
                        </div>
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                            {quickLinks.map(link => (
                                <button
                                    key={link.id}
                                    type="button"
                                    onClick={() => openWikiLink(link)}
                                    className="flex flex-col items-start rounded-lg border border-border bg-background px-3 py-2 text-left text-sm text-text-primary hover:bg-background/70"
                                >
                                    <span className="font-semibold">{link.label}</span>
                                    {link.description && (
                                        <span className="text-xs text-text-secondary mt-1">{link.description}</span>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {notice && (
                    <div className={`mt-4 rounded-lg border px-3 py-2 text-xs ${noticeClasses}`}>
                        {notice.text}
                    </div>
                )}

                <div className="mt-5 flex flex-col gap-3 rounded-lg border border-border bg-background/40 px-3 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-text-primary">
                            {feedback === null ? 'Было полезно?' : 'Спасибо за обратную связь'}
                        </div>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => handleFeedback('yes')}
                                className={`px-3 py-1 rounded-md border text-sm ${feedback === 'yes' ? 'border-primary text-primary' : 'border-border text-text-secondary hover:text-text-primary'}`}
                            >
                                Да
                            </button>
                            <button
                                type="button"
                                onClick={() => handleFeedback('no')}
                                className={`px-3 py-1 rounded-md border text-sm ${feedback === 'no' ? 'border-primary text-primary' : 'border-border text-text-secondary hover:text-text-primary'}`}
                            >
                                Нет
                            </button>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={() => openMail('issue')}
                            className="px-3 py-1 rounded-md border border-border text-sm text-text-secondary hover:text-text-primary"
                        >
                            Сообщить о проблеме
                        </button>
                        <button
                            type="button"
                            onClick={() => openMail('idea')}
                            className="px-3 py-1 rounded-md border border-border text-sm text-text-secondary hover:text-text-primary"
                        >
                            Предложить улучшение
                        </button>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default TabDescription;
