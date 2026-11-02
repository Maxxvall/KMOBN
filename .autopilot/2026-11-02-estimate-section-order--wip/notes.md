# Исследование: порядок разделов сметы и иконки редактора

Дата: 2026-11-02. Корень: `C:/Users/Administrator/Desktop/боты/KMSmeta`.
Прочитан `AGENTS.md`; применён ponytail: минимальные законченные изменения по существующим швам.
Исследование статическое: приложение, dev/build/test/lint не запускались; `.env` и persisted пользовательские данные не читались.
HEAD `f4eb93a`: после `fa9ad3c` добавлен только план, программный код этим коммитом не менялся.
Существующие изменения `.autopilot` и остатки прошлого прогона не изменялись.
В этом исследовании создан только данный файл; программных правок нет.

## Модель и единый порядок

- `types.ts:18` — `EstimateSectionSnapshot { id: SectionId; label: string; order: number }`.
- `types.ts:143` — `Estimate` уже содержит `selectedSections?: SectionId[]`, `sectionSnapshot?: EstimateSectionSnapshot[]`.
- `selectedSections` отвечает за присутствие пустого раздела; категории позиций также делают раздел видимым.
- `sectionSnapshot` одновременно хранит имя раздела на момент сохранения и независимый порядок конкретной сметы.
- `services/estimateSections.ts:173` — `getEstimateCategories(items, selectedSections, snapshot, document)`.
- Он строит `present` из selected + categories позиций; при snapshot сортирует его копию по `order` и фильтрует по present.
- Без snapshot берёт порядок реестра аккаунта через `getResolvedEstimateSections(document, { includeArchived: true })`.
- Категории без записи в preferredOrder дописываются по порядку Set: сначала selected, затем первое появление в items.
- Неизвестные, `GENERAL` и архивные использованные категории остаются видимыми; это обязательная совместимость.
- Snapshot с повторными id сейчас способен породить повторные карточки: новый helper должен выдавать уникальные id.
- `services/estimateSections.ts:308` — `captureEstimateSectionSnapshot(ids, document)` создаёт labels и order по ids.
- Для существующей сметы этот capture напрямую опасен: заменит сохранённые labels актуальными именами аккаунта.
- `services/estimateSections.ts:429` — `preserveEstimateSectionSnapshot(estimate, document)` сохраняет прежние labels.
- Он объединяет ВСЕ старые snapshot ids (по order), затем selected, затем categories items, присваивая order 0..n-1.
- Поэтому не удаляет из snapshot уже убранные разделы; повторно добавленный раздел возвращается на старое место.
- При первом сохранении legacy-сметы без snapshot порядок preserve может отличаться от видимого глобального порядка.
- Минимальная база: helper порядка конкретной Estimate в `services/estimateSections.ts`, без нового поля/таблицы/миграции.
- Helper должен принимать текущий видимый порядок, сохранять labels существующих ids и не менять items/суммы.
- Согласованный API: `setEstimateSectionOrder(estimate: Estimate, order: readonly SectionId[], document?: EstimateSectionsDocument | null): Estimate`.
- Проверять полный набор видимых ids без повторов/пропусков/лишних; возвращать Estimate с новым snapshot, прежними items/total.
- `reorderEstimateSections` на строке 297 меняет РЕЕСТР АККАУНТА; использовать его для одной сметы нельзя.
- Не нужно менять `EstimateCategory`, persisted id или общий порядок справочников ради сортировки карточек.

## Черновик, сохранение, версии и перенос

