# Границы и правила

## Правила проекта

- Источник: пользовательский AGENTS.md. Малые визуальные/текстовые правки React проверяются по коду/диффу; автоматически dev/Electron/Playwright/lint/test/build для них не запускать.
- Изменения estimates/calculations, persistence, Supabase, import/export, PDF/DOCX/XLSX и Electron main считаются поведением с фокусной проверкой. Для поведения сервисов/расчётов запускать npm run test; Electron E2E только для desktop integration; build только для packaging/config/release.
- Не выводить Supabase credentials или реальные persisted данные пользователя. Не читать .env, cache и пользовательские базы ради тестов; применять синтетические fixtures.
- Память проекта — пользовательский AGENTS.md; не менять. Его правила важнее старого текста PROGRESS.md о typecheck для любой визуальной правки.
- Из carried.md дословно: «Красный акцент в редакторе — «Сохранить» и ИТОГО; «По шаблону» — outline. Текущий запрос уточняет цвета действий внутри разделов.» Пользователь согласовал нейтральные действия и красное удаление, это уточнение действует для текущего прохода.
- Из carried.md дословно: «Фильтр периода истории не меняет сортировку и экспорт.»; «Платежи не возвращаем.»
- React 19 / TypeScript 5.8 / Vite 6 / Tailwind 3; @devigner-ui/icons 3.5 уже установлен. Никаких новых dependencies, migrations и схем хранения.
- Проверка поведения: npm run test. Фокусный файл: npm run test -- <relative-file>. Дополнительно npm run typecheck для новых TS API/иконок. Не запускать общий npm run check (он запускает lint); dev/Electron/E2E/lint/build не нужны.
- Использовать текущий checkout; новый worktree, ветка, установка пакетов, публикация/деплой не нужны.

## Границы, решённые в спецификации

### Порядок сметы

services/estimateSections.ts владеет порядком и сохранёнными названиями разделов. Источник видимости — selectedSections + categories items; источник индивидуального порядка — sectionSnapshot, fallback старых смет — прежний реестр аккаунта. Не менять reorderEstimateSections (он относится ко всему аккаунту).

Новый публичный API:

`setEstimateSectionOrder(estimate: Estimate, order: readonly SectionId[], document?: EstimateSectionsDocument | null): Estimate`

- Принимает все видимые ids ровно по одному; неизвестные/пропущенные/повторённые значения отклоняет до изменения данных.
- Возвращает новую Estimate с snapshot в порядке order, labels существующих ids сохраняет. Позиции и total сохраняются без копирования/пересчёта. Семантический no-op не должен создавать dirty.
- Для append UI вычисляет старый видимый порядок, обновляет selectedSections, задаёт старый порядок + новый id через тот же API. Snapshot отсутствующих разделов не удерживает удалённые места.
- preserveEstimateSectionSnapshot использует прежний видимый порядок для legacy + документ аккаунта, сохраняет labels, отбрасывает не присутствующие ids. Не менять baseline при mount редактора и не переписывать все старые сметы.
- Действия AI/вставка/комплекты должны сохранять существующий ручной порядок; вновь появившиеся разделы после существующих. Не расширять формат ProjectTemplate: создание сметы из шаблона не является переносом индивидуального порядка другой сметы.

### Потребители порядка

- components/estimateEditorSignature.ts: buildEstimateDirtySignature учитывает реальное изменение порядка snapshot; buildEstimateItemsSignature не меняется ради перестановки разделов.
- services/estimateIntelligence.ts: getEstimateContentFingerprint учитывает индивидуальный порядок, чтобы различающиеся им версии не предлагать как точные дубли.
- services/dataTransfer.ts: hasEstimateChanged учитывает sectionSnapshot/selectedSections; существующий JSON payload уже переносит их. Не менять persistence/сеть/синхронизацию.
- PDF plain/colored/contract уже вызывают getEstimateCategories. Сохранить этот единый путь; фокусные проверки реальных моделей/таблиц экспорта вместо декоративных snapshot-тестов.
- Excel PlanFact: допускается один малый pure export helper в services/estimateActuals.ts, принимающий Estimate и текущие ActualItemComparison[] и возвращающий новую последовательность по getEstimateCategories. Использует только handler Excel в components/Analytics.tsx. Текущие sort/topRows/сравнение двух смет не меняются.
- App.applyEditorDraft уже передаёт sectionsDocument в preserve; сервисный фикс проходит в существующие Save/Unsaved flow. Не добавлять новый autosave, не обещать сохранность несохранённого черновика после перезапуска.

