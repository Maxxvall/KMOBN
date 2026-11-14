# Архитектура KMSmeta (Каркас Мастер)

Генератор строительных смет для частного домостроения: сметы по разделам и позициям, каталоги материалов и работ, шаблоны, метки, раскрой листов, калькулятор каркасного дома, аналитика. React 19 + TypeScript strict + Tailwind 3, офлайн-режим (PWA), Supabase как бэкенд, Electron-обёртка для десктопа. Код лежит плоско в корне репозитория, папки `src/` нет. Глоссарий домена — `CONTEXT.md`; ответы «почему так» — `docs/adr/`.

## Точки входа и навигация

- `index.tsx` → `App.tsx` — композиционный корень: верхнеуровневая навигация, состояние `UiState` (включая `showCommandPalette` и `aiGenerationRequest`), глобальный keydown (единственный хоткей приложения Ctrl/Cmd+K), построение команд палитры из существующих обработчиков (`handleNavigationAttempt`, `handleCreateNew`, поиск по сметам). Новых бизнес-действий палитра не содержит.
- `View` — числовой enum в `types.ts` с пропусками значений (5 и 8); не менять и не переупорядочивать. Экраны: History, Editor, Prices, Works, Bundles, HouseCalculator, Analytics, Cutting, Wiki, Sections.
- Экранные компоненты грузятся через `React.lazy`, включая `components/CommandPalette.tsx` (lazy-чанк). Лендинг — `components/LandingPage.tsx`, его внутренние компоненты наружу не экспортируются.

## Поток данных

1. **Supabase** — удалённое хранилище; клиент `services/supabase.ts` (ключи из `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`). Схема и RPC-регрессии — `supabase/migrations/` + `supabase/tests/`.
2. **Офлайн-ядро (outbox-first)** — `services/offlineSync.ts`, `offlineQueue.ts`, `indexedDbCache.ts`: мутация сначала в локальную очередь, синхронизация поверх, tombstones для удалений. Ядро не трогать без необходимости; `runtimeCaching: []` в `vite.config.ts` пуст намеренно — сервис-воркер не должен переигрывать устаревшие строки Supabase.
3. **Контексты** (`contexts/`) — провайдеры между App и экранами: `EstimateContext`, `EstimateSectionsContext`, `CatalogContext`, `SyncContext`, `SubscriptionContext`. CRUD смет — `hooks/useEstimateCrud.ts`, рядом `useDebouncedSave` и `useOfflineSync`.
4. **Домен-слой** — `services/` (~80 файлов): жизненный цикл и валидация смет, расчёты (`houseCalculator.ts`, раскрой — `services/cutting/`), экспорт PDF/DOCX/XLSX, AI, импорт/экспорт (`dataTransfer.ts`), вспомогательные сервисы. Тесты колокализованы рядом (`*.test.ts`, vitest).
5. **AI** — конфигурация `services/aiConfig.ts` (env OpenRouter), клиент `services/openRouterService.ts`, серверная обёртка `api/ai-chat.ts`. Шов AI-генерации сметы: счётчик `aiGenerationRequest` в `UiState` — App инкрементирует через контекстный экшен, `EstimateEditor` открывает модалку эффектом на прирост счётчика (не на маунт), все прежние валидации сохранены.

## Границы модулей

- **`components/ui/` — слой примитивов, владелец визуала.** Адаптации рецептов devignerui под тёмную тему: `tabs`, `badge`, `delete-button`, `date-range-picker`, `copy-button`, `switch`, `slider`, `context-menu`, `island`, `file-upload`. Слой владеет рендером, анимациями (motion/react), клавиатурой и aria; наружу отдаёт только стабильные пропс-API, исходники рецептов и motion-детали скрыты. Единственный потребитель или тяжёлое — вне слоя: палитра команд живёт в `components/CommandPalette.tsx`.
- **`components/`** — экраны и диалоги; `components/estimate-editor/` — подкомпоненты редактора смет + `sectionReorderGesture` (удержание ~400 мс переносит раздел).
- **`electron/`** — `main.ts` (лог рендерера в `userData/app.log` fire-and-forget; автоапдейт electron-updater с `autoDownload=false`), `preload.ts` (contextIsolation), `types.ts` — контракт `ElectronAPI` (`window.electronAPI`).
- **`api/`** — обёртка AI-чата (`ai-chat.ts`), env: `SUPABASE_URL` | `VITE_SUPABASE_URL`.

## Контракты, которые нельзя ломать

- **Даты**: `DateRangePicker` и аналитические фильтры — ISO-строки `yyyy-mm-dd`, `''` = не задано. Хранилище `kmobn:analytics:filters:v1` — ключ не менять; старые записи без новых полей читаются с дефолтом.
- **`DeleteButton`**: `onConfirm` — промис-контракт, reject = отмена (возврат в idle); галочка только при реальном успехе операции.
- **`SyncToast`**: `duration=0` — тост не скрывается сам (офлайн-режим); очистка таймера на unmount. `SyncState`/`SaveState` — вложенные объекты с сеттерами-обёртками.
- **`UpdateBanner`**: `role="progressbar"` + aria-valuemin/max/now; `onDismiss` во время скачивания не отменяет загрузку.
- **Импорт/экспорт**: `services/dataTransfer.ts` (`validateImportData`/`importData`/`exportData`, `SCHEMA_VERSION`), событие `kmobn:data-imported` сохраняется.
- **Аналитика**: ключ смёрженных элементов itemsMap (`${name}___${unit}`) — не баг, не трогать; react-window row объявлен на module-level; recharts-графики не трогаются.
- **Кровельная математика**: `roofFactor` (карта по форме крыши) и `ROOF_AREA_PITCH_FACTOR = 1.15` (площадь кровли) — две разные величины, не смешивать; AI и визард используют 1.15 намеренно, возврат к 1.3 только по явной просьбе.
- **`View` enum** — числовой с пропусками; значения живут в сохранённых данных.

## Конвенции

- Отступы: старые файлы 4 пробела, новые 2 — следовать стилю конкретного файла, не переформатировать.
- Компоненты пишутся как `React.FC`; исключение — generic-компоненты: `Tabs<T extends string>` объявлен функцией, потому что FC не параметризуется дженериком.
- Анимации — пакет `motion` (импорты `motion/react`); keyframes в `tailwind.config.js` нет — анимации живут в рецептах `ui/`, конфиг не раздувать.
- Tailwind-кастомы `max-w-8xl` (1500px, единственный ограничитель контента; локальные max-w внутри main не добавлять) и экран `3xl` (1920px) объявлены в `tailwind.config.js`.
- Иконки действий нейтральные, удаление красное; «Сохранить»/ИТОГО красные. Основной цвет приложения — #DC2626 (токены темы, см. CONTEXT.md).
- Брендовые иконки VK и Telegram — inline-глифы в `LandingPage.tsx`: в пакете `@devigner-ui/icons` их нет.
- console.error/warn в проде остаются; удаляются только log/info/debug.
- Приёмка изменения — `npm run check` (typecheck + lint 0/0 + vitest); тесты прогонять при изменении расчётного или сервисного поведения; E2E Electron — только для изменённых десктоп-интеграций.
- Секреты и локальные пользовательские данные в логи и отчёты не попадают.
