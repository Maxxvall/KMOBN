<!-- autopilot:progress -->
# СметыKMOBN (karkas-master) — что осталось

Последняя сборка: `.autopilot/2026-11-22-estimates-critical-fixes/` — две сборки в одном прогоне: 8 красных фиксов вкладки «Сметы» (T01 + F1, F2) и 6 пунктов 🟡-оптимизации (T02 + F3). Тесты 313/313, lint чист, слепая приёмка обеих сборок 8/8 и 6/6.

## Договорились — не пересматривать

- Итог сметы — единый источник Σ item.total (`calculateEstimateTotal` в estimatePricing); инвариант строки: item.total = округлённое quantity × price.
- Хэши сравнения и поле hash в IndexedDB — компактный `fingerprintData`; в App — `memoizedFingerprint` (WeakMap по ссылке); `duplicateManagement` остаётся на полном hashData (дедупликация без коллизий).
- Числовые инпуты редактора (основные и фактические строки) — черновик-строка (numericDrafts) + safeNumber на blur/Enter; пуш черновика в App — дебаунс 300 мс со сбросом на blur/unmount/закрытие.
- Каталог в редакторе — по индексам (normalizeKey Map работ, Set материалов по категориям, buildMaterialPriceIndex).
- В списке и редакторе монтируется один DOM-вариант (useMediaQuery 768px).
- Событие kmobn:cache-update бывает partial; App мерджит по id.
- Импортируемые записи очищаются через stripImportedServiceFields; смерженные берут локальную ревизию.
- Сейв и архивация — одна очередь mutationQueueRef; карантин legacy очереди — однократно за сессию (сбой свипа не «запирает» guard).

## Не доделано

- 🟢 «Мусор и дубли (удалить)» — весь зелёный список аудита: мёртвый слой upsertTable/deleteTableRecords в supabase.ts, остатки авто-ретрая (nextRetryAt/OfflineSyncError), salary_calculations в списках таблиц, дубли stableStringify/модалок/setSync+setTimeout (R11i) — пользователь направлял только красный и жёлтый списки.
- Сериализация save+archive (mutationQueueRef) не покрыта юнит-тестом — регресс вернёт «две версии с одним номером».
- 3 места считают Σ item.total инлайном мимо named-функции (estimatePricing.ts:90,124, boardMaterialSwitch.ts:313, houseCalibration.ts:92) — формула та же, чистка для 🟢-захода.

## Известные баги

- Латентные tsc-ошибки (5 шт., 3 файла: database.ts:1020, database.test.ts, offlineSync.test.ts — serverRevision отсутствует в типе Estimate): vitest/eslint/vite-build/electron-tsc их не видят, ни одна команда проекта не сломана; чинить в 🟢-заходе или при введении typecheck.
- `commitActualDraft` (EstimateEditor.tsx ~:739-748) создаёт нулевые «ручные» факты при tab-проходе без ввода; в итогах не видно, но записи попадают в смету.
- Гонка render-ref при двух partial-событиях кэша в один тик (App.handleCacheUpdate) — узкая, самозалечивается полным снапшотом.
- goToView/флаги редактора после сейва срабатывают в момент фактической записи в очереди — следствие сериализации, приемлемо.

## Правки без автопилота

<!-- дата — что — почему; пишет обычная сессия, следующая сборка разбирает -->
