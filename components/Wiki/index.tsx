import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { WikiArticle as WikiArticleType } from '../../types';
import { WIKI_ARTICLES, WIKI_CATEGORIES } from '../../services/wikiDatabase';
import { askWikiAI } from '../../services/wikiAI';
import { hasOpenRouterKey } from '../../services/aiConfig';
import WikiCategories from './WikiCategories';
import WikiArticle from './WikiArticle';
import WikiAIChat from './WikiAIChat';
import TabDescription from '../TabDescription';

type WikiQuickLinkDetail = {
    categoryId?: string;
    articleId?: string;
    query?: string;
};

const WIKI_QUICK_LINK_KEY = 'kmobn:wikiQuickLink';

const Wiki: React.FC = () => {
    const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
    const [selectedArticle, setSelectedArticle] = useState<WikiArticleType | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [aiQuestion, setAiQuestion] = useState('');
    const [aiResponse, setAiResponse] = useState('');
    const [isLoadingAI, setIsLoadingAI] = useState(false);

    const applyQuickLink = useCallback((detail: WikiQuickLinkDetail | null | undefined) => {
        if (!detail) return;
        if (detail.query) {
            setSearchQuery(detail.query);
        }
        if (detail.articleId) {
            const article = WIKI_ARTICLES.find(a => a.id === detail.articleId);
            if (article) {
                setSelectedCategoryId(article.categoryId);
                setSelectedArticle(article);
                return;
            }
        }
        if (detail.categoryId) {
            setSelectedCategoryId(detail.categoryId);
        }
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            const raw = localStorage.getItem(WIKI_QUICK_LINK_KEY);
            if (raw) {
                const parsed = JSON.parse(raw) as WikiQuickLinkDetail;
                applyQuickLink(parsed);
                localStorage.removeItem(WIKI_QUICK_LINK_KEY);
            }
        } catch {
            // ignore
        }

        const handler = (event: Event) => {
            const detail = (event as CustomEvent<WikiQuickLinkDetail>).detail;
            applyQuickLink(detail);
        };
        window.addEventListener('kmobn:open-wiki', handler as EventListener);
        return () => window.removeEventListener('kmobn:open-wiki', handler as EventListener);
    }, [applyQuickLink]);

    const categories = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return WIKI_CATEGORIES;
        return WIKI_CATEGORIES.filter(c =>
            `${c.name} ${c.description}`.toLowerCase().includes(q)
        );
    }, [searchQuery]);

    const articles = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        let list = WIKI_ARTICLES;
        if (selectedCategoryId) {
            list = list.filter(a => a.categoryId === selectedCategoryId);
        }
        if (!q) return list;
        return list.filter(a =>
            `${a.title} ${a.content} ${a.tags.join(' ')}`.toLowerCase().includes(q)
        );
    }, [searchQuery, selectedCategoryId]);

    const selectedCategory = useMemo(() => {
        return WIKI_CATEGORIES.find(c => c.id === selectedCategoryId) || null;
    }, [selectedCategoryId]);

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

    const handleCategoryClick = (categoryId: string) => {
        setSelectedCategoryId(prev => (prev === categoryId ? null : categoryId));
    };

    const resetFilters = () => {
        setSelectedCategoryId(null);
        setSearchQuery('');
    };

    const aiDisabled = !hasOpenRouterKey();

    return (
        <div className="space-y-6">
            <TabDescription
                storageKey="wiki"
                summary="База знаний и помощник. Найдите ответы на вопросы, изучите инструкции и используйте AI-помощника."
                actions={[
                    'Найти статьи по категориям',
                    'Использовать поиск по базе знаний',
                    'Задать вопрос AI-помощнику',
                    'Изучить инструкции по работе с системой',
                ]}
                steps={[
                    'Выберите категорию или используйте поиск.',
                    'Прочитайте статью с инструкцией.',
                    'Задайте вопрос AI-чату, если нужна помощь.',
                    'Применяйте знания на практике.',
                ]}
                examples={[
                    'Найдите чек-лист по фундаменту и используйте его перед стартом работ.',
                    'Спросите у AI про оптимальную толщину утеплителя для региона.',
                ]}
                quickLinks={[
                    {
                        id: 'wiki-quick-foundation',
                        label: 'Чек-лист подготовки фундамента',
                        description: 'Быстрый контроль перед монтажом стен.',
                        wikiArticleId: 'foundation-1',
                    },
                    {
                        id: 'wiki-quick-vapor',
                        label: 'Правильная укладка пароизоляции',
                        description: 'Сохраните герметичность контура.',
                        wikiArticleId: 'vapor-1',
                    },
                ]}
            />
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold text-text-primary">Wiki</h1>
                <p className="text-sm text-text-secondary">База знаний по строительным разделам и быстрые ответы от AI.</p>
            </div>

            <WikiAIChat
                question={aiQuestion}
                onQuestionChange={setAiQuestion}
                response={aiResponse}
                isLoading={isLoadingAI}
                onAsk={handleAskAI}
                disabled={aiDisabled}
            />
            {aiDisabled && (
                <div className="text-xs text-text-secondary">
                    Для работы AI укажите VITE_OPENROUTER_API_KEY в окружении.
                </div>
            )}

            <div className="flex flex-col md:flex-row md:items-center gap-3">
                <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Поиск по разделам и статьям..."
                    className="flex-1 bg-surface border border-border rounded-md px-4 py-2 text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-primary"
                    aria-label="Поиск по Wiki"
                />
                {(selectedCategoryId || searchQuery) && (
                    <button
                        onClick={resetFilters}
                        className="px-4 py-2 rounded-md border border-border text-text-secondary hover:text-text-primary"
                    >
                        Сбросить фильтр
                    </button>
                )}
            </div>

            <WikiCategories
                categories={categories}
                activeCategoryId={selectedCategoryId}
                onSelect={handleCategoryClick}
            />

            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold text-text-primary">
                        {selectedCategory ? `Статьи: ${selectedCategory.name}` : 'Статьи'}
                    </h2>
                    <span className="text-xs text-text-secondary">{articles.length} шт.</span>
                </div>
                {articles.length === 0 ? (
                    <div className="bg-surface border border-border rounded-xl p-6 text-text-secondary">
                        Ничего не найдено. Попробуйте изменить запрос.
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {articles.map(article => (
                            <button
                                key={article.id}
                                onClick={() => setSelectedArticle(article)}
                                className="bg-surface border border-border rounded-xl p-5 text-left hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
                            >
                                <div className="text-sm text-text-secondary">
                                    {WIKI_CATEGORIES.find(c => c.id === article.categoryId)?.name ?? 'Wiki'}
                                </div>
                                <div className="text-lg font-semibold text-text-primary mt-1">{article.title}</div>
                                <div className="text-sm text-text-secondary mt-2">
                                    {article.content}
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {selectedArticle && (
                <WikiArticle
                    article={selectedArticle}
                    category={WIKI_CATEGORIES.find(c => c.id === selectedArticle.categoryId) || null}
                    onClose={() => setSelectedArticle(null)}
                />
            )}
        </div>
    );
};

export default Wiki;