- `components/EstimateEditor.tsx:233` — baseline из initialEstimate/context; локальный `estimate` сбрасывается при новой baseline.
- `visibleCategories` на строке 271 уже вызывает общий getEstimateCategories с документом аккаунта.
- `buildEstimateDirtySignature` в `components/estimateEditorSignature.ts:22` хеширует selected в его текущем порядке.
- Он НЕ хеширует sectionSnapshot: перестановка только snapshot не включает предупреждение о несохранённых правках.
- Нужна семантическая учётность порядка/label snapshot; нормализация baseline не должна ложно помечать открытие старой сметы dirty.
- `buildEstimateItemsSignature` отвечает за конкурентное применение AI; перестановка разделов не меняет позиции и этот hash трогать не нужно.
- Effect `EstimateEditor.tsx:365` вызывает `onDraftChangeAction(estimate)` после изменения локального estimate.
- `App.tsx:1302` — `applyEditorDraft` делает spread draft + preserve snapshot и кладёт результат в `editorDraftRef`.
- `handleSaveRequest` зеркалирует draft в state, затем открывает варианты сохранения; `handleUnsavedSave` использует ref.
- `hooks/useEstimateCrud.ts:93` — `handleSaveEstimate` валидирует, вызывает `applyEstimateSave`, затем `saveEstimates`.
- `services/estimateLifecycle.ts:86` — `applyEstimateSave` переносит весь draft spread при overwrite и новой версии.
- Старые версии сохраняют собственный payload; менять порядок всей цепочки при одном reorder не нужно.
- `services/database.ts:457,521` — `saveEstimates → saveLocalRecords`: hash всего record, outbox-first, затем IndexedDB cache.
- Общие JSON payload уже сохраняют snapshot; инфраструктуру Electron/Supabase/offline queue расширять не требуется.
- `App.tsx:1064–1155` — debounced autosave сохраняет state `estimates`, materials/works/bundles, а НЕ editorDraftRef.
- Следовательно, текущий несохранённый draft не восстанавливается после перезапуска; добавление autosave черновика — отдельная функция.
- Перестановка должна проходить существующий Save/Unsaved flow; не обещать немедленную durable запись без согласованного изменения UX.
- `EstimateEditor.tsx:1133` — `addCategory` дописывает selected; `removeVisibleCategory` удаляет selected и все items категории.
- Удаление непустого раздела спрашивает confirm; пересчитывает total, snapshot сейчас оставляет прежним.
- `handleDuplicateSection` на строке 1155 копирует позиции внутри ТЕХ ЖЕ category, а не создаёт новый раздел.
- `handlePasteFromEstimate` дописывает items в целевой раздел; порядок исходной сметы для этой операции не нужен.
- `handleApplyBundles`, AI-add, AI-generation могут добавить новые categories без явного addCategory; helper обязан учитывать их.
- `handleGenerate` на строке 853 заменяет items шаблоном, оставляя остальные поля текущей сметы через spread.
- `types.ts:220` — `ProjectTemplate` хранит только items/baseArea, собственного sectionSnapshot/selectedSections нет.
- `hooks/useEstimateCrud.ts:280` — `handleSaveAsTemplate` также переносит только items, baseArea и имя.
- Если шаблон обязан переносить порядок/пустые разделы, нужны optional поля template + оба пути генерации + import merge + тест.
- Это требует явного решения; требование «порядок каждой сметы» само по себе не требует менять формат шаблонов.
- Минимальный вариант для шаблона: сохранять порядок текущих ещё присутствующих разделов, новые categories дописывать в конец; формат ProjectTemplate оставить прежним.
- AI/комплекты/вставка: до изменения взять текущий видимый порядок, после — оставить surviving ids и дописать newly present ids в детерминированном порядке.
- Делать это в функциональном setEstimate(prev), чтобы AI completion не возвращал порядок, существовавший до пользовательского drag.
- Удаление раздела: после удаления items/selected вызвать API с оставшимся visible order; очищенный snapshot не удерживает прежнюю позицию.
- Повторное добавление: сначала добавить selected, затем API `[...текущий visible, newId]`; уже видимый id — no-op, не дубль.
- `services/clientEstimate.ts:16` — `toClientEstimate` удаляет внутренние crew/house поля, snapshot/selected сохраняет.
- `services/dataTransfer.ts:53,106` — `createEstimateTransfer`, `prepareSharedEstimateImport` сохраняют поля spread.
- Обмен одной сметой меняет id/номер/версию/item ids, но порядок snapshot не сбрасывает.
- `prepareEstimatesForExport` удаляет только explanation; полный JSON backup также сохраняет snapshot.
- `importData:289` — `hasEstimateChanged` не сравнивает snapshot/selected, но сам merge на строке 385 их пишет spread.
- Сейчас reorder-only import может быть показан как «без изменений»; стоит поправить сравнение, не вводить лишнюю schemaVersion.
- `parseEstimateTransfer` проверяет основные поля, но shape snapshot не валидирует; helper не должен терять валидные unknown ids.
- `services/estimateIntelligence.ts:487` — `getEstimateContentFingerprint` сортирует selected и игнорирует snapshot.
- Тогда версии с разным порядком считаются дублями и предлагаются к удалению; включить порядок в fingerprint и регрессию.

