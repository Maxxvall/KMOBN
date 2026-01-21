import { AI_CONFIG, hasOpenRouterKey } from './aiConfig';
import { WIKI_ARTICLES } from './wikiDatabase';

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

    const response = await fetch(AI_CONFIG.baseUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            model: AI_CONFIG.model,
            messages: [{ role: 'user', content: prompt }],
        }),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(text || 'Ошибка запроса к AI');
    }

    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content?.trim() || 'Нет ответа от AI.';
};
