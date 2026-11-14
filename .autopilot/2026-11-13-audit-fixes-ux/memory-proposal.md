# memory-proposal — готовые строки для AGENTS.md пользователя

Существующий текст AGENTS.md (4 пункта «Project rules») не стал неверным: PDF/DOCX/XLSX-сервисы на месте (pdfGenerator, houseProposalDocx, documentExport), скрипты `npm run test` / E2E / build существуют, правило о креденшеллах актуально. Ниже — только добавляемое.

## Заголовок-что-это (вставить сразу после «# Project rules» или перед ним)

- Это «Каркас Мастер» (karkas-master) — генератор строительных смет: React 19 + TS strict веб-приложение с офлайн-режимом (PWA), Supabase и Electron-обёрткой; код лежит плоско в корне репозитория, папки `src/` нет.

## Команды

- `npm install` — установка; `npm run check` (= typecheck + lint + vitest) — основная приёмка: 408/408 тестов, 58 файлов.
- `npm run typecheck`, `npm run lint` (0 ошибок; 6 прежних warnings `react-hooks/exhaustive-deps` в EstimateEditor — не гоняться за ними), `npm run test` (408/408).
- Один тест-файл: `npx vitest run services/dataTransfer.test.ts` (проверено: 20/20).
- `npm run test:e2e:electron` — Electron E2E (сборка `build:electron:e2e` + playwright `-c playwright.electron.config.ts`); спеки в `e2e/` (offline-electron.spec.ts, mockSupabaseServer.ts).

## Где что

- Точки входа: `index.tsx` → `App.tsx` (~107 КБ, корень репозитория — вся верхнеуровневая навигация и состояние).
- Домен-слой — `services/` (~80 файлов: сметы, кровля, раскрой, supabase, AI, PDF/DOCX/XLSX); тесты колокализованы `*.test.ts` рядом (vitest).
- `electron/`: `main.ts` — лог рендерера в `userData/app.log` (fire-and-forget) и автоапдейт electron-updater (`autoDownload=false`); `types.ts` — контракт `ElectronAPI` (`window.electronAPI`); `preload.ts` — contextIsolation.
- `components/estimate-editor/` — подкомпоненты редактора смет + `sectionReorderGesture` (удержание ~400 мс переносит раздел).
- `supabase/migrations/` + `supabase/tests/*.sql` — SQL-регрессии RPC (bootstrap/fixtures рядом).
- `AGENTS.md` — источник правил проверок; `docs/*.md` — планы и гайды по подсистемам.

## Подводные камни

- Два стиля отступов: старые файлы 4 пробела, новые 2 — в правке следовать стилю конкретного файла, не переформатировать.
- Компоненты пишутся как `React.FC` — соблюдать локальный стиль, не переводить на function-декларации.
- Tailwind-кастомы `max-w-8xl` (1500px) и экран `3xl` (1920px) объявлены в `tailwind.config.js` — в дефолтном Tailwind их нет.
- Офлайн-ядро outbox-first: `services/offlineSync.ts`, `offlineQueue.ts`, `indexedDbCache.ts` — не трогать без нужды; `runtimeCaching: []` в vite.config.ts пуст намеренно (SW не должен переигрывать устаревшие строки Supabase).
- `xlsx` pinned на CDN-тарбол (`https://cdn.sheetjs.com/xlsx-0.20.3.tgz`) в package.json — не заменять на npm-версию.
- Кровельная математика: `roofFactor` (карта по форме крыши) и `ROOF_AREA_PITCH_FACTOR = 1.15` (площадь кровли) в `services/houseCalculator.ts` — две разные величины, не смешивать.

## Окружение (только имена, значений не логируем)

- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — services/supabase.ts; тот же набор в `.env.electron-e2e`.
- `VITE_OPENROUTER_API_KEY`, `VITE_OPENROUTER_BASE_URL`, `VITE_OPENROUTER_MODEL`, `VITE_OPENROUTER_SITE_URL`, `VITE_OPENROUTER_SITE_NAME`, `VITE_AI_GATEWAY_URL` — services/aiConfig.ts.
- `process.env` в electron/main.ts: `KMOBN_E2E`, `KMOBN_E2E_USER_DATA_DIR`; api/ai-chat.ts (серверный gateway) читает `SUPABASE_URL` | `VITE_SUPABASE_URL`.

## Правка без автопилота

- Мелкие правки вне сборки: сначала прочитать `.autopilot/PROGRESS.md`, затем изменения после последней сборки: `git log --oneline "$(git log -1 --format=%h --grep='^Autopilot: сборка сдана')"..HEAD -- . ':(exclude).autopilot'`.
- После правки — строка в разделе «Правки без автопилота» `.autopilot/PROGRESS.md`.

## История git

- Срезы под вопрос: что правили после сборки (диапазон от последнего коммита «Autopilot: сборка сдана»), история файла (`git log --oneline -- <путь>`), blame (`git blame -L <строки> <файл>`).
- Заголовок `Autopilot: сборка сдана` пишет только автопилот; коммиты несут trailer `Requirements:`.
