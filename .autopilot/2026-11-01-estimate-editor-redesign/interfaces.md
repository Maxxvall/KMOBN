# Interfaces: границы, решённые в спецификации

Каждый исполнитель читает этот файл первым. Названия и сигнатуры — то, что другие юниты вызывают; имена на английском (как в существующем коде).

## Границы, решённые в спецификации

### 1. Папка новых компонентов — `components/estimate-editor/`
- **Владеет**: презентацией верхней области редактора.
- **Файлы** (каждый — отдельный компонент с собственным интерфейсом пропсов):
  - `EstimateEditorHeader.tsx` — заголовок, бейдж статуса, кнопка «История».
  - `EstimateMetaFields.tsx` — сетка полей: Клиент, Дата, Статус, Тип строения, Площадь.
  - `EstimateExplanation.tsx` — сворачиваемое поле «Пояснение» (внутреннее состояние открытости — своё, текст — из пропса).
  - `EstimateTemplateRow.tsx` — select шаблона, delete-button, «По шаблону», «AI», «AI-анализ».
  - `EstimateToolbar.tsx` — нижняя панель: версия, Сравнить, В шаблон, Комплекты, Доска СС/ЕВ, + Раздел, Управлять разделами, Факт, итоги, Сохранить.
- **Прячет**: локальные константы классов (`toolbarBtn`, `toolbarIconBtn` и т.п.) — не экспортируются наружу, кроме случая, когда два файла компонента делят один рецепт (тогда — `shared.ts` в той же папке).
- **Принцип**: состояние остаётся в `EstimateEditor` (поднятые пропсы); компоненты презентационные, обработчики приходят пропсами с существующими именами (`onDeleteTemplateAction`, `onSaveAsTemplateAction`, `onManageSectionsAction`, `handleGenerate`, `handleSave`, `addCategory`, `setBoardSwitchTarget`, `setShowComparison`, `setBundlePickerOpen`, `setShowActuals`, `setGenParams`, `setEstimate`). Переименование/смена сигнатур обработчиков запрещены — R11i.

### 2. Общий бейдж статуса — `components/estimate-editor/StatusBadge.tsx`
- **Владеет**: маппингом `EstimateStatus` → цвета (переносится из `EstimateHistory.tsx:24–28`: DRAFT — amber, SENT — sky, APPROVED — emerald) и разметкой бейджа.
- **Экспонирует**: `<StatusBadge status: EstimateStatus />` (+ опциональный `className`).
- **Потребители**: `EstimateEditorHeader` и `EstimateHistory` (desktop-таблица 626–630, мобильные карточки 672–674 — оба места переходят на компонент).

### 3. История смет — `components/EstimateHistory.tsx`
- **Владеет**: состоянием фильтров (`dateFrom`/`dateTo` рядом с 261–277), предикатом периода в memo `filteredEstimates` (402–416), учётом в `hasActiveFilters`/`activeFilterCount`/`resetFilters` (277–290), UI-контролами в desktop (533–559) и мобильном (561–589) блоках.
- **Не владеет**: бейджем статуса (юнит 2), типом `Estimate` (types.ts).
- Сортировка (newest-first) и состав колонок не меняются.

### 4. Монолит `components/EstimateEditor.tsx`
- **Остаётся владельцем** всего состояния, обработчиков и остального экрана (секции, AI-модалки, панель «Факт», синк цен). Верхняя область (строки 1362–1589) заменяется композицией юнита 1.
- Баннеры 1367–1407, `boardSwitchNotice` 1591–1595, панель «Факт» с 1597 — не переносятся.

### 5. Зависимости
- `@devigner-ui/icons` — точная версия в `package.json`, именованные импорты.
- devignerui-компоненты (`badge`, `delete-button`, `date-range-picker`) ставятся CLI `npx devignerui add …`; после установки адаптируются к токенам темы и лежат там, куда положит CLI, а переиспользуемые части (StatusBadge) — по юниту 2.
- Новых runtime-зависимостей, кроме перечисленных, не вводить.

## Швы для тестов
- Существующие: `npm run typecheck` (tsc web+electron). Юнит-тесты на презентационные компоненты не вводим (в проекте их нет для UI).
- Приёмка визуальная — пользователем; поведение фиксируется диффом (обработчики не менялись).

## Построенное (интерфейсы тикета 01, добавляет оркестратор)
- `components/estimate-editor/StatusBadge.tsx` — `<StatusBadge status: EstimateStatus, className? />`
- `EstimateEditorHeader` — `{estimateNumber?, status, onBack?}`
- `EstimateMetaFields` — `{estimate, setEstimate}`
- `EstimateExplanation` — `{value, onChange}` (внутреннее состояние открытости — своё)
- `EstimateTemplateRow` — `{templates, projectTemplateId, onTemplateChange, onDeleteTemplateAction?, handleGenerate, onAiGenerate, handleAnalyzeEstimate, isLoading}`
- `EstimateToolbar` — `{estimate, canCompare, setShowComparison, canSaveAsTemplate, onSaveAsTemplateAction?, setBundlePickerOpen, boardInventoryState, setBoardSwitchTarget, isArchived, addableCategoryIds, visibleCategories, sectionLabel, addCategory, onManageSectionsAction?, showActuals, setShowActuals, subgroupTotals, handleSave}`
- `components/ui/badge.tsx` — `Badge{tone, size}`; `delete-button.tsx` — `DeleteButton{onConfirm, label}`; `date-range-picker.tsx` — `DateRangePicker{from, to, onFromChange, onToChange}` (реализация без новых runtime-зависимостей; пикер — санкционированный фолбэк на пару date-инпутов)
- `shared.ts` в `components/estimate-editor/` — общие константы классов панели

## Правила проекта (AGENTS.md + договорённости)
- Стек: React 19.2 + TypeScript 5.8 + Vite 6 + Tailwind 3.4 (тёмная тема, токены в `tailwind.config.js`), Electron 43 поверх того же бандла. Node >= 20.
- Установка: `npm install`. Запуск dev — **не делать автоматически** (пользователь проверяет сам).
- **Одна проверочная команда**: `npm run typecheck` (tsc noEmit для web+electron). Её и выполнять.
- **Не запускать автоматически**: Vite dev/preview, Electron, Playwright/E2E, `npm run lint`, `npm run test`, `npm run build` (правило AGENTS.md — визуальные изменения проверяются кодом и диффом; тесты — только при изменении расчётов/сервисов, здесь их нет).
- **Не трогать**: `electron/**`, `services/**`, `contexts/**`, значения `enum EstimateStatus` в `types.ts` (их потребители завязаны на русские строки), баннеры 1367–1407 и панель «Факт» (1597+) в `EstimateEditor.tsx`, существующие обработчики (только перенос).
- Не показывать Supabase-креды и локальные пользовательские данные в логах/отчётах.
- Процесс кода (R06): ub-mode — «First make it work, then make it right»; скиллы дизайна impeccable / ui-ux-pro-max / emil-design-eng применяются при исполнении тикетов поверхностей.
