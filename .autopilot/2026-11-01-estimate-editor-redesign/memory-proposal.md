# memory-proposal — готовые блоки для AGENTS.md пользователя

Предложение: в `AGENTS.md` в корне ничего не менялось, вставка блоков — только по согласованию с пользователем. Все команды и пути ниже проверены на текущем репозитории.

---

## Блок «Проект» (одна строка, в шапку)

- «Каркас Мастер» (`karkas-master`): сметы для каркасного строительства. React 19 + TS 5.8 + Vite 6 + Tailwind 3.4 (тёмная тема, токены в `tailwind.config.js`), Electron 43 поверх того же бандла, бэкенд Supabase; Node >= 20.

## Блок «Команды»

| Действие | Команда |
|---|---|
| Установка | `npm install` |
| Dev web (Vite) | `npm run dev` |
| Dev Electron (vite + tsc watch + electron) | `npm run dev:electron` |
| Проверка типов (web + electron tsconfig) | `npm run typecheck` |

- `npm run lint`, `npm run test`, `npm run build`, dev-серверы и Playwright НЕ запускать автоматически — правило пользователя: визуальные изменения проверяются кодом и диффом; `npm run test` — только при изменении расчётов/сервисов; Electron E2E — только при изменении desktop-интеграции; build — только при затрагивании упаковки, Vite-конфига или релиза.

## Блок «Где что»

- `App.tsx` — корень приложения: маршрутизация по enum `View` из `types.ts` (HISTORY/EDITOR/PRICES/...), провайдеры всех контекстов, ленивые импорты экранов; DOM-вход — `index.tsx`.
- `components/estimate-editor/` — новая папка: презентационные компоненты верхней области редактора (`EstimateEditorHeader`, `EstimateMetaFields`, `EstimateExplanation`, `EstimateTemplateRow`, `EstimateToolbar`, `StatusBadge`), общие классы панели — `shared.ts`; всё состояние остаётся в `components/EstimateEditor.tsx`.
- `components/ui/` — `badge.tsx`, `delete-button.tsx`, `date-range-picker.tsx` — без внешних зависимостей (только React + `@devigner-ui/icons`).
- `components/EstimateEditor.tsx` — монолит редактора (~2300 строк): всё состояние и обработчики, секции, AI-модалки, панель «Факт».
- `contexts/EstimateContext.tsx` — view/estimates/templates и экшены (CRUD, PDF, архив) из любого компонента; рядом `CatalogContext`, `SyncContext`, `SubscriptionContext`, `EstimateSectionsContext`.
- `hooks/useEstimateCrud.ts` — CRUD смет и шаблонов поверх `services/database.ts`; автосохранение — `hooks/useDebouncedSave.ts` (задержка 8 с задаётся в `App.tsx`).
- `services/` — вся логика: Supabase — `database.ts` + `supabase.ts`, PDF/DOCX — `documentExport.ts`, офлайн-очередь — `offlineQueue.ts`/`offlineSync.ts`; тесты `*.test.ts` лежат рядом с кодом.
- `types.ts` — весь домен (`Estimate`, `EstimateStatus`, `View`); Electron-процесс — `electron/main.ts` + `preload.ts` (свой `tsconfig.electron.json`).

## Блок «Подводные камни»

- Компоненты в `components/ui/` и `components/estimate-editor/` — рецепты devignerui, адаптированные вручную; `motion/react` в проекте НЕ установлен — не добавлять по незнанию, новых runtime-зависимостей не вводить.
- `enum EstimateStatus` в `types.ts` — русские значения строк (`'Черновик'` / `'Отправлена'` / `'Согласована'`): данные Supabase и потребители (фильтры, бейджи, история) завязаны на эти строки — значения не менять, сравнивать через enum.
- `Estimate.date` — строка `yyyy-mm-dd` (ставится как `new Date().toISOString().split('T')[0]`), не Date-объект.
- AGENTS.md запрещает автозапуск dev/lint/test/build — единственная автоматическая проверка: `npm run typecheck`.
- Имена и сигнатуры обработчиков редактора не менять: они передаются пропсами из `EstimateEditor.tsx` в `components/estimate-editor/` (правило R11i из interfaces.md).
- Тема тёмная на Tailwind-токенах (`tailwind.config.js`) — цвета брать токенами, не хардкодить.

## Блок «Правка без автопилота» и «История git» (в AGENTS.md этих подразделов нет)

### Правка без автопилота

- Проверка правки — `npm run typecheck`; визуальное — код и дифф (см. правило «Команды»).
- Расчёты/сервисы менялись — вручную `npm run test` по правилу пользователя.

### История git

- Рабочий коммит: обычный заголовок + трейлер требований:
  ```
  git commit --trailer "Requirements: R##"
  ```
  (живой пример в репо: `77e6780 T01: редизайн верхней области смет…` с трейлерами `Autopilot-Run:` и `Requirements: R01, R02, …`).
- Заголовок «Autopilot: сборка сдана» ставит только автопилот — руками не использовать.
- Дифф работы с момента последней сдачи сборки:
  ```
  git log --oneline "$(git log -1 --format=%h --grep='^Autopilot: сборка сдана')"..HEAD -- . ':(exclude).autopilot'
  ```
- Если коммита-сдачи ещё нет, команда выводит пусто без ошибки.

## Одна строка (в шапку AGENTS.md)

- Первое, что читает сессия без автопилота: `.autopilot/PROGRESS.md`.

---

## Что устарело в AGENTS.md

- Ничего: все четыре правила AGENTS.md сверены с кодом и остались точными.
- Новые папки `components/estimate-editor/` и `components/ui/` AGENTS.md не противоречат — карты файлов там и не было; карта добавляется блоком «Где что» выше, а не правкой правил.
