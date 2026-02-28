import React from 'react';
import { WikiArticle as WikiArticleType, WikiCategory, WikiSubcategory } from '../../types';

interface WikiArticleProps {
    article: WikiArticleType;
    category: WikiCategory | null;
    subcategory: WikiSubcategory | null;
    onBack: () => void;
}

const WikiArticle: React.FC<WikiArticleProps> = ({ article, category, subcategory, onBack }) => {
    return (
        <article className="bg-surface border border-border rounded-2xl shadow-lg overflow-hidden">
            {/* Top gradient bar */}
            <div className="h-1 bg-gradient-to-r from-primary via-primary/60 to-transparent" />

            <div className="p-6 sm:p-8 space-y-6">
                {/* Back & breadcrumb */}
                <div className="flex items-center gap-3">
                    <button
                        onClick={onBack}
                        className="flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors font-medium"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                        </svg>
                        Назад
                    </button>
                    {category && (
                        <span className="text-xs text-text-secondary/60">
                            {category.icon} {category.name}
                            {subcategory && ` → ${subcategory.name}`}
                        </span>
                    )}
                </div>

                {/* Title */}
                <h2 className="text-2xl sm:text-3xl font-bold text-text-primary leading-tight">
                    {article.title}
                </h2>

                {/* Divider */}
                <div className="border-t border-border" />

                {/* Content */}
                <div className="space-y-4">
                    {article.content.split('\n').map((paragraph, i) => {
                        const trimmed = paragraph.trim();
                        if (!trimmed) return null;
                        return (
                            <p key={i} className="text-[15px] text-text-primary/90 leading-relaxed">
                                {trimmed}
                            </p>
                        );
                    })}
                </div>

                {/* Tags */}
                {article.tags.length > 0 && (
                    <div className="pt-2 border-t border-border">
                        <div className="flex flex-wrap gap-2">
                            {article.tags.map(tag => (
                                <span
                                    key={tag}
                                    className="text-xs px-3 py-1 rounded-full bg-primary/10 text-primary/80 font-medium"
                                >
                                    #{tag}
                                </span>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </article>
    );
};

export default WikiArticle;
