# Границы, решённые в спецификации

## Правила проекта (AGENTS.md — соблюдаются во всех тасках)

- Изменённое поведение расчётов/сервисов → `npm run test`. Сборка не нужна (не влияет на упаковку/Vite/Electron main).
- Не выводить в логи учётные данные Supabase и локальные пользовательские данные.
- Супабase-креденшелы: только имена переменных (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`), значений в файлах/логах/коммитах не должно быть.

## Модули и контракты

### services/estimatePricing.ts (владеет расчётом денег)

- **Владеет:** инвариант «сумма сметы = Σ item.total», «item.total = quantity × price».
- **Открывает:** новый экспорт `calculateEstimateTotal(items: EstimateItem[]): number` — единственная точка расчёта итога. Существующие экспорты не меняются.
- **Скрывает:** внутренние хелперы матчинга.

### services/offlineSync.ts (продуцент событий)

- **Открывает (контракт события):** `kmobn:cache-update` detail получает необязательный `partial?: boolean`. Частичное событие = «в detail.data только изменённые записи, это НЕ снимок таблицы». Полное = «полный список таблицы» (как раньше). Продуценты partial: только ветки confirmedRecord (:180-186) и rebaseAfterConfirmation (:205-209). estimate_sections-диспатчи остаются полными (одиночный документ = вся таблица).
- **Не меняет:** порядок работы очереди, ревизии, isRetryableSyncError.

### App.tsx `handleCacheUpdate` (потребитель событий)

- **Открывает:** то же поведение для всех таблиц, но для `detail.partial === true` — мердж по id в текущее состояние вместо замены; для estimates после мерджа — `normalizeEstimateChains`; после мерджа — пересчитать `dataHashes[key]` от объединённого списка. Гварды (saveInFlightRef, hash-guard) сохраняются с поправкой на partial (hash-guard сравнивает с хэшем объединённого списка).

### services/estimateLifecycle.ts (версии и жизненный цикл)

- **Открывает:** без изменений сигнатуры `applyEstimateSave`; контракту — каждая ветка результата несёт `date: now` И `updated_at: now`.
- **Не меняет:** правила версионирования, parentId, isArchived.

### services/database.ts (импорт/экспорт)

- **Открывает:** экспортируемую чистую функцию очистки импортированной записи (имя исполнителю: `stripImportedServiceFields` или близкое; сигнатура: принимает запись, возвращает копию без baseDocument/operationId/syncConflict и с serverRevision: 0). Применяется в `importData` ко всем новым записям всех таблиц; для смерженных с локальными — serverRevision берётся из локальной записи; в `prepareSharedEstimateImport` — очистка у результата.
- **Не меняет:** формат экспорта, схему импорта, слияние по именам материалов/работ.

### hooks/useEstimateCrud.ts (запись смет)

- **Открывает:** без изменений сигнатуры handleSaveEstimate / handleSetArchived / handleDeleteEstimate.
- **Владеет:** единственной цепочкой мутаций таблицы estimates (ref, сейчас archiveMutationQueueRef → mutationQueueRef). Оба сценария записи — save и archive — выполняются в ней; внутри сценарий читает `estimatesRef.current` и обновляет его после записи. Удаление (deleteEstimatesByNumber) остаётся как есть.

### components/EstimateEditor.tsx (редактор)

- **Владеет:** черновиком числовых полей (внутреннее состояние «itemId:field» → строка), не попадает в смету до коммита.
- **Открывает:** без новых пропсов. updateItem для quantity/price вызывается только с распарсенным числом при blur/Enter; programmatic-пути (updateItemFields, бандлы, вставка) продолжают передавать числа напрямую.
- **Контракт инпутов:** quantity/price — `type="text"` + `inputMode="decimal"`, парсинг `safeNumber` (types.ts:355).
- **handlePasteFromEstimate:** сигнатура `(items, targetCategory)` сохраняется; все вставленные элементы получают `category: targetCategory`.

### components/PasteFromEstimateModal.tsx

- **Контракт:** `onConfirm(items, targetCategory)` не меняется; в scaledItems `quantity` округляется до 2 знаков, `total` = округлённое quantity × price (без повторного округления продукта).

## Тестовые швы (существующие, новых не заводить)

- `services/estimatePricing.test.ts` — хелперы makeMaterial/makeItem; сюда тесты calculateEstimateTotal + инвариант.
- `services/estimateLifecycle.test.ts` — updated_at во всех ветках applyEstimateSave.
- `services/database.test.ts` / `database.offline.test.ts` — очистка импортируемых записей (чистая функция, без IDB).
- `services/offlineSync.test.ts` — partial-флаг на confirmedRecord/rebase событиях.
- Команда: `npm run test` (vitest run --exclude "e2e/**").
- Один файл: `npx vitest run services/estimatePricing.test.ts`.

## Что не трогать

- `e2e/`, `electron/` (main-процесс не менялся), `supabase/` (миграции RPC не трогаем), `dist*/`, `release/`.
- `npm run build` не запускать; Playwright/Electron E2E не запускать (правило AGENTS.md).
- Формат экспорта данных и схему RPC-контракта (p_expected_revision и пр.) не менять.

## Построено таском 01 (фактические интерфейсы)

- `calculateEstimateTotal(items: EstimateItem[]): number` — Σ item.total (estimatePricing.ts).
- `stripImportedServiceFields<T extends object>(record: T): T` — serverRevision→0, удаляет baseDocument/operationId/syncConflict (database.ts).
- Событие `kmobn:cache-update`: detail `{ key, data, partial?: boolean }`; partial только на confirmedRecord/rebase-диспатчах offlineSync.
- `App.handleCacheUpdate`: partial → мердж по id (estimates — затем normalizeEstimateChains), хэш от объединённого списка; списки читаются через render-refs (estimatesRef, catalogListsRef — паттерн существующего materialsRef).
- `useEstimateCrud`: общая цепочка `mutationQueueRef` для save+archive; чтение/обновление `estimatesRef.current`.
- `applyEstimateSave`: каждая ветка несёт `date: now` + `updated_at: now`.

## Границы сборки 2 (🟡 оптимизация)

### services/hashing.ts

- **Открывает:** новый экспорт `memoizedFingerprint(value: unknown): string` — компактный fingerprint с WeakMap-мемо по ссылке объекта (для иммутабельных обновлений). `hashData`/`fingerprintData` без изменений; `hashData` остаётся в duplicateManagement (дедупликация — корректность).

### services/indexedDbCache.ts

- **Контракт:** поле `hash` в CacheRecord теперь fingerprintData (компактная строка). Первый прогон сравнения после обновления перезапишет хэши всех записей кэша один раз — приемлемо и самозалечивается. `hashMemoryCache` удаляется (был write-only, комментарий лгал). Сравнение в syncCachedRecords и запись в upsertCachedRecords используют ОДНУ и ту же функцию.

### services/database.ts

- `getChangedRecords` сравнивает через `fingerprintData` (использование только для сравнения).

### services/estimatePricing.ts

- **Открывает:** `buildMaterialPriceIndex(materials: Material[]): MaterialPriceIndex` и `checkMaterialPriceIndexed(item, index): MaterialPriceCheck` (индекс: Map по normalizeKey → список материалов). Существующая `checkMaterialPrice(item, materials)` сохранена и делегирует. Используется редактором (по одному index на materialsValue, useMemo).

### components/EstimateEditor.tsx

- Черновик в App: дебаунс 300 мс (`onDraftChangeAction`), сброс (немедленный пуш последнего значения) на blur любого поля, unmount и закрытие редактора. Локальное состояние estimate остаётся мгновенным.
- Каталожные индексы — useMemo: нормализованный Map работ (raw-key worksIndex заменяется), Set нормализованных имён материалов по категории, MaterialPriceIndex один на materialsValue. `worksValue.some(...)` и per-row `filteredMaterials.some(...)` исчезают.

### components/EstimateHistory.tsx

- Один useMemo: `Map<string, Estimate[]>` «estimateNumber → версии (version desc)»; обе VersionDropdown читают из него. Мобильная карточка: клиент/дата из `selectedEstimate` (как на десктопе).

### hooks/useMediaQuery.ts (новый)

- **Открывает:** `useMediaQuery(query: string): boolean` — matchMedia + listener. В EstimateHistory и EstimateEditor монтируется только активный вариант (isDesktop ? table : cards); классы `hidden md:block`/`md:hidden` на этих блоках снимаются.

### services/offlineQueue.ts

- `quarantineLegacyChanges` — однократно за сессию при первом openQueueDb (module-guard); прямые вызовы из getAll/getQuarantinedCount/getClaimableQuarantinedCount убраны.
- `getForTable` — через индекс by_table (`store.index('by_table').getAll(table)`) + фильтр userId в JS; компаунд-индекс не добавляется (без bump схемы).

### Тесты (сборка 2)

- `services/hashing.test.ts` — memoizedFingerprint: та же ссылка → та же строка; новая ссылка с теми же данными → пересчёт (та же строка); изменение данных через новую ссылку → новый fingerprint.
- `services/indexedDbCache.test.ts` — hash в записи = fingerprint (не полная JSON-строка).
- `services/estimatePricing.test.ts` — buildMaterialPriceIndex + checkMaterialPriceIndexed: те же вердикты, что у checkMaterialPrice (current/outdated/missing/ambiguous), матчинг по normalizeKey.
- `services/offlineQueue.test.ts`/`offlineQueue.migration.test.ts` — поведение миграции не изменилось (теперь однократно); getForTable возвращает те же записи.
- Компоненты App/EstimateHistory/EstimateEditor юнит-тестами не покрываются — критерии закрываются кодом по контракту + ревью ветки.

## Построено таском 02 (фактические интерфейсы сборки 2)

- `memoizedFingerprint(value: unknown): string` — WeakMap-мемо по ссылке объекта (примитивы — прямой пересчёт) в hashing.ts.
- CacheRecord.hash = fingerprintData; одна функция computeRecordHash в upsertCachedRecords и syncCachedRecords; hashMemoryCache удалён. Первый прогон после обновления перепишет хэши кэша один раз.
- `buildMaterialPriceIndex(materials): { byId, byName }` + `checkMaterialPriceIndexed(item, index): MaterialPriceCheck`; checkMaterialPrice делегирует.
- Карантин legacy в offlineQueue — однократно за сессию при первом openQueueDb (guard сбрасывается в close()); getForTable — index('by_table').getAll(table) + фильтр userId в JS.
- `useMediaQuery(query): boolean` (hooks/useMediaQuery.ts); в EstimateHistory и EstimateEditor смонтирован только активный DOM-вариант.
- worksIndex редактора ключуется normalizeKey (матч работ в редакторе стал регистронезависимым — запрошенный переход).

## Границы сборки 3 (🟢 чистка мусора)

### services/supabase.ts

- Удаляются: `upsertTable`, `deleteTableRecords`, 6 upsert-обёрток (upsertEstimates/Templates/Materials/Works/Bundles/EstimateSections). Остаются fetch*/saveOfflineRecord/deleteOfflineRecord/fetchOfflineRecord/saveEstimateSectionsRemote. Экспорт `default supabase` и все RPC-контракты не меняются.

### services/offlineQueue.ts + services/offlineSync.ts

- Поле `nextRetryAt` удаляется из PendingChange и всех мест записи/сброса; markFailed сохраняет retryCount/lastError/lastAttemptAt/failureKind. Класс OfflineSyncError удаляется — бросается plain Error с тем же сообщением; обработчик в useOfflineSync не меняется (уже ловит generic).
- Литерал `salary_calculations` удаляется из SUPPORTED_TABLES, списка workspace-таблиц, фильтра isWorkspacePendingChange, CacheTableKey (indexedDbCache) и STORE_NAMES. IDB-хранилища не удаляются.

### services/recordOrder.ts (новый, при подтверждении перекрытия)

- **Открывает:** единые inferSortOrder/compareByStableOrder/normalizeFetchedRows/normalizeStableOrder (то, что реально совпадает в database.ts и supabase.ts; несовпадающее остаётся на месте). Оба импортируют оттуда; циклов нет (recordOrder не импортирует database/supabase).

### services/ids.ts (новый)

- **Открывает:** `createOperationId(): string` — единственная реализация (crypto.randomUUID с фолбэком). Потребители: offlineQueue, supabase, третий при наличии.

### components/AddEstimateItemModal.tsx (новый; два старых файла удаляются)

- **Открывает:** один компонент с пропом `kind: 'material' | 'work'` — тексты, единицы, валидация и поведение 1:1 как в удаляемых модалках. Использование в EstimateEditor обновляется.

### App.tsx

- Один хелпер normalize→save (используется handleCacheUpdate и loadHistoryData); один хелпер показа sync-статуса (обёртка setSync+setTimeout), все 13 мест через него; тексты/длительности идентичны.

### services/estimatePricing.ts · boardMaterialSwitch.ts · houseCalibration.ts

- Все точки Σ item.total — через `calculateEstimateTotal`.

### components/EstimateEditor.tsx (мелочи)

- loadingPrices удаляется (с состояния и always-false использований); мёртвое условие удаляется; colSpan примечаний — `showActuals ? 12 : 8`; id строк — суффикс Math.random.

### Тесты (сборка 3)

- offlineReliability.test.ts: моки supabase чистятся от удалённых ключей.
- offlineQueue.test.ts / offlineSync.test.ts / offlineReliability.test.ts: assertions на nextRetryAt переписываются на failureKind/lastAttemptAt; фикстуры salary_calculations → 'bundles'.
- Остальные тесты не меняются; `npm run test` (313) остаётся зелёным; lint без новых ошибок.
- Компоненты не покрываются юнит-тестами — критерии кодом по контракту + ревью ветки.
