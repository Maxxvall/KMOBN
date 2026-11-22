# 02 — 🟡 Оптимизация вкладки «Сметы»

**Требования:** R10i, R12, R13, R14, R15, R16, R17
**Зависит от:** —
**Зона:** `services/hashing.ts` · `services/hashing.test.ts` · `services/indexedDbCache.ts` · `services/indexedDbCache.test.ts` · `services/database.ts` · `services/estimatePricing.ts` · `services/estimatePricing.test.ts` · `services/offlineQueue.ts` · `services/offlineQueue.test.ts` · `services/offlineQueue.migration.test.ts` · `hooks/useMediaQuery.ts` (новый) · `components/EstimateEditor.tsx` · `components/EstimateHistory.tsx` · `App.tsx`
**Волна:** 1
**Ревью:** нет (T0 — общее ревью ветки в конце)
**Модель:** обычная

## Что должно заработать

Работа по списку, по порядку (пункты 1–5, каждый до зелёного). Красные фиксы сборки 1 (коммиты 48e0dcd, e98c3e6, 060ec88) не регрессируют — правила R01–R08 из interfaces.md действуют.

1. **Компактные хэши (R12).** `hashRecord` в indexedDbCache → `fingerprintData` (hashing.ts:22-34); `hashMemoryCache` удалить (write-only, комментарий лгал); upsertCachedRecords и syncCachedRecords используют одну и ту же функцию. В database.ts `getChangedRecords` → `fingerprintData`. duplicateManagement НЕ менять (hashData для дедупликации). Первый прогон после обновления один раз перезапишет хэши кэша — приемлемо.
2. **Мемоизированный fingerprint (R13).** В hashing.ts — экспорт `memoizedFingerprint(value)` (WeakMap по ссылке объекта). В App: `hashData` для dataHashes/needsReload/гварда handleCacheUpdate → `memoizedFingerprint`. Эффект needsReload перестаёт стрингифицировать все 5 таблиц: неизменные таблицы — O(1) по ссылке.
3. **Клавиатура редактора (R14).** Пуш черновика (`onDraftChangeAction`, EstimateEditor.tsx:432-434) — дебаунс 300 мс; немедленный сброс на blur любого поля, unmount, закрытие редактора. Индексы через useMemo: нормализованный Map работ (worksIndex:442-446 ключуется normalizeKey), Set нормализованных имён материалов по категории, `buildMaterialPriceIndex`+`checkMaterialPriceIndexed` (новый экспорт estimatePricing; checkMaterialPrice делегирует) — `worksValue.some` (:1853,:2065) и per-row `filteredMaterials.some` заменяются индексными проверками.
4. **Один DOM-вариант (R15).** Новый `hooks/useMediaQuery.ts` (matchMedia + listener). В EstimateHistory (:591,:658) и EstimateEditor (:1821,:2057) монтируется ТОЛЬКО активный вариант (isDesktop ? десктоп : мобайл); классы `hidden md:block`/`md:hidden` на этих блоках снять.
5. **Версии одним Map + выравнивание мобильных карточек (R16).** В EstimateHistory один useMemo: Map «estimateNumber → версии (version desc)»; `getVersionHistory` (:424-429) читает из Map; мобильная карточка (:668-669) берёт клиент/дату из `selectedEstimate`, как десктоп.
6. **Очередь без повторных сканов (R17).** `quarantineLegacyChanges` — однократно за сессию при первом openQueueDb (module-guard); вызовы из getAll (:330), getQuarantinedCount (:496), getClaimableQuarantinedCount (:502) убрать. `getForTable` (:340-343) — через `store.index('by_table').getAll(table)` + фильтр userId в JS.

## Из брифа, дословно

> «„Хэш“ — это не хэш, а полная JSON-строка… Каждая смета в IndexedDB лежит дважды… Нужна: компактный fingerprintData — он уже есть в проекте»
> «Любое изменение данных стрингифицирует все 5 таблиц целиком… Нужна: счётчик изменений вместо сравнения содержимого» *(отклонение записано в манифесте: мемоизированный fingerprint)*
> «Каждая клавиша в редакторе = полный re-render App + скан всего каталога на каждую строку… Нужна: Map по нормализованному имени + дебаунс черновика 300–800 мс»
> «Двойной DOM… Нужна: рендерить только активный вариант»
> «Версии в списке… Нужен один useMemo → Map „номер → версии“. Мелочь: в мобильных карточках клиент/дата — из последней версии»
> «Офлайн-очередь целиком сканируется на каждом чтении… Нужна: миграция один раз при открытии БД + чтение по индексу»

## Разделы спецификации

§Сборка 2 (Решение R12–R17), interfaces.md (раздел «Границы сборки 2»), notes.md.

## Критерии приёмки

- [ ] hashing-тест: memoizedFingerprint — та же ссылка → O(1) и та же строка; новая ссылка/изменённые данные → новый fingerprint
- [ ] indexedDbCache-тест: поле hash записи — компактный fingerprint, не полная JSON-строка; upsert и sync сравнивают одной функцией
- [ ] В App не осталось вызовов hashData для dataHashes/needsReload/событий (grep), duplicateManagement нетронут
- [ ] database getChangedRecords на fingerprintData; поведение «изменилось/не изменилось» сохранено (database-тесты зелёные)
- [ ] Код: дебаунс 300 мс + сброс на blur/unmount/закрытие; локальное состояние редактора мгновенное
- [ ] estimatePricing-тест: buildMaterialPriceIndex/checkMaterialPriceIndexed дают те же вердикты, что checkMaterialPrice (current/outdated/missing/ambiguous, normalizeKey)
- [ ] Код: в editor нет worksValue.some/filteredMaterials.some на строку — только индексы
- [ ] Код: useMediaQuery-хук; в истории и редакторе смонтирован один вариант; скрытие классами убрано с этих блоков
- [ ] Код: версии из одного Map; мобильная карточка — клиент/дата из выбранной версии
- [ ] offlineQueue-тесты: миграция однократно (прогон тестов это фиксирует), getForTable — те же результаты
- [ ] `npm run test` полностью зелёный (303+ новых), `npm run lint` без новых ошибок
