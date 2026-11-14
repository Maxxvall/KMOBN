# interfaces — границы, решённые в спецификации

## Границы, решённые в спецификации

Это прогон-починка: новых подсистем почти нет, но четыре общих модуля становятся единственными источниками правил — все тикеты обязаны ходить в них, а не заводить локальные копии.

### `services/format.ts` — форматтеры и имя файла
- **Владеет:** человекочитаемым форматированием байтов/времени и санитизацией имён файлов.
- **Отдаёт:** `formatBytes(bytes: number): string` (есть), `formatDuration(milliseconds: number): string` (перенести из ProfileModal), `sanitizeFileName(name: string): string` (тело — самый строгий из существующих трёх вариантов; перед заменой сверить отличия копий в `pdfContractGenerator.ts:12`, `premiumPdf.ts:125`, `cutting/exportPdf.ts:21`).
- **Скрывает:** пороги единиц, список запрещённых символов.
- Потребители: UpdateBanner, ProfileModal, все 4 PDF-генератора, cutting-экспорты.

### `types.ts` — нормализация русского текста
- **Владеет:** правилом «как сравниваются названия» (lowercase, ё→е, базовая чистка).
- **Отдаёт:** `normalizeKey` (тело дополняется ё→е), при необходимости `normalizeRussianLower` — если выделение отдельного хелпера понадобится >1 модулю.
- **Скрывает:** конкретные трансформации.
- Потребители: houseScope, aiProjectSpec, estimateSections, houseGeometry, houseCalculator, cutting/stageOrder, wikiAI, cutting/importCsv — их локальные `.replace(/ё/g,'е')` заменяются вызовом, если семантика совпадает (отличия локальных вариантов — задокументировать в тикете, не потерять).
- Осторожно: `normalizeKey` участвует в матчинге каталога/цен — изменение ё→е намеренно расширяет совпадения; существующие тесты не должны изменяться под новое поведение, кроме тестов, прямо проверяющих ё.

### `services/houseCalculator.ts` — кровельная математика (две разные величины!)
- **Владеет:**
  1. Картой коррекции по ФОРМЕ крыши `roofFactor` (0.9–1.25, houseCalculator:293-299) — масштабирование РЕАЛЬНЫХ количеств из смет-референсов. НЕ трогается, семантика документируется комментарием.
  2. `ROOF_AREA_PITCH_FACTOR = 1.15` — pitch-фактор ПЛОЩАДИ кровли с единицы пятна застройки. Единственный источник для всех смет-путей.
- **Отдаёт:** `ROOF_AREA_PITCH_FACTOR` (экспорт).
- **Скрывает:** значения и соответствия.
- Потребители pitch-фактора: smartEstimateBuilder (обе ветки материала кровли, 232-245), openRouterService (`estimateRoofArea` 996-998 + 4 места текста промптов: 502, 1063, 1249, 1314 — константа интерполируется в текст). НЕ потребители: порог аномалии openRouterService:196 (`*1.3` — другая величина), карта houseCalculator.

### `services/estimateLabels.ts` — что переживает сохранение
- **Владеет:** правилом «какие labelIds у сметы валидны при сохранении».
- **Отдаёт:** чистую функцию вида `resolveSaveLabelIds(estimate, sectionsDocument, catalogReady: boolean): string[]` (имя по месту): `catalogReady=false` → вернуть `estimate.labelIds` как есть (валидация UUID всё равно в `saveLocalRecords`); `true` → текущая логика `getEffectiveEstimateLabelIds`.
- **Скрывает:** фильтрацию по активности/лимит.
- Потребители: EstimateEditor.handleSave; dataTransfer не использует её для отсутствующего поля (см. R02 — `Array.isArray` различает).

### Состояние обновления приложения (App.tsx)
- **Владеет:** `appUpdateInfo`, `appUpdateDownloaded`, `appUpdateDownloading`, `appUpdateProgress`.
- **Отдаёт:** пропсы в `UpdateBanner` (уже: version/downloaded/downloading/progress) и `ProfileModal` (добавить `downloading`); `downloading` сбрасывают только `downloaded`/`error`/`notAvailable`, НЕ `onDismiss`.
- Тип `UpdateDownloadProgress` — в `electron/types.ts`, UI импортирует только `import type`.

### Electron main — лог рендерера
- **Владеет:** записью консоли рендерера в файл.
- **Отдаёт:** асинхронную запись (fire-and-forget с проглатыванием ошибки записи), без смены формата и пути файла.

