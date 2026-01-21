import React from 'react';
import { WikiCategory } from '../../types';

interface WikiCategoriesProps {
    categories: WikiCategory[];
    activeCategoryId: string | null;
    onSelect: (categoryId: string) => void;
}

const WikiCategories: React.FC<WikiCategoriesProps> = ({ categories, activeCategoryId, onSelect }) => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {categories.map(category => {
            const isActive = activeCategoryId === category.id;
            return (
                <button
                    key={category.id}
                    onClick={() => onSelect(category.id)}
                    className={
                        'bg-surface border border-border rounded-xl p-6 transition-all text-left focus:outline-none focus:ring-2 focus:ring-primary ' +
                        (isActive ? 'bg-gray-800/70 border-primary' : 'hover:bg-gray-700')
                    }
                    aria-pressed={isActive}
                >
                    <div className="flex items-center gap-4">
                        <span className="text-4xl" aria-hidden>{category.icon}</span>
                        <div>
                            <div className="text-lg font-semibold text-text-primary">{category.name}</div>
                            <div className="text-sm text-text-secondary">{category.description}</div>
                        </div>
                    </div>
                </button>
            );
        })}
    </div>
);

export default WikiCategories;
