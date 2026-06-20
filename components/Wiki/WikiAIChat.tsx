import React, { useMemo } from 'react';
import { WIKI_ARTICLES } from '../../services/wikiDatabase';

interface WikiAIChatProps {
    question: string;
    onQuestionChange: (value: string) => void;
    response: string;
    isLoading: boolean;
    onAsk: () => void;
    disabled?: boolean;
    onArticleClick?: (articleId: string) => void;
}

const parseResponseWithSource = (text: string): { mainText: string; sourceTitle: string | null } => {
    const sourceMatch = text.match(/Источник:\s*[""«]?(.+?)[""»]?\s*$/m);
    if (!sourceMatch) return { mainText: text, sourceTitle: null };
    const mainText = text.slice(0, sourceMatch.index).trim();
    const sourceTitle = sourceMatch[1].trim();
    return { mainText, sourceTitle };
};

const WikiAIChat: React.FC<WikiAIChatProps> = ({ question, onQuestionChange, response, isLoading, onAsk, disabled, onArticleClick }) => {
    const { mainText, sourceTitle } = useMemo(
        () => response ? parseResponseWithSource(response) : { mainText: '', sourceTitle: null },
        [response],
    );

    const sourceArticle = useMemo(() => {
        if (!sourceTitle) return null;
        return WIKI_ARTICLES.find(a => a.title.toLowerCase() === sourceTitle.toLowerCase()) ?? null;
    }, [sourceTitle]);

    return (
        <div className="bg-surface border border-border rounded-xl p-4">
            <div className="flex flex-col md:flex-row gap-3">
                <input
                    type="text"
                    value={question}
                    onChange={e => onQuestionChange(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !disabled && !isLoading) onAsk(); }}
                    placeholder="Задайте вопрос по строительству..."
                    className="flex-1 bg-background border border-border rounded-md px-4 py-2 text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-primary"
                    aria-label="Вопрос к Wiki AI"
                    disabled={disabled}
                />
                <button
                    onClick={onAsk}
                    disabled={disabled || isLoading}
                    className="px-5 py-2 rounded-md font-semibold bg-primary text-white disabled:opacity-60 disabled:cursor-not-allowed"
                >
                    {isLoading ? 'Думаю...' : 'Спросить'}
                </button>
            </div>
            {response && (
                <div className="mt-4 space-y-2">
                    <div className="text-sm text-text-primary bg-background border border-border rounded-md p-3 whitespace-pre-wrap">
                        {mainText || response}
                    </div>
                    {sourceArticle && onArticleClick && (
                        <button
                            onClick={() => onArticleClick(sourceArticle.id)}
                            className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors px-3 py-1.5 rounded-full bg-primary/10 hover:bg-primary/20"
                        >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.102 1.101" />
                            </svg>
                            Источник: {sourceArticle.title}
                        </button>
                    )}
                    {!sourceArticle && sourceTitle && (
                        <div className="text-xs text-text-secondary italic">
                            Источник: {sourceTitle}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default WikiAIChat;