## Реальные экспорты и граница документов

- Из editor прямой кнопки PDF нет: `EstimateHistory` вызывает `App.tsx:1371 handleGeneratePdf` для сохранённой Estimate.
- `toClientEstimate → pendingExportEstimate → PdfStyleModal → services/documentExport.ts` — реальная цепочка.
- Plain: `exportEstimatePdfPlain → services/pdfGenerator.ts:13 generatePdf`.
- Plain на строке 145 перебирает getEstimateCategories(...snapshot), фильтрует items категории, пропускает пустые категории.
- Внутри использует getSectionSubgroups; исходный порядок строк внутри подгруппы сохраняется через filter.
- Colored: `exportEstimatePdfColored → pdfGenerator2.ts:10 generatePdf → premiumPdf.ts:createPremiumEstimatePdf`.
- `premiumPdf.ts:84 buildPremiumEstimateModel` перебирает общий orderedCategories; пустые категории исключает.
- Подгруппы colored фиксированы WORKS/MATERIALS/DELIVERY, строки внутри каждой сохраняют порядок items.
- Та же модель `sections` используется в содержимом/таблицах colored; отдельной пересортировки разделов нет.
- Contract: `exportContractPdf → pdfContractGenerator.ts:118 generatePdfContract`.
- На строке 186 использует getEstimateCategories(...snapshot), пропускает пустые и фиксирует WORKS/MATERIALS/DELIVERY.
- Название style `word-contract` устаревшее: реально создаёт PDF, а не DOCX.
- Все три документа уже разделяют один порядок; достаточно корректного snapshot плюс проверки реальных выходных таблиц.
- Пустые карточки editor сохраняются, но экспортные PDF их сегодня не печатают; не менять это попутно.
- JSON backup/обмен сериализуют массивы, snapshot — источник порядка после импорта; не нужно физически сортировать items.
- `components/Analytics.tsx:1268` экспортирует single-estimate PlanFact XLSX из actualComparison.rows.
- Эти rows на строке 629 сейчас специально отсортированы по abs(diff); экспорт игнорирует snapshot.
- Для буквального «все документы сметы» XLSX export rows надо сгруппировать по getEstimateCategories выбранной Estimate.
- Сделать это в обработчике экспорта, сохранив сортировку таблицы/отклонений интерфейса; внутри раздела оставить текущий row order.
- `Analytics.tsx:1046` CSV/XLSX сравнения двух смет идёт по `categoriesTable`, пользовательской categorySort.
- `Analytics.tsx:1967` CSV/XLSX одной категории идёт по filteredItems + itemsRowSort; нескольких разделов в нём нет.
- Сравнение двух смет не имеет однозначного «порядка этой сметы»; не менять сортировку сравнительного отчёта без решения.
- `houseProposalDocx.ts:358` и `houseProposalPdf.ts:83` используют `selected.result.sections` результата калькулятора дома.
- Их вход `HouseProposalDocxInput` — варианты расчёта, не editor Estimate; создание/редактирование сметы не меняет тот result.
- Это самостоятельное коммерческое предложение; не переписывать калькулятор/его PDF/DOCX в рамках порядка одной сметы.

