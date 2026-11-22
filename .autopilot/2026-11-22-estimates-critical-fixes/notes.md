# Заметки по коду (исследование 2026-11-22, верифицировано чтением кода)

Структура: плоская — `App.tsx`, `components/`, `services/`, `hooks/`, `types.ts`. Логика в services (чистые функции, тестируются vitest), UI в components, состояние в App + hooks.

## Команды

- `npm run test` — vitest run --exclude "e2e/**" (тесты рядом с кодом: `services/*.test.ts`)
- `npm run lint` — eslint
- Сборку не трогаем: изменение не влияет на упаковку/Vite.

## Событие kmobn:cache-update (R01)

Единственный слушатель — `App.handleCacheUpdate` (App.tsx:374-410, подписка :443). Полагает `detail.data` = полный снимок таблицы.

Все диспатчеры:
- `services/database.ts:138` `dispatchCacheUpdate(key, data)` — вызовы :272 (`acceptServerVersionForPendingChange`), :294 (`prepareLocalVersionForPendingChange`), :332 (`refreshCacheInBackground`) — все шлют ПОЛНЫЙ список (перечитывают кэш/сервер).
- `services/offlineSync.ts:90,104,168` — `estimate_sections` (документ-одиночка = вся таблица, полный снимок).
- `services/offlineSync.ts:180-186` — **confirmedRecord: ОДНА запись** ← баг (частичное).
- `services/offlineSync.ts:205-209` — **rebaseAfterConfirmation: ОДНА запись** ← тоже частичное.

Слушатель: для `estimates` — normalizeEstimateChains + setEstimates (App.tsx:378-388); для `estimate_sections` — setSectionsDocument (:391-395); для templates/materials/works/bundles — setterMap → прямое setData (:397-409). Хэши: `setDataHashes(prev => ({...prev, [key]: hashData(detail.data)}))`, guard `dataHashes[key] === nextHash` → return (:375-376). Гварда `saveInFlightRef.current` только для estimates (:379).

`hashData` (services/hashing.ts:14-20) = полная stableStringify-строка. Хэши живут только в state `dataHashes` App.tsx:345.

## Итого/формулы (R02)

- Редактор: `calculateTotal` EstimateEditor.tsx:632-634 = Σ(q×p); вызывается в updateItem:687, удалении раздела:1223, duplicate:1245, paste:1257, bundles:1281 (и др.).
- `services/estimatePricing.ts`: `applyCatalogMaterialPrice`:85 и `recalculateEstimateWorkPrices`:119 = Σ item.total. Аналитика и PDF — Σ item.total.
- `updateItem` (EstimateEditor.tsx:667-689) пересчитывает `item.total = q×p` при изменении q/price (:675), `updateItemFields` тоже (:697). subgroupTotals (:657-662) и categorySubtotals (:647-654) — Σ item.total (с фолбэком q×p).
- Округление: PasteFromEstimateModal.tsx:53-54 (`quantity: +(...).toFixed(2)`, `total: +(...toFixed(2))` от НЕокруглённого q) и handleDuplicateSection EstimateEditor.tsx:1240-1241 — то же.
- Инвариант, который надо утвердить: `item.total === quantity × price` всегда; итог = Σ item.total везде.

## Ввод чисел (R03)

- Инпуты: EstimateEditor.tsx:2008 (quantity), :2011 (price) — `type="number"`, контролируемые `value={item.quantity}`, onChange → `updateItem(item.id, field, e.target.value)`.
- `updateItem`:672-675 — `Number(value) || 0` сразу в onChange → дробь («0.») съедается.
- Готовый парсер: `safeNumber` types.ts:355 — Number(String(v).replace(',', '.')) с фолбэком.
- Мобильные карточки — свои инпуты (~:2100+, тот же updateItem).

## Вставка из сметы (R04)

- `PasteFromEstimateModal` (components/, 178 строк): props `onConfirm(items, targetCategory)`, показывает «Целевой раздел» (строка :80), передаёт `targetCategory` из `pasteTargetCategory` редактора.
- Обработчик `handlePasteFromEstimate` EstimateEditor.tsx:1254-1260 — `_targetCategory` не используется, элементы добавляются как есть (со своими category).

## Импорт (R05)

- Полный импорт файла: `importData` database.ts (~:848-1110). `estimateIdMap` (:948-960): существующие по (номер, версия) → existing.id (:953), новые → `generateId('sm-id')` (:960, с рандомным суффиксом).
- `mergeImportedEstimate` (:762-767) возвращает incoming (+explanation) — serverRevision из файла сохраняется; для materials/works/bundles/templates новые записи — spread `...m` (чужой serverRevision), смерженные — spread `...existing` (локальная ревизия — ок).
- Разделы — образец очистки: database.ts:1095-1102 (`serverRevision: 0, baseDocument: undefined, operationId: undefined, syncConflict: undefined`).
- «Поделиться»: `importSharedEstimate` database.ts:744-754 → `prepareSharedEstimateImport` (:710-742) — spread `...source` (чужой serverRevision попадает), всегда НОВЫЙ id, `updated_at` уже ставится (:735).
- Механизм поломки: `saveOfflineRecord` supabase.ts:175-182 берёт `payload.serverRevision` как `p_expected_revision`; у новой записи на сервере его нет → конфликт; `isRetryableSyncError` (offlineSync.ts:47-61) для 40001/OFFLINE_RECORD_CONFLICT = false → «постоянная» ошибка, блокирует очередь.
- Чтение ревизии при постановке в очередь: database.ts:513-520 — `pendingData?.serverRevision ?? cachedById… ?? 0`.

## Очередь мутаций смет (R06)

- `hooks/useEstimateCrud.ts`: `estimatesRef` (:54-55). Архивация через цепочку `archiveMutationQueueRef.current = queue.catch().then(...)` (:170-189) — сериализована, читает estimatesRef.current, после записи обновляет estimatesRef.current.
- `handleSaveEstimate` (:113-168) — мимо очереди, читает замыкание `estimates`, пишет `saveEstimates(updatedEstimates)` напрямую.
- `applyEstimateSave` (services/estimateLifecycle.ts:65-109) вычисляет новую версию из переданного списка; `newId: sm-id-${Date.now()}` из useEstimateCrud.ts:137.

## updated_at (R07)

- `applyEstimateSave` ставит только `date: now` (4 места: :80, :86, :95, :100-104). `normalizeEstimateChains` сортирует по `updated_at || date` (estimateLifecycle.ts:21).
- `prepareSharedEstimateImport` уже ставит `updated_at` — образец.

## Флаг актуализации цен (R08)

- `markDraftEstimatesWithPriceChange` App.tsx:1496-1522 — сравнение `item.name === materialName` (:1505,:1508). Вызовы: после апсерта материала (:1546 `up.name`), после смены цены существующего (:1579 `existing.name`).
- `normalizeKey` types.ts:353 = trim + lowercase + схлопнуть пробелы. Прайсинг матчится через него (estimatePricing.ts:29-32, 96-98).

## Тесты

vitest, файлы рядом (`services/*.test.ts`). Существующие швы: `estimatePricing.test.ts` (хелперы makeMaterial/makeItem), `estimateLifecycle.test.ts`, `database.test.ts`, `database.offline.test.ts`, `offlineSync.test.ts`, `offlineQueue.test.ts`.

## Конвенции

- UI-строки — русские; комментарии в коде — английские.
- Чистая логика — в services, тестируется; React — components; оркестрация — App.tsx + hooks.
- Идентификаторы: `sm-id-`, `item-`, `template-`, `material-` + Date.now() (+ суффикс).
