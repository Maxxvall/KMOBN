import React, { useEffect } from 'react';
import { WikiArticle as WikiArticleType, WikiCategory } from '../../types';

interface WikiArticleProps {
    article: WikiArticleType;
    category: WikiCategory | null;
    onClose: () => void;
}

const WikiArticle: React.FC<WikiArticleProps> = ({ article, category, onClose }) => {
    useEffect(() => {
        const handler = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [onClose]);

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true">
            <div className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-2xl">
                <div className="flex items-start justify-between gap-4 p-6 border-b border-border">
                    <div>
                        <div className="text-sm text-text-secondary">{category ? category.name : 'Wiki'}</div>
                        <h2 className="text-xl font-semibold text-text-primary mt-1">{article.title}</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-text-secondary hover:text-text-primary text-2xl"
                        aria-label="Закрыть"
                    >
                        ×
                    </button>
                </div>
                <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                    {article.content.split('\n').map((p, i) => (
                        <p key={i} className="text-sm text-text-primary leading-relaxed">{p}</p>
                    ))}
                    {article.tags.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-2">
                            {article.tags.map(tag => (
                                <span
                                    key={tag}
                                    className="text-xs px-2 py-1 rounded-full bg-background border border-border text-text-secondary"
                                >
                                    #{tag}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default WikiArticle;
