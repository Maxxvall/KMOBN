import React from 'react';
import { WikiCategory } from '../../types';

interface WikiCategoriesProps {
    categories: WikiCategory[];
    articleCounts: Record<string, number>;
    onSelect: (categoryId: string) => void;
}

const WikiCategories: React.FC<WikiCategoriesProps> = ({ categories, articleCounts, onSelect }) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {categories.map(category => (
            <button
                key={category.id}
                onClick={() => onSelect(category.id)}
                className="group relative bg-surface border border-border rounded-2xl p-6 text-left transition-all hover:border-primary/60 hover:shadow-xl hover:shadow-primary/5 hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-primary overflow-hidden"
            >
                {/* Gradient accent */}
                <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary/80 to-primary/20 opacity-0 group-hover:opacity-100 transition-opacity" />

                <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
                        {category.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="text-lg font-bold text-text-primary group-hover:text-primary transition-colors">
                            {category.name}
                        </div>
                        <div className="text-sm text-text-secondary mt-1 line-clamp-2">
                            {category.description}
                        </div>
                        <div className="flex items-center gap-2 mt-3">
                            <span className="text-xs px-2.5 py-0.5 rounded-full bg-primary/10 text-primary/80 font-medium">
                                {articleCounts[category.id] ?? 0} ст.
                            </span>
                            <span className="text-xs text-text-secondary/50 group-hover:text-primary/60 transition-colors ml-auto">
                                Открыть →
                            </span>
                        </div>
                    </div>
                </div>
            </button>
        ))}
    </div>
);

export default WikiCategories;
