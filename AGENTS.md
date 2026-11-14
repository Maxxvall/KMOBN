# Project rules

- A small visual or copy change in the React UI needs code and diff inspection only. Do not automatically start Vite, Electron, Playwright, lint, test or build; the user may verify it manually.
- Treat estimates/calculations, local persistence, Supabase, import/export, PDF/DOCX/XLSX output and Electron main-process changes as behaviour changes with a focused check.
- Run `npm run test` for changed calculation or service behaviour; run Electron E2E only for a changed desktop integration flow. Use a build only when the change affects packaging, Vite config or release behaviour.
- Do not expose Supabase credentials or local persisted user data in logs or reports.

<!-- autopilot:start -->
# Каркас Мастер (karkas-master)

Генератор строительных смет: React 19 + TS strict веб-приложение с офлайн-режимом (PWA), Supabase и Electron-обёрткой; код лежит плоско в корне репозитория, папки `src/` нет.

## Команды

| Команда | Что делает |
|---------|------------|
| `npm install` | Установить зависимости |
| `npm run check` | Основная приёмка: typecheck + lint + vitest (408/408 тестов, 58 файлов) |
| `npm run typecheck` / `npm run lint` / `npm run test` | По отдельности; линт 0 ошибок / 0 предупреждений |
| `npx vitest run services/dataTransfer.test.ts` | Один тест-файл (подставить нужный путь) |
| `npm run test:e2e:electron` | Electron E2E (сборка build:electron:e2e + playwright -c playwright.electron.config.ts; спеки в `e2e/`) |

## Где что

- Точки входа: `index.tsx` → `App.tsx` (корень репозитория — верхнеуровневая навигация и состояние).
- Домен-слой — `services/` (~80 файлов: сметы, кровля, раскрой, supabase, AI, PDF/DOCX/XLSX); тесты колокализованы `*.test.ts` рядом (vitest).
- `electron/`: `main.ts` — лог рендерера в `userData/app.log` (fire-and-forget) и автоапдейт electron-updater (`autoDownload=false`); `types.ts` — контракт `ElectronAPI` (`window.electronAPI`); `preload.ts` — contextIsolation.
- `components/estimate-editor/` — подкомпоненты редактора смет + `sectionReorderGesture` (удержание ~400 мс переносит раздел).
- `supabase/migrations/` + `supabase/tests/*.sql` — SQL-регрессии RPC (bootstrap/fixtures рядом).
- `docs/*.md` — планы и гайды по подсистемам.

## Подводные камни

- Два стиля отступов: старые файлы 4 пробела, новые 2 — в правке следовать стилю конкретного файла, не переформатировать.
- Компоненты пишутся как `React.FC` — соблюдать локальный стиль.
- Tailwind-кастомы `max-w-8xl` (1500px) и экран `3xl` (1920px) объявлены в `tailwind.config.js` — в дефолтном Tailwind их нет.
- Офлайн-ядро outbox-first: `services/offlineSync.ts`, `offlineQueue.ts`, `indexedDbCache.ts` — не трогать без нужды; `runtimeCaching: []` в vite.config.ts пуст намеренно (SW не должен переигрывать устаревшие строки Supabase).
- `xlsx` pinned на CDN-тарбол в package.json — не заменять на npm-версию.
- Кровельная математика: `roofFactor` (карта по форме крыши) и `ROOF_AREA_PITCH_FACTOR = 1.15` (площадь кровли) в `services/houseCalculator.ts` — две разные величины, не смешивать.

## Окружение (только имена, значений не логируем)

- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — services/supabase.ts; тот же набор в `.env.electron-e2e`.
- `VITE_OPENROUTER_API_KEY`, `VITE_OPENROUTER_BASE_URL`, `VITE_OPENROUTER_MODEL`, `VITE_OPENROUTER_SITE_URL`, `VITE_OPENROUTER_SITE_NAME`, `VITE_AI_GATEWAY_URL` — services/aiConfig.ts.
- `KMOBN_E2E`, `KMOBN_E2E_USER_DATA_DIR` — electron/main.ts; `SUPABASE_URL` \| `VITE_SUPABASE_URL` — api/ai-chat.ts.

## Как здесь работает Autopilot

Сборка ведётся навыком `/autopilot`. Требования, спецификация и таски — в `.autopilot/`.
Прогресс — `.autopilot/dashboard.html`. Требование из `manifest.md` может снять
только пользователь. Прерванную сборку продолжает «продолжи автопилот».

### Правка без автопилота

Мелкий баг или доводка после сборки — обычная сессия, без прогона.

Сначала прочитай:
1. `.autopilot/PROGRESS.md` — что не доделано, известные баги, о чём договорились с пользователем.
2. Что правили после последней сборки: `git log --oneline "$(git log -1 --format=%h --grep='^Autopilot: сборка сдана')"..HEAD -- . ':(exclude).autopilot'`
3. Только если правка их касается: почему сделано так — `docs/adr/`; что именно просили — `manifest.md` в папке сборки (указана в начале `PROGRESS.md`).

После правки:
- коммит — по правилам «История git» ниже;
- строка в «Правки без автопилота» в `.autopilot/PROGRESS.md`: дата — что — почему;
- починенный пункт из «Не доделано» или «Известные баги» — удали;
- договорились о том, что следующая сборка не должна пересматривать, — строка в «Договорились», словами пользователя.

### История git

Целиком не читай — бери срез под вопрос:

| Вопрос | Команда |
|---|---|
| что правили после последней сборки | `git log --oneline "$(git log -1 --format=%h --grep='^Autopilot: сборка сдана')"..HEAD -- . ':(exclude).autopilot'` |
| всё, что делали ради требования | `git log --oneline --grep="R02"` |
| история файла | `git log --oneline -10 -- <файл>` |
| когда появился или исчез код | `git log --oneline -S "<фрагмент>"` |
| почему строка такая | `git blame -L <с>,<по> <файл>`, затем `git show <sha>` |
| что внутри коммита | `git show --stat <sha>` |

Коммит: заголовок — что (`fix: даты в одном формате`), тело — почему, трейлер
`--trailer "Requirements: R02"`, если правка касается требования из `manifest.md`.
Заголовок `Autopilot: сборка сдана` пишет только автопилот — по нему находят последнюю сборку.
<!-- autopilot:end -->

