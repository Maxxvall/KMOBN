import React, { useMemo, useState } from 'react';
import { WikiArticle as WikiArticleType } from '../../types';
import { WIKI_ARTICLES, WIKI_CATEGORIES, WIKI_SUBCATEGORIES } from '../../services/wikiDatabase';
import { askWikiAI } from '../../services/wikiAI';
import { hasOpenRouterKey } from '../../services/aiConfig';
import WikiCategories from './WikiCategories';
import WikiSubcategories from './WikiSubcategories';
import WikiArticle from './WikiArticle';
import WikiAIChat from './WikiAIChat';


type NavigationLevel = 'categories' | 'subcategories' | 'articles' | 'article';

const Wiki: React.FC = () => {
    const [level, setLevel] = useState<NavigationLevel>('categories');
    const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
    const [selectedSubcategoryId, setSelectedSubcategoryId] = useState<string | null>(null);
    const [selectedArticle, setSelectedArticle] = useState<WikiArticleType | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [aiQuestion, setAiQuestion] = useState('');
    const [aiResponse, setAiResponse] = useState('');
    const [isLoadingAI, setIsLoadingAI] = useState(false);

    // ─── Computed data ───────────────────────────────────────────────────────

    const selectedCategory = useMemo(
        () => WIKI_CATEGORIES.find(c => c.id === selectedCategoryId) ?? null,
        [selectedCategoryId],
    );

    const selectedSubcategory = useMemo(
        () => WIKI_SUBCATEGORIES.find(s => s.id === selectedSubcategoryId) ?? null,
        [selectedSubcategoryId],
    );

    const subcategoriesForCategory = useMemo(
        () => (selectedCategoryId ? WIKI_SUBCATEGORIES.filter(s => s.categoryId === selectedCategoryId) : []),
        [selectedCategoryId],
    );

    const articlesForSubcategory = useMemo(
        () => (selectedSubcategoryId ? WIKI_ARTICLES.filter(a => a.subcategoryId === selectedSubcategoryId) : []),
        [selectedSubcategoryId],
    );

    /** Article counts per subcategory for badges */
    const articleCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const a of WIKI_ARTICLES) {
            counts[a.subcategoryId] = (counts[a.subcategoryId] ?? 0) + 1;
        }
        return counts;
    }, []);

    /** Article counts per category */
    const categoryCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const a of WIKI_ARTICLES) {
            counts[a.categoryId] = (counts[a.categoryId] ?? 0) + 1;
        }
        return counts;
    }, []);

    // ─── Search ──────────────────────────────────────────────────────────────

    const searchResults = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return null;
        return WIKI_ARTICLES.filter(a =>
            `${a.title} ${a.content} ${a.tags.join(' ')}`.toLowerCase().includes(q),
        );
    }, [searchQuery]);

    const isSearching = searchResults !== null;

    // ─── Handlers ────────────────────────────────────────────────────────────

    const handleCategoryClick = (categoryId: string) => {
        setSelectedCategoryId(categoryId);
        setSelectedSubcategoryId(null);
        setSelectedArticle(null);
        setLevel('subcategories');
    };

    const handleSubcategoryClick = (subcategoryId: string) => {
        setSelectedSubcategoryId(subcategoryId);
        setSelectedArticle(null);
        setLevel('articles');
    };

    const handleArticleClick = (article: WikiArticleType) => {
        setSelectedArticle(article);
        setLevel('article');
    };

    const handleSearchArticleClick = (article: WikiArticleType) => {
        setSelectedCategoryId(article.categoryId);
        setSelectedSubcategoryId(article.subcategoryId);
        setSelectedArticle(article);
        setLevel('article');
        setSearchQuery('');
    };

    const goToCategories = () => {
        setSelectedCategoryId(null);
        setSelectedSubcategoryId(null);
        setSelectedArticle(null);
        setLevel('categories');
    };

    const goToSubcategories = () => {
        setSelectedSubcategoryId(null);
        setSelectedArticle(null);
        setLevel('subcategories');
    };

    const goToArticles = () => {
        setSelectedArticle(null);
        setLevel('articles');
    };

    const handleAskAI = async () => {
        const question = aiQuestion.trim();
        if (!question || isLoadingAI) return;
        setIsLoadingAI(true);
        try {
            const response = await askWikiAI(question);
            setAiResponse(response);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Ошибка запроса к AI.';
            setAiResponse(message);
        } finally {
            setIsLoadingAI(false);
        }
    };

    const handleAiArticleClick = (articleId: string) => {
        const article = WIKI_ARTICLES.find(a => a.id === articleId);
        if (!article) return;
        setSelectedCategoryId(article.categoryId);
        setSelectedSubcategoryId(article.subcategoryId);
        setSelectedArticle(article);
        setLevel('article');
    };

    const aiDisabled = !hasOpenRouterKey();

    // ─── Render ──────────────────────────────────────────────────────────────

    return (
        <div className="space-y-6">

            {/* Header */}
            <div className="flex items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-text-primary tracking-tight">
                        База знаний
                    </h1>
                    <p className="text-sm text-text-secondary mt-1">
                        {WIKI_CATEGORIES.length} разделов · {WIKI_ARTICLES.length} статей · строительство, нормы, практика
                    </p>
                </div>
                <div className="hidden sm:flex items-center gap-1.5 text-xs text-text-secondary bg-surface border border-border rounded-full px-3 py-1.5">
                    <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
                    Актуально
                </div>
            </div>

            {/* AI Chat */}
            <WikiAIChat
                question={aiQuestion}
                onQuestionChange={setAiQuestion}
                response={aiResponse}
                isLoading={isLoadingAI}
                onAsk={handleAskAI}
                disabled={aiDisabled}
                onArticleClick={handleAiArticleClick}
            />
            {aiDisabled && (
                <div className="text-xs text-text-secondary">
                    Для работы AI укажите VITE_OPENROUTER_API_KEY в окружении.
                </div>
            )}

            {/* Search */}
            <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <svg className="w-4 h-4 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
                    </svg>
                </div>
                <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Поиск по всем статьям..."
                    className="w-full bg-surface border border-border rounded-xl pl-11 pr-4 py-3 text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-shadow"
                    aria-label="Поиск по Wiki"
                />
                {searchQuery && (
                    <button
                        onClick={() => setSearchQuery('')}
                        className="absolute inset-y-0 right-0 pr-4 flex items-center text-text-secondary hover:text-text-primary"
                        aria-label="Очистить поиск"
                    >
                        ✕
                    </button>
                )}
            </div>

            {/* Search results */}
            {isSearching && (
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold text-text-primary">Результаты поиска</h2>
                        <span className="text-xs text-text-secondary">{searchResults.length} шт.</span>
                    </div>
                    {searchResults.length === 0 ? (
                        <div className="bg-surface border border-border rounded-xl p-8 text-center text-text-secondary">
                            Ничего не найдено. Попробуйте изменить запрос.
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {searchResults.map(article => {
                                const cat = WIKI_CATEGORIES.find(c => c.id === article.categoryId);
                                const sub = WIKI_SUBCATEGORIES.find(s => s.id === article.subcategoryId);
                                return (
                                    <button
                                        key={article.id}
                                        onClick={() => handleSearchArticleClick(article)}
                                        className="group bg-surface border border-border rounded-xl p-5 text-left transition-all hover:border-primary/60 hover:shadow-lg hover:shadow-primary/5 focus:outline-none focus:ring-2 focus:ring-primary"
                                    >
                                        <div className="text-xs text-text-secondary/70 mb-1">
                                            {cat?.icon} {cat?.name} → {sub?.name}
                                        </div>
                                        <div className="text-base font-semibold text-text-primary group-hover:text-primary transition-colors">
                                            {article.title}
                                        </div>
                                        <div className="flex flex-wrap gap-1 mt-2">
                                            {article.tags.slice(0, 3).map(tag => (
                                                <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary/80">
                                                    #{tag}
                                                </span>
                                            ))}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Main navigation (hidden during search) */}
            {!isSearching && (
                <>
                    {/* Breadcrumbs */}
                    {level !== 'categories' && (
                        <nav className="flex items-center gap-1 text-sm flex-wrap" aria-label="Навигация">
                            <button
                                onClick={goToCategories}
                                className="text-primary hover:text-primary/80 transition-colors font-medium"
                            >
                                Все разделы
                            </button>
                            {selectedCategory && (
                                <>
                                    <span className="text-text-secondary/50 mx-1">›</span>
                                    {level === 'subcategories' ? (
                                        <span className="text-text-primary font-medium">
                                            {selectedCategory.icon} {selectedCategory.name}
                                        </span>
                                    ) : (
                                        <button
                                            onClick={goToSubcategories}
                                            className="text-primary hover:text-primary/80 transition-colors font-medium"
                                        >
                                            {selectedCategory.icon} {selectedCategory.name}
                                        </button>
                                    )}
                                </>
                            )}
                            {selectedSubcategory && level !== 'subcategories' && (
                                <>
                                    <span className="text-text-secondary/50 mx-1">›</span>
                                    {level === 'articles' ? (
                                        <span className="text-text-primary font-medium">
                                            {selectedSubcategory.name}
                                        </span>
                                    ) : (
                                        <button
                                            onClick={goToArticles}
                                            className="text-primary hover:text-primary/80 transition-colors font-medium"
                                        >
                                            {selectedSubcategory.name}
                                        </button>
                                    )}
                                </>
                            )}
                            {selectedArticle && level === 'article' && (
                                <>
                                    <span className="text-text-secondary/50 mx-1">›</span>
                                    <span className="text-text-primary font-medium truncate max-w-[200px]">
                                        {selectedArticle.title}
                                    </span>
                                </>
                            )}
                        </nav>
                    )}

                    {/* Level: Categories */}
                    {level === 'categories' && (
                        <WikiCategories
                            categories={WIKI_CATEGORIES}
                            articleCounts={categoryCounts}
                            onSelect={handleCategoryClick}
                        />
                    )}

                    {/* Level: Subcategories */}
                    {level === 'subcategories' && selectedCategory && (
                        <div className="space-y-4">
                            <div className="flex items-center gap-3">
                                <span className="text-3xl">{selectedCategory.icon}</span>
                                <div>
                                    <h2 className="text-xl font-bold text-text-primary">{selectedCategory.name}</h2>
                                    <p className="text-sm text-text-secondary">{selectedCategory.description}</p>
                                </div>
                            </div>
                            <WikiSubcategories
                                subcategories={subcategoriesForCategory}
                                articleCounts={articleCounts}
                                onSelect={handleSubcategoryClick}
                            />
                        </div>
                    )}

                    {/* Level: Articles list */}
                    {level === 'articles' && selectedSubcategory && (
                        <div className="space-y-4">
                            <div className="flex items-center gap-3">
                                <span className="text-2xl">{selectedSubcategory.icon}</span>
                                <div>
                                    <h2 className="text-xl font-bold text-text-primary">{selectedSubcategory.name}</h2>
                                    <p className="text-sm text-text-secondary">{selectedSubcategory.description}</p>
                                </div>
                            </div>
                            {articlesForSubcategory.length === 0 ? (
                                <div className="bg-surface border border-border rounded-xl p-8 text-center text-text-secondary">
                                    В этом разделе пока нет статей.
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 gap-3">
                                    {articlesForSubcategory.map((article, idx) => (
                                        <button
                                            key={article.id}
                                            onClick={() => handleArticleClick(article)}
                                            className="group bg-surface border border-border rounded-xl p-5 text-left transition-all hover:border-primary/60 hover:shadow-lg hover:shadow-primary/5 focus:outline-none focus:ring-2 focus:ring-primary"
                                        >
                                            <div className="flex items-start gap-4">
                                                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                                                    {idx + 1}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="text-base font-semibold text-text-primary group-hover:text-primary transition-colors">
                                                        {article.title}
                                                    </div>
                                                    <div className="text-sm text-text-secondary mt-1 line-clamp-2">
                                                        {article.content.split('\n')[0]}
                                                    </div>
                                                    <div className="flex flex-wrap gap-1.5 mt-2">
                                                        {article.tags.map(tag => (
                                                            <span
                                                                key={tag}
                                                                className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary/80"
                                                            >
                                                                #{tag}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div className="flex-shrink-0 text-text-secondary/40 group-hover:text-primary transition-colors">
                                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                                    </svg>
                                                </div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Level: Article view */}
                    {level === 'article' && selectedArticle && (
                        <WikiArticle
                            article={selectedArticle}
                            category={selectedCategory}
                            subcategory={selectedSubcategory}
                            onBack={goToArticles}
                        />
                    )}
                </>
            )}
        </div>
    );
};

export default Wiki;