## Реально открываемые окна и видимые символы

- `EstimateEditor.tsx:2105–2278`: AddEstimateMaterialModal, AddEstimateWorkModal, AIMissingItemsModal, BoardMaterialSwitchModal.
- Там же: AIGenerationModal, inline quickBundleModal («Сохранить компонент»), BundlePickerModal, PasteFromEstimateModal, VersionComparisonModal.
- `App.tsx:2128,2172`: окна вариантов сохранения и несохранённых правок относятся к editor, emoji/крестиков в них нет.
- PdfStyleModal/ContractNameModal открываются из истории, emoji/крестиков нет; проверены, обязательных icon-правок не требуют.
- В AddEstimateMaterial/Work и quickBundleModal используются текстовые Отмена/Сохранить, emoji/крестиков нет.
- `EstimateEditor.tsx:1588–1599`: ▶, ⧉, 📋, ✕; кнопки вложены внутрь collapse `<button>` — невалидная интерактивная вложенность.
- `EstimateEditor.tsx:1687,1895`: ✓/• для связи материалов; 1783/2026: 📝; 1831/2034: ✖ для удаления строки.
- Icon-only `+` добавления в каталог и в quick-bundle также привести к IconAdd/состояниям той же библиотеки.
- `AIGenerationModal.tsx:22–100`: пресеты 🏠 🧱 🛖 🚗 🏚️ 🔨 ✏️; их icon сейчас string.
- `AIGenerationModal.tsx:118,299,520` динамически рендерит section.icon из registry/context: 🧱 🪵 🏗️ 🏠 🪟 ⚡ 🚚 🔨 🚰 💧, custom 📁.
- Остальные glyph в wizard: ✓ ⚠, 🪟/🚪, 📊, ★, 🤖, ✖, ←/→, завершённый шаг ✓ (408–708).
- `AIMissingItemsModal.tsx:161,173–174`: ✓, 🤖, ✖; знак × в количестве/цене — математический текст, оставить.
- `AILoadingIndicator.tsx:8`: 🤖; `CrewToolPlanPanel.tsx:107`: × удаление инструмента — тоже видимые части редактора.
- `BoardMaterialSwitchModal.tsx:201`: × закрытия; стрелки изменения цен являются смысловым текстом, необязательно заменять.
- `BundlePickerModal.tsx:117,154,219,237`: &times;, ▾/▸, ☰ drag handle, ✕ удалить из подборки.
- `PasteFromEstimateModal.tsx:75`, `VersionComparisonModal.tsx:77`: &times; закрытия; арифметические × оставить.
- Примечания — inline textarea, не отдельный modal; глобальные Profile/History/SectionsSettings в icon-очистку editor не включать.
- `components/estimate-editor/*` уже использует Devigner, но Toolbar compare/template/settings раскрашены blue/green: привести к нейтральным.
- `types.ts`/services registry icons используются вне editor; заменить их отображение в wizard локальной картой SectionId → icon component.
- Это уберёт видимые emoji без миграции shared domain types и без редизайна прочих страниц.
- Установлена `@devigner-ui/icons@3.5.0`; dist/index.d.ts подтверждает IconClose, IconTrash, IconCopy, IconClipboard, IconChevronRight.
- Также есть IconCheck, IconAdd, IconRobot, IconNote, IconMenu, IconFolder, IconHome, IconPen, IconAlertTriangle, IconRefresh, IconChartSquare.
- Уже используемые IconLayers/IconSledgehammer/IconTruck подходят для единых связных обозначений; новые пакеты не нужны.
- Единый Outline/size-4 для действий, одинаковые hit targets 44px mobile/36px desktop, aria-hidden SVG + aria-label у icon-only.
- Нейтральные action icons/close; удаление раздела/строки/инструмента/выбора — красное; смысловые warning/success не обязаны быть нейтральными.
- `MaterialPriceSyncButton` содержит ручные SVG check/refresh/help; можно заменить их Devigner в том же проходе для единого набора.
- Общий `ui/delete-button.tsx` уже визуально trash, применяется вне editor; не менять его поведение/confirm ради этой задачи.

