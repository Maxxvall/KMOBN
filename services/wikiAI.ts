import { AI_CONFIG, hasOpenRouterKey } from './aiConfig';
import { WIKI_ARTICLES } from './wikiDatabase';
import { WikiArticle } from '../types';

type OpenRouterErrorPayload = {
    error?: {
        message?: string;
        code?: number | string;
    };
    message?: string;
};

const toPlainText = (input: string): string => {
    return input
        .replace(/\r\n/g, '\n')
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/^\s*[-*•]\s+/gm, '')
        .replace(/^\s*>\s?/gm, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
};

const parseApiErrorMessage = (rawText: string): string => {
    if (!rawText) return '';
    const text = rawText.trim();
    try {
        const parsed = JSON.parse(text) as OpenRouterErrorPayload;
        return String(parsed?.error?.message || parsed?.message || text);
    } catch {
        return text;
    }
};

const toFriendlyError = (status: number, rawText: string): string => {
    const details = parseApiErrorMessage(rawText).toLowerCase();
    if (status === 429 || details.includes('rate limit') || details.includes('rate-limited')) {
        return 'Сервис AI временно перегружен. Подождите немного и повторите запрос.';
    }
    if (status === 401 || status === 403) {
        return 'Не удалось обратиться к AI: проверьте API-ключ OpenRouter.';
    }
    if (status >= 500) {
        return 'Сервис AI сейчас недоступен. Попробуйте позже.';
    }
    return 'Не удалось получить ответ от AI. Попробуйте ещё раз.';
};

// ─── RAG: поиск релевантных статей ──────────────────────────────────────────

const normalizeToken = (s: string): string =>
    s.toLowerCase().replace(/[^a-zа-я0-9ё\s]/g, '').trim();

const extractTokens = (text: string): string[] =>
    normalizeToken(text).split(/\s+/).filter(t => t.length >= 3);

const tokenizeArticle = (article: WikiArticle): string[] => {
    const titleTokens = extractTokens(article.title);
    const tagTokens = article.tags.flatMap(t => extractTokens(t));
    const contentPreview = article.content.split('\n').slice(0, 2).join(' ');
    const contentTokens = extractTokens(contentPreview);
    return [...titleTokens, ...tagTokens, ...contentTokens];
};

const findRelevantArticles = (question: string, maxResults = 5): WikiArticle[] => {
    const questionTokens = extractTokens(question);
    if (questionTokens.length === 0) return WIKI_ARTICLES.slice(0, maxResults);

    const questionSet = new Set(questionTokens);

    const scored = WIKI_ARTICLES.map(article => {
        const articleTokens = tokenizeArticle(article);
        const articleSet = new Set(articleTokens);
        let matches = 0;
        for (const qt of questionSet) {
            for (const at of articleSet) {
                if (at.includes(qt) || qt.includes(at)) {
                    matches++;
                    break;
                }
            }
        }
        const score = matches / questionSet.size;
        return { article, score };
    });

    return scored
        .filter(s => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, maxResults)
        .map(s => s.article);
};

// ─── Основная функция ───────────────────────────────────────────────────────

export const askWikiAI = async (question: string): Promise<string> => {
    const trimmed = question.trim();
    if (!trimmed) return 'Введите вопрос.';
    if (!hasOpenRouterKey()) return 'API-ключ не настроен. Добавьте VITE_OPENROUTER_API_KEY в .env.';

    const relevantArticles = findRelevantArticles(trimmed, 5);

    const contextBlocks = relevantArticles.map(article =>
        `Статья: "${article.title}" (раздел: ${article.tags.slice(0, 3).join(', ')})\n${article.content}`
    ).join('\n\n---\n\n');

    const articleTitles = relevantArticles.map(a => `"${a.title}"`).join(', ');

    const prompt = `Ты помощник строителя. Отвечай ТОЛЬКО на основе следующих статей из базы знаний.
Если информации нет в статьях — скажи "Информации по этому вопросу нет в базе знаний. Рекомендую обратиться к специалисту."
Пиши ответ простым русским языком, без Markdown-разметки.
Не используй символы *, **, #, обратные кавычки и маркеры списков.
Структурируй ответ: сначала суть, затем подробности.
В конце ответа ОБЯЗАТЕЛЬНО укажи из какой статьи взята информация в формате: "Источник: Название статьи".

Доступные статьи (${relevantArticles.length} шт.): ${articleTitles}

--- БАЗА ЗНАНИЙ ---

${contextBlocks}

--- КОНЕЦ БАЗЫ ЗНАНИЙ ---

Вопрос: ${trimmed}

Ответ:`;

    const headers: Record<string, string> = {
        'Authorization': `Bearer ${AI_CONFIG.apiKey}`,
        'Content-Type': 'application/json',
    };
    if (AI_CONFIG.siteUrl) headers['HTTP-Referer'] = AI_CONFIG.siteUrl;
    if (AI_CONFIG.siteName) headers['X-Title'] = AI_CONFIG.siteName;

    try {
        const response = await fetch(AI_CONFIG.baseUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                model: AI_CONFIG.model,
                messages: [{ role: 'user', content: prompt }],
            }),
        });

        if (!response.ok) {
            const text = await response.text().catch(() => '');
            return toFriendlyError(response.status, text);
        }

        const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
        const content = data.choices?.[0]?.message?.content?.trim() || 'Нет ответа от AI.';
        return toPlainText(content);
    } catch {
        return 'Не удалось подключиться к AI. Проверьте интернет и попробуйте ещё раз.';
    }
};
