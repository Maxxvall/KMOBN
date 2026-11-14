# Границы, решённые в спецификации

## Границы, решённые в спецификации

### Слой примитивов `components/ui/` (владелец визуала)

Единый слой адаптированных рецептов. **Владеет**: рендер, анимации, клавиатура, aria.
**Отдаёт**: стабильные пропс-API. **Скрывает**: исходники рецептов и motion-детали.

| Файл | API (сигнатуры) | Заметки |
|---|---|---|
| `ui/tabs.tsx` (новый) | `Tabs<T extends string>({ tabs: { id: T; label: string; count?: number }[]; active: T; onChange: (id: T) => void; disabled?: boolean; ariaLabel: string })` | скользящий пилл; keyboard ←/→/Home/End; consumers: EstimateHistory (`archiveView`), EstimateSectionsSettings (`tab`, `disabled={Boolean(orderDraft)}`), Cutting (`activeSubgroup`) |
| `ui/badge.tsx` (расширяется) | текущий `{ tone?, size? }` + `icon?: ReactNode; count?: number; onRemove?: () => void` | StatusBadge и его потребители не меняются |
| `ui/delete-button.tsx` (редизайн) | `DeleteButton({ onConfirm: () => void \| Promise<unknown>; label?; confirmLabel?; className? })` | встроенный confirm-шаг в кнопке; reject = отмена (idle), успех = галочка 1400 мс; consumer: EstimateTemplateRow:48 |
| `ui/date-range-picker.tsx` (замена внутренностей) | текущий `{ from?, to?, onFromChange, onToChange, fromLabel?, toLabel?, className? }` + встроенные пресеты | календарь с превью диапазона; ISO `''` = не задано; consumer: EstimateHistory:580,620 |
| `ui/copy-button.tsx` (новый) | `CopyButton({ getValue: () => string \| Promise<string>; label?; className? })` | зелёная фаза + фаза ошибки (буфер недоступен) |
| `ui/switch.tsx` (новый) | `Switch({ checked: boolean; onChange: (v: boolean) => void; label?; ariaLabel })` | `role="switch"`; consumers: Cutting `settings.separateStages`, HouseCalculator additions (если чекбоксы) |
| `ui/slider.tsx` (новый) | `Slider({ min, max, step?, value, onChange, ariaLabel, formatValue? })` | стилизованный нативный range + значение при перетаскивании; consumer: HouseCalculator:438 |
| `ui/context-menu.tsx` (новый) | `ContextMenuItem { id; label; icon?; tone?: 'danger'; disabled? }` + `ContextMenu({ items; onSelect })` и хук-триггер на `onContextMenu` | desktop-only; позиция у курсора, не вылазит за экран, Esc/клик-мимо закрывают |
| `ui/island.tsx` (новый) | `Island({ open: boolean; children })` — визуальный шелл пилюли-островка | потребители: SyncToast, UpdateBanner |
| `ui/file-upload.tsx` (новый) | `FileDropzone({ accept: string; multiple?: boolean; onFiles: (files: File[]) => Promise<void>; describeResult?: (file: File) => { status: 'ok' \| 'error'; message: string } })` + карточки очереди | consumers: импорт EstimateHistory, EstimateTransferModal; сервис `dataTransfer.ts` не меняется |

Вне `ui/` (один потребитель или тяжёлые): `components/CommandPalette.tsx`
(`CommandPalette({ open, onClose, commands })`, `PaletteCommand { id; label; icon?; hint?; perform; children? }`,
React.lazy), Timeline-степпер — локальный визуал в SmartEstimateWizard, KPI Chart —
расширение локального `KpiCard` в Analytics.

### Швы App

- **UiState** (App.tsx, композиция state): новый флаг открытости палитры добавляется в
  `UiState` (initialUiState), не отдельным `useState` (опасное место №3).
- **Горячая клавиша**: один window-`keydown` в App: Ctrl/Cmd+K → открыть палитру,
  Esc закрывает внутри палитры. Другие глобальные хоткеи не вводить.
- **Header**: новый опциональный пропс `onOpenCommandPalette?: () => void`; кнопка-иконка
  поиска рядом с существующими контролами (размещение решает Header); `NavIconName`
  (Header:15, 10 inline-svg) маппируется на иконки пакета.
- **Команды палитры** строит App из существующих обработчиков: `handleNavigationAttempt(View.X)`
  (9 разделов), `handleCreateNew`, поиск по `estimates` (App:281) → `handleEditPendingEstimate(id)`.
  Новых бизнес-действий палитра не содержит.
- **View** — числовой enum (types.ts:189–199, пропуски 5 и 8) не менять, не переупорядочивать.

### Контракты, которые нельзя ломать

