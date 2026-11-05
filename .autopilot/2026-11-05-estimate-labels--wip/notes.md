# Исследование: метки смет

## Рекомендуемый контракт

- `Estimate.labelIds?: string[]` — от 0 до 2 уникальных ID пользовательских меток; поле отсутствует у старых смет. Порядок хранить как выбрал пользователь, но сравнивать/фильтровать как набор.
- `EstimateSectionsDocument.labels?: EstimateLabelDefinition[]`, где `{ id: string; name: string; deleted?: boolean; createdAt?: string; updatedAt?: string }`. Системный ID фиксирован (например, `system:typical-projects`), имя «Типовые проекты», запись нельзя переименовать или удалить. Пользовательские ID создаются один раз (UUID), переименование меняет `name`, удаление ставит tombstone `deleted: true` и сохраняет ID навсегда.
- Поместить метаданные в существующую запись `estimate_sections`: IndexedDB `estimate_sections` → Supabase `public.estimate_sections.payload jsonb` (один документ пользователя, optimistic revision/RPC/outbox). У RPC проверяются известные обязательные поля `schemaVersion`, `definitions`, `order`; JSONB допускает дополнительные поля. Новая таблица, новая cache table, SQL migration и новая offline RPC не нужны. Не переиспользовать `definitions`: это справочник разделов с отдельной логикой.
- Добавить helper `getActiveEstimateLabels(document)` и `getEffectiveEstimateLabelIds(estimate, document)`: убрать неизвестные и tombstoned ID, дубли; только так считать занятые слоты, отображать, фильтровать и передавать в калькулятор. Назначение валидирует два активных ID максимум. Старым оценкам отсутствие labels означает пустой набор; автоматической разметки нет.
- Удаление — tombstone без массовой записи смет. Rename — только справочник. Tombstone остаётся при импорте и синхронизации, поэтому запоздалый estimate/offline payload со старым ID не может восстановить метку. Эффективные ID после удаления пусты, слот сразу свободен.

## Существующие функции/поля, которые расширить

`types.ts`: `Estimate`, `EstimateSectionsDocument`, `EstimateSectionsConflict`, `baseDocument` (сейчас base snapshot — только `definitions`, `order`, `serverRevision`). `services/estimateSections.ts`: `createEstimateSectionsDocument`, `normalizeEstimateSectionsDocument` (сейчас явно теряет неизвестные поля), `snapshotDocument`, `touchDocument`, `tryMergeEstimateSectionsDocuments`, `resolveEstimateSectionsConflict`. Их base/local/remote snapshots и трёхсторонний merge нужно расширить по `labels` с конфликтом при различных конкурентных изменениях одного ID; независимые изменения разных ID сливать. Tombstone нельзя вычищать при нормализации или импорте.

UI/settings: `components/EstimateSectionsSettings.tsx` и `App.tsx` (текущий provider/persistSectionsDocument/resolveConflict, примерно 351, 1895, 2009) обслуживают документ и offline conflict UI. Секции пока показываются отдельно; добавить к нему справочник меток и показ local/remote label definitions в конфликте. `contexts/EstimateSectionsContext.tsx` — документ доступен редактору.

`components/EstimateHistory.tsx`: текущие фильтры строятся после `getLatestEstimateVersions`, включая `archiveView` current/archive; добавлять label AND predicate только к текущей выборке (`archiveView === 'current'`), и сбрасывать метки в `resetFilters`/учитывать `hasActiveFilters`, `activeFilterCount`. Каждая выбранная метка должна присутствовать у Estimate; архивный просмотр не получает фильтр меток.

`components/EstimateEditor.tsx`: `handleSave` формирует `finalEstimate`; выбор назначения меток должен обновить Estimate draft. `components/estimateEditorSignature.ts:buildEstimateDirtySignature` не включает метаданные Estimate кроме перечисленных; добавить канонический hash label ID set, чтобы изменение назначения считалось dirty.

`services/estimateLifecycle.ts:applyEstimateSave`: `overwrite` и `new` копируют draft через spread; версия естественно сохранит `labelIds`, но закрепить контракт тестом. Новый Estimate editor draft `createEmptyEstimate` и `HouseCalculator.tsx:createDraft` создаются объектами с явными полями — отсутствие labelIds уже оставляет их без меток.

