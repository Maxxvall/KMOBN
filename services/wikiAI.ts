import { AI_CONFIG, hasOpenRouterKey } from './aiConfig';
import { WIKI_ARTICLES } from './wikiDatabase';

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

export const askWikiAI = async (question: string): Promise<string> => {
    const trimmed = question.trim();
    if (!trimmed) {
        return 'Введите вопрос.';
    }
    if (!hasOpenRouterKey()) {
        return 'API-ключ не настроен. Добавьте VITE_OPENROUTER_API_KEY в .env.';
    }

    const context = WIKI_ARTICLES.map(article => `${article.title}: ${article.content}`).join('\n\n');

    const prompt = `Ты помощник строителя. Отвечай ТОЛЬКО на основе следующей базы знаний.
Если информации нет в базе - скажи "Информации по этому вопросу нет в базе".
Пиши ответ простым русским языком, без Markdown-разметки.
Не используй символы *, **, #, обратные кавычки и маркеры списков.

База знаний:
${context}

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