- **DateRangePicker**: ISO-строки `yyyy-mm-dd`, `''` = не задано (`filterDateFrom/To`, EstimateHistory:282).
- **DeleteButton**: `onConfirm` промис-контракт — reject = отмена; confirm живёт в кнопке,
  `window.confirm` из `useEstimateCrud.handleDeleteTemplate` (:302) снимается в рамках R04.1.
- **SyncToast**: `duration=0` — тост не скрывается сам (offline, App:1189–1197); очистка
  `toastTimerRef` на unmount (:1207–1213); `SyncState/SaveState` — вложенные объекты, сеттеры-обёртки.
- **UpdateBanner**: `role="progressbar"` + aria-valuemin/max/now; onDismiss при скачивании
  продолжает загрузку (App:2092–2100).
- **Импорт**: `services/dataTransfer.ts` (validateImportData/importData/exportData,
  SCHEMA_VERSION 3) не меняется; событие `kmobn:data-imported` сохраняется.
- **Аналитика**: ключ смёрженных элементов itemsMap — НЕ БАГ; react-window row module-level;
  recharts-графики не трогаются. `periodPreset` получает опцию `'custom'` + `from`/`to`
  (ISO, тот же контракт что DateRangePicker); хранилище `kmobn:analytics:filters:v1` — ключ
  не менять, старые записи без custom-полей читаются с дефолтом `quarter`; preset-кнопки
  Месяц/Квартал/Год/Всё остаются.
- **Калькулятор**: UI-правки HouseCalculator не трогают расчёт; `roofFactor` и
  `ROOF_AREA_PITCH_FACTOR = 1.15` — две разные величины.
- **Офлайн-ядро**: `services/offlineSync.ts`, `offlineQueue.ts`, `indexedDbCache.ts` — не трогать.

### Тестовый шов

- Юнит-сервисы vitest (408 тестов, `npm run check` — приёмка каждого таска).
- Новый шов: `services/estimateClipboard.ts` — чистая функция форматирования списка позиций
  + `estimateClipboard.test.ts`.
- Компонентной инфраструктуры нет — не создавать (вне рамок).

## Правила проекта (Договорились — дословно из PROGRESS.md, связывают как ADR)

- Пользовательский AGENTS.md — главный источник проверок; платежи не возвращаем; «Типовые проекты» постоянна; офлайн-ядро (outbox-first, tombstones) обязательное.
- Иконки действий нейтральные, удаление красное; «Сохранить»/ИТОГО красные.
- Монолиты и @ts-nocheck — отдельный прогон (R32/R33); Prices↔Works, общий Modal — там же.
- Кровля: карта roofFactor по форме крыши остаётся отдельной от ROOF_AREA_PITCH_FACTOR=1.15 (другая семантика); AI и визард = 1.15, «AI кровля −13%» — намеренно, возврат к 1.3 только по явной просьбе.
- R42 Analytics-ключ — НЕ БАГ (элементы смёржены itemsMap `${name}___${unit}`) — не трогать.
- Mobile text-xs без 3xl-бампа — осознанно: md:hidden карточки невидимы на 1920px+, бамп был бы мёртвым кодом.
- console.error/warn в проде остаются; удаляются только log/info/debug.
- max-w-8xl (1500px) — единственный ограничитель контента; локальные max-w внутри main не добавлять.
- Редактор смет — без перестройки принятого редизайна fa9ad3c.

## Технические правила (AGENTS.md + notes.md)

| Команда | Что делает |
|---|---|
| `npm install` | Установить зависимости (только таск 01 меняет package.json) |
| `npm run check` | Приёмка таска: typecheck + lint 0/0 + vitest (408+ тестов) |
| `npx vitest run services/estimateClipboard.test.ts` | Один тест-файл (подставить нужный путь) |

## Выставлено таском 01 (факт, += к границам)

- Анимационная зависимость: **`motion`** (импорты `motion/react`) — в dependencies; `@devigner-ui/icons@3.6.0`.
- `Tabs<T extends string>({ tabs: { id; label; count? }[]; active; onChange; disabled?; ariaLabel; className? })` — объявлен функцией, не React.FC (generic-компонент нельзя типизировать FC — отмечено в коде).
- `Badge({ tone?; size?; icon?; count?; onRemove?; removeLabel? } + HTMLAttributes<span>)` — `removeLabel` добавлен ради a11y кнопки удаления (дефолт «Убрать»).
- `DeleteButton({ onConfirm; label?; confirmLabel?; className? })` — фазы idle→confirm→pending→done.
- `DateRangePicker({ from?; to?; onFromChange; onToChange; fromLabel?; toLabel?; className? })` — ISO, `''` = не задано.
- `CopyButton({ getValue: () => string | Promise<string>; label?; className? })`.
- `Switch({ checked; onChange; label?; ariaLabel; className? })` — `role="switch"`.
- `Slider({ min; max; step?; value; onChange; ariaLabel; formatValue?; className? })`.
- `useContextMenu(): { position; openFromEvent(e); open(x, y); close }` + `ContextMenu({ handle; items: { id; label; icon?; tone?: 'danger'; disabled? }[]; onSelect })` — handle-расширение к границам из спецификации: позиционирование у курсора и навешивание на `<tr>` без обёртки.
- `Island({ open; children; className? })`; `FileDropzone({ accept; multiple?; onFiles; describeResult?; className? })`.
- `estimateClipboard`: `formatEstimateItemsClipboard(items, { resolveSectionLabel? })`, `formatCatalogItemClipboard({ name; price; unit? })`.
- `useEstimateCrud.handleDeleteTemplate` пробрасывает сбой БД дальше (галочка только при реальном удалении; alert сохранён).

