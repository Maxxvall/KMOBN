<!-- autopilot:progress -->
# СметыKMOBN (karkas-master) — что осталось

Последняя сборка: `.autopilot/2026-11-22-estimates-critical-fixes/` — один прогон, три сборки: 🔴 8 критичных фиксов вкладки «Сметы» (T01 + F1, F2), 🟡 6 пунктов оптимизации (T02 + F3), 🟢 чистка мусора и дубликатов (T03 + F4). Тесты 313/313, lint чист, tsc-дельта 0, слепые приёмки 8/8, 6/6, 6/6.

## Договорились — не пересматривать

- Итог сметы — единый источник Σ item.total (`calculateEstimateTotal` в estimatePricing); инвариант строки: item.total = округлённое quantity × price.
- Хэши сравнения и поле hash в IndexedDB — компактный `fingerprintData`; в App — `memoizedFingerprint` (WeakMap по ссылке); `duplicateManagement` остаётся на полном hashData (дедупликация без коллизий).
- Числовые инпуты редактора (основные и фактические строки) — черновик-строка (numericDrafts) + safeNumber на blur/Enter; пуш черновика в App — дебаунс 300 мс со сбросом на blur/unmount/закрытие.
- Каталог в редакторе — по индексам; в списке и редакторе монтируется один DOM-вариант (useMediaQuery 768px); версии — один Map.
- Событие kmobn:cache-update бывает partial; App мерджит по id. Импортируемые записи очищаются через stripImportedServiceFields; смерженные берут локальную ревизию.
- Сейв и архивация — одна очередь mutationQueueRef; карантин legacy очереди — однократно за сессию (сбой не «запирает» guard).
- Мёртвый слой записи Supabase удалён: вся запись — только через очередь (saveOfflineRecord/deleteOfflineRecord/RPC).
- Общий код сортировки — `services/recordOrder.ts`; operationId — `services/ids.ts`; одна модалка добавления позиции (`AddEstimateItemModal`, kind-проп); один хелпер normalize→save и один хелпер sync-статуса в App (тексты/длительности прежние).
- salary_calculations удалён из списков таблиц; старые IDB-хранилища НЕ удалять (не-деструктивно), записи уходят в карантин как unrecognized.

## Не доделано

- Остатки инлайновых Σ item.total мимо calculateEstimateTotal: services/houseCalculator.ts:508, components/HouseCalculator.tsx:359, components/EstimateEditor.tsx:704 (+ смешанные формулы `it.total || it.quantity * it.price` в EstimateEditor.tsx:712-714,1938, pdfGenerator.ts:158-161, openRouterService.ts:1453; `it.total || 0` в Analytics.tsx) — формула та же, чистка для следующего захода.
- createUuid (services/estimateSections.ts:44-49) — третий uuid-генератор; генерирует id секций, не operationId — можно слить с services/ids.ts при желании.
- Сериализация save+archive (mutationQueueRef) не покрыта юнит-тестом — регресс вернёт «две версии с одним номером».
- Слияние локальной main с origin/main НЕ выполнено (истории разошлись: origin содержит сборку «м² по комплектациям» 15.11 + ветку refactor/stage-8-architecture); локальная работа запушена в ветку `smety-fixes`. Слияние — отдельная задача (13+ конфликтных файлов).

## Известные баги

- Латентные tsc-ошибки (6 шт.: serverRevision отсутствует в типе Estimate — database.ts:974, database.test.ts, offlineSync.test.ts): ни одна команда проекта не ломается (vitest/eslint/vite-build/electron-tsc чистые); чинить при введении typecheck.
- `commitActualDraft` (EstimateEditor.tsx ~:739-748) создаёт нулевые «ручные» факты при tab-проходе без ввода; в итогах не видно, но записи попадают в смету.
- Гонка render-ref при двух partial-событиях кэша в один тик (App.handleCacheUpdate) — узкая, самозалечивается полным снапшотом.
- goToView/флаги редактора после сейва срабатывают в момент фактической записи в очереди — следствие сериализации, приемлемо.

## Правки без автопилота

<!-- дата — что — почему; пишет обычная сессия, следующая сборка разбирает -->
