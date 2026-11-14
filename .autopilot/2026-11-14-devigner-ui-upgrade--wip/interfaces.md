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

- Electron E2E не нужен: десктоп-интеграция не меняется (IPC-контракты сохраняются).
- Приёмка каждого таска: `npm run check` (typecheck + lint 0/0 + vitest 408+).
- Тесты прогонять при изменении расчётного/сервисного поведения; E2E Electron — только для изменённых десктоп-флоу (здесь: нет).
- Отступы: старые файлы 4 пробела, новые 2 — следовать стилю конкретного файла; компоненты `React.FC`.
- Tailwind-кастомы `max-w-8xl`, `3xl` объявлены в tailwind.config.js; keyframes в конфиге нет — анимации рецептами (motion), не раздувать конфиг.
- Секреты и локальные пользовательские данные в логи/отчёты не попадают.
- Опасные места из notes.md («Опасные места», 10 пунктов) — обязательны к прочтению исполнителем.