## Выставлено таском 02 (факт, += к границам)

- В `@devigner-ui/icons@3.6.0` нет иконок VK и Telegram (проверено по index.d.ts) — бренды остаются inline с комментарием-причиной; YouTube → `IconYoutube`, Google → `IconGoogle`.
- Пропсы `SyncToast` и `UpdateBanner` не изменились (App.tsx не тронут); UpdateBanner — плавающий островок fixed top-right.
- Локальные компоненты внутри `LandingPage.tsx` (не экспортируются): `MagneticButton{onClick; className; children}`, `FlipButton{onClick; className; label}`, `SocialLens` — по 2 копии header/footer.
- Таб-глифы ProfileModal → `IconUserCircle/IconChartSquare/IconSettingSlidersHorizontal`.

## Выставлено таском 03 (факт, += к границам)

- `PeriodPreset` += `'custom'`; payload хранилища `kmobn:analytics:filters:v1` += `customPeriodFrom`/`customPeriodTo` (ISO, `''` = не задано; старые записи → дефолт quarter; сам ключ не менялся).
- Локальный `KpiCard` (Analytics) += опциональный проп `series?: number[]`.
- Иконки Analytics: `IconDocumentText/IconRuble/IconGraphUp/IconRuler/IconStar` + `IconDocument` (EmptyState); Sparkline остался inline.
- ПКМ строк истории — desktop-only по контракту `useContextMenu`; alert-отчёты убраны только у импорта (экспортные alert сохранены по критерию).

## Выставлено таском 05 (факт, += к границам)

- `components/CommandPalette.tsx` (React.lazy, default export): `CommandPalette({ open, onClose, commands })`; экспортирует `PaletteCommand { id; label; icon?; hint?; keywords?; perform; children? }`, `filterCommands(commands, query)`, `isCommandPaletteShortcut(event)`.
- `Header`: опциональный проп `onOpenCommandPalette?: () => void`; NavIconName → иконки пакета (wrench→IconSledgehammer, chart→IconChartSquare, log-out→IconLogout, book-open→IconBook и др.).
- `UiState` += `showCommandPalette: boolean` (initialUiState + обёртка setShowCommandPalette).
- Правило Ctrl/Cmd+K продублировано инлайном в App-keydown (статический импорт isCommandPaletteShortcut склеил бы lazy-чанк; каноническое правило — в CommandPalette.tsx, покрыто тестом).
- Тест: `components/commandPalette.test.ts` (9 тестов; REDPROOF — 7/9 красных на заглушке).

## Ремонт T05 (шов AI-генерации, факт)

- `EstimateActions` += `onRequestAiGeneration?: () => void`; `EstimateContextValue` += `aiGenerationRequest: number`.
- App: `UiState` += `aiGenerationRequest: number` (initialUiState 0); `requestAiGeneration()` — инкремент счётчика; провайдер отдаёт `aiGenerationRequest` + `actions.onRequestAiGeneration`.
- Команда палитры «AI-генерация» → `perform: requestAiGeneration`; DOM-click удалён.
- EstimateEditor — источник истины модалки: эффект срабатывает на прирост счётчика (не на маунте, не во время isLoading); `handleAiGenerateClick` со всеми прежними валидациями, обёрнут в useCallback.

- Electron E2E не нужен: десктоп-интеграция не меняется (IPC-контракты сохраняются).
- Приёмка каждого таска: `npm run check` (typecheck + lint 0/0 + vitest 408+).
- Тесты прогонять при изменении расчётного/сервисного поведения; E2E Electron — только для изменённых десктоп-флоу (здесь: нет).
- Отступы: старые файлы 4 пробела, новые 2 — следовать стилю конкретного файла; компоненты `React.FC`.
- Tailwind-кастомы `max-w-8xl`, `3xl` объявлены в tailwind.config.js; keyframes в конфиге нет — анимации рецептами (motion), не раздувать конфиг.
- Секреты и локальные пользовательские данные в логи/отчёты не попадают.
- Опасные места из notes.md («Опасные места», 10 пунктов) — обязательны к прочтению исполнителем.
