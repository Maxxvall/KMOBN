# Настройка AI gateway

Клиент умеет обращаться к серверному endpoint `api/ai-chat.ts`. Endpoint проверяет Supabase access token, ограничивает размер и частоту запросов, выбирает модель только из серверного списка и обращается к OpenRouter с серверным секретом.

## Переменные сервера

Обязательные:

- `OPENROUTER_API_KEY` — секрет OpenRouter; хранится только в окружении сервера.
- `OPENROUTER_MODEL` — модель по умолчанию.
- `SUPABASE_URL` — URL проекта Supabase.
- `SUPABASE_SERVICE_ROLE_KEY` — серверный ключ Supabase; никогда не добавлять в `VITE_*`.

Дополнительные:

- `OPENROUTER_ALLOWED_MODELS` — модели через запятую. Запрошенная клиентом модель вне списка заменяется моделью по умолчанию.
- `AI_GATEWAY_REQUESTS_PER_MINUTE` — лимит на пользователя, по умолчанию 30.
- `AI_GATEWAY_ALLOWED_ORIGINS` — дополнительные разрешённые web-origin через запятую.
- `AI_GATEWAY_ALLOW_NULL_ORIGIN=true` — требуется только для установленной Electron-версии, которая загружается с `file://`. Доступ всё равно требует действующий Supabase token.
- `OPENROUTER_SITE_URL` и `OPENROUTER_SITE_NAME` — метаданные приложения для OpenRouter.

## Переменные клиента

- Веб: `VITE_AI_GATEWAY_URL=/api/ai-chat`.
- Electron: `VITE_AI_GATEWAY_URL=https://<домен-приложения>/api/ai-chat` и серверный `AI_GATEWAY_ALLOW_NULL_ORIGIN=true`.
- `VITE_OPENROUTER_MODEL` должен совпадать с одной из серверных разрешённых моделей.

Для production удалить `VITE_OPENROUTER_API_KEY`: значение с префиксом `VITE_` попадает в клиентскую сборку. Прямой ключ оставлен только для локальной разработки без gateway.

После настройки проверить три сценария: авторизованный запрос возвращает ответ; запрос без Supabase token получает `401`; превышение лимита получает `429` с `Retry-After`.
