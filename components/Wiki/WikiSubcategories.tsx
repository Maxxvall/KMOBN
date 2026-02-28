import React from 'react';
import { WikiSubcategory } from '../../types';

interface WikiSubcategoriesProps {
    subcategories: WikiSubcategory[];
    articleCounts: Record<string, number>;
    onSelect: (subcategoryId: string) => void;
}

const WikiSubcategories: React.FC<WikiSubcategoriesProps> = ({ subcategories, articleCounts, onSelect }) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {subcategories.map(sub => (
            <button
                key={sub.id}
                onClick={() => onSelect(sub.id)}
                className="group bg-surface border border-border rounded-xl p-5 text-left transition-all hover:border-primary/60 hover:shadow-lg hover:shadow-primary/5 focus:outline-none focus:ring-2 focus:ring-primary"
            >
                <div className="flex items-start gap-3">
                    <span className="text-2xl shrink-0 mt-0.5" aria-hidden>{sub.icon}</span>
                    <div className="min-w-0">
                        <div className="text-base font-semibold text-text-primary group-hover:text-primary transition-colors">
                            {sub.name}
                        </div>
                        <div className="text-xs text-text-secondary mt-1 line-clamp-2">{sub.description}</div>
                        <div className="text-xs text-text-secondary/70 mt-2">
                            {articleCounts[sub.id] ?? 0} {formatArticleCount(articleCounts[sub.id] ?? 0)}
                        </div>
                    </div>
                </div>
            </button>
        ))}
    </div>
);

function formatArticleCount(n: number): string {
    const last = n % 10;
    const lastTwo = n % 100;
    if (lastTwo >= 11 && lastTwo <= 19) return 'статей';
    if (last === 1) return 'статья';
    if (last >= 2 && last <= 4) return 'статьи';
    return 'статей';
}

export default WikiSubcategories;