## Интерфейсы, построенные тикетом 01
- `services/estimateLabels.ts`: `resolveSaveLabelIds(estimate, document, catalogReady: boolean): string[]` — что переживает сохранение при неготовом справочнике.
- `services/estimateSections.ts`: `getConflictRemovedLabelNames(document, 'local'|'remote'): string[]` — какие метки удалит tombstone другой стороны.
- `types.ts`: `normalizeRussianLower(value: string): string` (реэкспорт из houseScope) — общий ё→е-хелпер.
- `services/houseCalculator.ts`: `ROOF_AREA_PITCH_FACTOR = 1.15` — pitch-фактор площади кровли.
- `services/format.ts`: `sanitizeFileName(name): string`, `formatDuration(ms): string`; `sanitizePremiumPdfFileName` оставлен как делегат.

## Интерфейсы доводки (тикеты 02/03)
- `services/premiumPdf.ts`: новый экспорт `generatePremiumEstimatePdf(estimate, materials?, title?)` — полный premium-пайплайн (загрузка шрифтов, проверка, save) в одном месте; `documentExport.exportEstimatePdfColored` только делегирует, СВОЯ сигнатура неизменна.
- Контракт `components/ui/delete-button.tsx` (DeleteButton): `onConfirm` может ОТКЛОНИТЬСЯ — отмена пользователя; тогда кнопка возвращается в покой, галочка «done» только на реальном успехе.
- Граница ширины: `max-w-8xl` (tailwind.config) — единственный ограничитель контента; локальные max-w внутри main не добавляются.

## Швы для тестов
- Colocated `*.test.ts` (vitest) рядом с сервисом — существующий паттерн, новые чистые функции (`resolveSaveLabelIds`, `roofFactorFor`, `sanitizeFileName`, ё-хелпер) тестируются там же.
- `dataTransfer.test.ts` — кейсы R02 (поле отсутствует vs `[]`) добавить рядом с существующим тестом «явный []».
- `estimateEditorSignature.test.ts` — контракт dirty-подписи не менять.
- Компонентные правки (UX) — по правилу AGENTS.md проверки кодом/диффом; прогон `npm run check` — в конце каждой волны тикетов.

## Стек и команды для исполнителя
- Стек: React 19, TypeScript 5.8 (strict: true в обоих tsconfig), Tailwind 3.4 (шкала до 7xl — «8xl» НЕ существует, см. тикет), Vitest (colocated *.test.ts), Electron 43 (main в electron/main.ts, preload контекст-изоляция), Supabase v2. Иконки — @devigner-ui/icons.
- Установка: `npm install` (уже установлено — зависимости не добавлять).
- Проверка: `npm run check` (= typecheck + lint + test). Один файл: `npx vitest run services/dataTransfer.test.ts`.
- Сборка/запуск НЕ выполнять (правило AGENTS.md): визуальные правки проверяются кодом и диффом; сборка нужна только при затрагивании packaging/Vite-конфига — в этом таск-наборе её нет.
- Коммит: заголовок `fix: …` по сути, тело — почему; пути перечислять явно.

## Правила проекта (слово в слово из carried «Договорились» + AGENTS.md)
- Пользовательский AGENTS.md — главный источник проверок; успешное evidence неизменного кода переиспользуется.
- До двух необязательных меток; фильтр по всем выбранным одновременно (AND) только в «Текущих».
- «Типовые проекты» постоянна; её назначения достаточно для расчёта независимо от статуса.
- Новая версия сохраняет метки, отдельная копия и черновик калькулятора создаются без меток.
- Офлайн-сохранение, очередь, merge и tombstones обязательны; snapshots не перетирают актуальные названия и удаления.
- Порядок разделов индивидуален для сметы и документов; новые в конец. Удержание ~400 мс переносит, короткий клик сворачивает.
- Иконки действий нейтральные, удаление красное; «Сохранить»/ИТОГО красные. Фильтр периода не меняет сортировку/экспорт. Платежи не возвращаем.
- AGENTS.md: малые визуальные/копирайт-изменения UI — проверка кодом и диффом, не запускать Vite/Electron/Playwright/сборку; правки расчётов/сервисов — `npm run test`; сборка — только если затронута упаковка/Vite-конфиг/релиз.
- Не логировать Supabase-креденшеллы и локальные пользовательские данные.