### Жест и карточки

- Новый хук/компонент в components/estimate-editor/ владеет 400-мс удержанием, pointer/touch состоянием, capture/listeners/timers, preview/target и edge-scroll. Минимальная понятная граница, не выделять каждую переменную в отдельную абстракцию.
- Интеграция с EstimateEditor: передать visibleCategories и стабильные ids; commit одного полного order вызывает setEstimate(prev => setEstimateSectionOrder(...)). Исходные items не сортируются.
- Header не содержит вложенных button-в-button: collapse как самостоятельная клавиатурно доступная кнопка и соседние actions. Захват с неинтерактивной области; вложенные кнопки не запускают drag.
- Короткий клик сворачивает; drag/long hold подавляет click. Отмена Escape, pointercancel, blur, смена estimate/unmount; cleanup всех ресурсов. До таймера заметное движение позволяет обычную прокрутку.
- Touch: touch-action нельзя переключить задним числом для уже начатого жеста. Не заменять нативный свайп жёстким touch-action:none на всём header. При необходимости scoped native non-passive touchmove bridge, preventDefault только для активированного переноса; pointercancel до захвата отменяет ожидание. Нужен проверяемый state seam, без новой библиотеки/браузерного стенда.
- В длинных сметах предусмотреть прокрутку к удалённой цели. Сохранять expanded/collapsed/note state по стабильным ids. Архивные ограничения редактора не обходить.

### Иконки

- Область: EstimateEditor, его estimate-editor/*, AIGenerationModal, AIMissingItemsModal, AILoadingIndicator, CrewToolPlanPanel, BoardMaterialSwitchModal, BundlePickerModal, PasteFromEstimateModal, VersionComparisonModal и другие реально вложенные окна редактора с видимыми glyph. Сверить notes.md.
- Предпочесть маленький общий ActionButton/классы при реальном повторении; SVG из @devigner-ui/icons. Существующий domain registry icon:string не мигрировать — в wizard отобразить SectionId через локальную карту SVG с fallback папки.
- Закрытие IconClose нейтральное; удаление IconTrash красное; Copy/Clipboard/Note/Chevron/Add/Pen соответствуют действиям. Значимые ✓/⚠/robot/preset emoji также SVG. Арифметические ×, обычные текстовые разделители/валюта и редактируемые данные пользователя не заменяются.
- Сохранить поведение и подписи. 44px mobile / минимум существующих 36px desktop по возможности; одинаковый размер glyph, title + aria-label для icon-only, aria-hidden SVG. Цвета warning/success допустимы по смыслу; обычные action без случайных фиолетовых/синих/зелёных акцентов.

## Швы проверки

- estimateSections.test.ts: старый порядок, reorder, неизвестные/custom ids, labels, remove/readd, неправильный набор, неизменность items/total.
- estimateEditorSignature.test.ts; estimateIntelligence.test.ts; dataTransfer.test.ts; estimateLifecycle/clientEstimate существующие швы.
- premiumPdf.test.ts и фокусные mocked autoTable plain/contract (без screenshot/golden файлов).
- estimateActuals.test.ts: PlanFact export order, исходная последовательность не мутируется, строковые суммы не меняются.
- Удержание/cancel/suppression и cleanup: целевой fake-timer/state тест при разумном seam. Физический mouse/touch gesture не объявлять проверенным без устройства.

## Завершённые таски

Пока нет.
