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