Пути копирования: явного дублирования Estimate UI не обнаружено. `services/dataTransfer.ts:prepareSharedEstimateImport` делает копию через spread `source`; явно убрать `labelIds`/snapshots у shared import, если это «отдельная копия без labels». `createEstimateTransfer`/`parseEstimateTransfer` сейчас переносят Estimate целиком — определить/закрепить, что single-estimate share не транслирует частные ID меток (или добавлять только snapshots, если интервью решит передавать их). Полный backup `exportData` включает `estimateSections`; его `SCHEMA_VERSION=3` и `importData` сейчас работают с estimates/estimateSections. При импорте сравнение `hasEstimateChanged` должно учитывать `labelIds`, иначе label-only backup update считается unchanged.

## Backup: перенос без settings

Полный backup должен экспортировать расширенный `estimateSections.labels` вместе со `estimates` — это основной round-trip. Для файла/импорта, содержащего только `estimates` без settings, одних `labelIds` не хватает восстановить ID→имя. Совместимый fallback: необязательный sidecar на экспортируемой Estimate, например `labelSnapshots?: Array<{id:string; name:string; deleted?:boolean}>`, заполняемый `prepareEstimatesForExport` из словаря. При импорте без `estimateSections.labels` объединить snapshots в локальный документ по ID (не менять известное имя/статус из локального canonical settings); если словарь присутствует — он канонический. Этот snapshot лишь переносная страховка и никогда не переопределяет существующий словарь, поэтому rename не требует переписывать estimates. Также расширить `mergeImportedEstimate`, чтобы не терять новые transfer fields. Альтернатива проще, но с потерей имен: сохранять неизвестные IDs скрыто до появления dictionary; для требуемого round-trip она недостаточна.

## Калькулятор и AI источники

`components/HouseCalculator.tsx` передаёт полный `estimates` в `calculationInput`; при расчёте есть retry через `onRefreshEstimates()` с новым полным массивом; при AI `runRequestedCalculation` и `explainWithAi` независимо собирают `historicalSummary` через `selectEligibleHouseHistory`. `services/houseCalculator.ts:calculateHouseEstimate` сначала вызывает `selectEligibleHouseHistory`, а при пустом результате отдельный fallback `selectHouseHistoryForAi`; `scalePackageScope` и `chooseScopeSource` используют `history` для дополнительных разделов/строений. Применить активный `system:typical-projects` ID до всех этих путей, в том числе после refresh; функцию расчёта сделать защищённой также при прямом вызове сервиса. Отбор только по метке, не по `status`; текущие селекторы фильтруют архивы/статусы, включают approved/sent + актуальные drafts за 90 дней, а AI fallback — approved/sent. Бизнес-правило требует убрать статусные ограничения (дата/последняя версия и `isArchived` — отдельно согласовать/не смешивать со статусом). Если после label фильтра нет источников, дать понятную ошибку «Отметьте хотя бы одну смету меткой “Типовые проекты”…» до обоих fallback; AI summary также брать только из этих отфильтрованных смет. `buildHouseAccuracyReport(estimates)` (HouseCalculator) проверить как возможный дополнительный history-derived output.

## Тесты, уже существующие

- `services/estimateSections.test.ts` — нормализация/создание/rename/archive и three-way merge/conflict; добавить default system label, tombstones, конкурентные rename/delete/add, stale IDs.
- `services/estimateLifecycle.test.ts` — добавить проверку, что новая версия несёт `labelIds`, overwrite сохраняет их.
- `components/estimateEditorSignature.test.ts` — signature меняется от добавления/удаления ID и не зависит от порядка массива.
- `services/dataTransfer.test.ts` — полный backup roundtrip/label-only estimate update, импорт одних estimates со snapshots без settings, legacy backup без меток, shared import без меток. `createEstimateTransfer`/`prepareSharedEstimateImport` сейчас не покрыты grep-результатами этого файла.
- `services/houseCalculator.test.ts` — selector, все статусы допустимы при активной метке, немеченые сметы не источник, все scope supplements и fallback ограничены метками, отказ без помеченных; прямой `calculateHouseEstimate`.
- `components/EstimateHistory.tsx` теста нет; желательно вынести чистый helper фильтра и покрыть AND/current-only, сохранив текущие date/sort/history semantics.
- `services/smartEstimateBuilder.test.ts` покрывает wizard selection, но это отдельный SmartEstimateWizard путь и не HouseCalculator. Прицельно решать только если label requirement включает и его.

## Граница и проверки

Коммит `271a1b9` содержит перенос разделов и общее сворачивание. В исследовании не предлагаю править эти зоны поведения. Инструкции проекта требуют `npm run test` при изменении service/calculation; визуальная правка UI сама по себе — только code/diff inspection. Не запускать проверки в этой исследовательской фазе.