## Жест и минимальная последовательность

- Карточки: один общий wrapper, внутренний header с collapse-кнопкой и sibling action buttons вместо button-в-button.
- Pointer Events: primary pointerdown на header, исключая interactive descendants; ref timer ровно 400 мс + pointer id/start coordinates.
- До 400 мс pointerup даёт обычный click-collapse; заметное движение до таймера отменяет удержание (порог около 6–8px).
- После таймера активировать drag, setPointerCapture; временный визуальный порядок/placeholder, соседние карточки по их midpoint.
- Перемещать визуально всю карточку (включая открытое содержимое); не ломать collapsedCategories, expandedSubgroups, openNotes по стабильным ids.
- Подавлять один click после drag/долгого удержания, чтобы drop не свернул раздел; вложенные action pointerdown не ставят timer.
- Commit в setEstimate только при завершённом drop; pointercancel/lost capture/Escape/смена baseline/unmount отменяют drag и timer.
- Пока drag активен не давать selection/native drag; существующий HTML5 drag work→material и bundles сохраняет собственный смысл.
- Готового long-press/pointer-reorder helper в проекте не найдено; HTML5 drag в SectionsSettings не соответствует задержке 400 мс.
- Решения пользователя: mouse + touch; свайп до удержания прокручивает; новый/повторный раздел добавляется в конец; открытие legacy-сметы порядок не меняет.
- Legacy при открытии: не нормализовать локальный estimate и baseline в effect; сохранить прежний fallback; при первом сохранении snapshot фиксирует именно видимый порядок.
- Touch: один pointer capture не блокирует browser pan; `touch-action: none` мешает раннему scroll, смена touch-action после 400мс не меняет начатый жест.
- Практический вариант: pointer core + scoped native `touchmove` listener с `{ passive: false }`; до hold не отменять default, движение отменяет timer.
- После активации hold отменять cancelable touchmove default до pan; проверить на реальном touch (включая контекстное меню/selection), убирать listener при cleanup.
- Task 1: estimateSections helper/legacy fallback + dirty signature + fingerprints + import counters + PlanFact export adapter + focused tests.
- Task 1 не меняет gestures/иконки; expose один понятный API для reorder/add/remove snapshot, не переписывать persistence layers.
- Task 2: подключить API в EstimateEditor, 400 мс pointer drag, независимые header actions, перечисленная ограниченная icon-очистка.
- Швы тестов: estimateSections.test.ts (legacy/unknown/labels), estimateEditorSignature.test.ts, estimateLifecycle.test.ts.
- Также estimateIntelligence.test.ts, dataTransfer.test.ts, clientEstimate.test.ts, estimateActuals.test.ts; database persistence уже generic.
- Экспорт: premiumPdf.test.ts имеет pure buildPremiumEstimateModel + реальные PDF; pdfContractGenerator.test.ts пока проверяет только суммы прописью.
- Для plain отдельного pdfGenerator.test.ts нет: минимально mock autoTable/doc.save и проверить body section order для plain/contract.
- После сервисных изменений нужен `npm run test` по AGENTS; icon-only проход требует code/diff inspection, без автозапуска dev/build/lint.
- Для pointer flow нужен focused жестовый/manual check короткий click/399/400мс/вложенные buttons/cancel/reopen; Electron main flow не меняется, E2E не нужен.
- Итог исследования: самый малый надёжный носитель порядка уже существует — sectionSnapshot; риски находятся в lifecycle его обновления и потребителях.
