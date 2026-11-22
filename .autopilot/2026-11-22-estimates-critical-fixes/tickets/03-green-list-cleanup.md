# 03 — 🟢 Чистка мусора вкладки «Сметы»

**Требования:** R11i, R18, R19, R20, R21, R22, R23
**Зависит от:** —
**Зона:** `services/supabase.ts` · `services/offlineQueue.ts` · `services/offlineSync.ts` · `services/indexedDbCache.ts` · `services/database.ts` · `services/estimatePricing.ts` · `services/boardMaterialSwitch.ts` · `services/houseCalibration.ts` · `services/recordOrder.ts` (новый, если подтверждится перекрытие) · `services/ids.ts` (новый) · `components/AddEstimateItemModal.tsx` (новый) · `components/AddEstimateMaterialModal.tsx` (удаление) · `components/AddEstimateWorkModal.tsx` (удаление) · `components/EstimateEditor.tsx` · `App.tsx` · тесты: `services/offlineReliability.test.ts`, `services/offlineQueue.test.ts`, `services/offlineSync.test.ts`, `services/database.test.ts` (если задет)
**Волна:** 1
**Ревью:** нет (T0 — общее ревью ветки в конце)
**Модель:** обычная

## Что должно заработать

Работа по списку, по порядку (пункты 1–6). НИЧЕГО из поведения не меняется: это удаление мёртвого кода и слияние дублей. Красные/жёлтые фиксы (R01–R17) не регрессируют.

1. **Мёртвый слой записи (R18).** Удалить в supabase.ts `upsertTable`, `deleteTableRecords` и 6 upsert-обёрток. fetch*/RPC-функции не трогать. Предпроверка оркестратора (2026-11-22): вызовов вне supabase.ts и vi.fn-мока offlineReliability.test.ts нет; если исполнитель найдёт живого вызова — BLOCKED, не удалять.
2. **Остатки авто-ретрая (R19).** Удалить `nextRetryAt` (поле, вычисление бэкоффа в markFailed, сброс в rebaseAfterReview). markFailed сохраняет retryCount/lastError/lastAttemptAt/failureKind. Удалить класс OfflineSyncError — plain Error с тем же сообщением в offlineSync.ts:225 (совпадение имени в App.tsx — formatOfflineSyncError, другой символ, не трогать). Тесты с assertions на nextRetryAt → переписать на failureKind/lastAttemptAt.
3. **salary_calculations (R20).** Убрать литерал из: CacheTableKey + STORE_NAMES (indexedDbCache.ts:7,56), SUPPORTED_TABLES (offlineSync.ts:15), списка workspace-таблиц + фильтра isWorkspacePendingChange (offlineQueue.ts:43,:26). IDB-хранилища НЕ удалять. Тестовые фикстуры salary_calculations → 'bundles'.
4. **Дубли (R21).** (а) stableStringify ×2 — уже исчез в сборке 2, убедиться grep-ом (0 вхождений вне hashing.ts). (б) сортировка/нормализация: сверить database.ts:41-86 с supabase.ts:36-108, совпадающее — в новый services/recordOrder.ts (без циклов импорта), несовпадающее не трогать. (в) createOperationId → один экспорт в services/ids.ts (offlineQueue.ts:76, supabase.ts:279, третий — grep). (г) Модалки: слить в components/AddEstimateItemModal.tsx с пропом kind: 'material'|'work' — тексты/единицы/валидация/поведение 1:1; оба старых файла удалить; EstimateEditor обновить импорт. (д) normalize→save в App (handleCacheUpdate + loadHistoryData) → один хелпер. (е) 13 мест setSync+setTimeout → один хелпер в App; тексты/длительности идентичны; не смешивать sync-banner и toast.
5. **Мелочи редактора (R22).** Удалить loadingPrices (:371) с always-false использованиями (:1901-1902,:1929-1930 и др. — grep по файлу); удалить мёртвое условие «items.length === 0 && !visibleCategories.includes(category)» (проверив его мёртвость после рефакторов); colSpan примечаний → `showActuals ? 12 : 8`; id addItem/addActualOnlyItem → суффикс `-${Math.random().toString(36).slice(2, 9)}`.
6. **Инлайновые суммы (R23).** estimatePricing.ts (:90,:124), boardMaterialSwitch.ts (:313), houseCalibration.ts (:92) → вызов calculateEstimateTotal (в estimatePricing — прямая замена reduce на вызов собственной функции).

## Из брифа, дословно

> «Мёртвый слой прямой записи в Supabase: upsertTable/deleteTableRecords + 6 обёрток… вызовов нет, всё идёт через очередь»
> «Остатки старого авто-ретрая: retryAt всегда null… бэкофф в markFailed никем не читается, класс OfflineSyncError нигде не ловится»
> «salary_calculations — остатки удалённого калькулятора в списках таблиц»
> «Дубли: stableStringify ×2, логика сортировки ×2…, createOperationId ×3, AddEstimateMaterialModal на ~95% совпадает с AddEstimateWorkModal, блок „normalize → save“ в App ×2, 8 мест с ручным setSync+setTimeout вместо готового showToast»
> «Мелочи редактора: мёртвое состояние loadingPrices…, мёртвое условие :1781, colSpan строки примечаний не учитывает колонки „Факт“ (:2040), id новых строк без случайного суффикса»

## Разделы спецификации

§Сборка 3 (Решение R18–R23), interfaces.md (раздел «Границы сборки 3»), notes.md.

## Критерии приёмки

- [ ] grep: upsertTable/deleteTableRecords/upsert*-обёртки отсутствуют в коде (fetch* на месте); offlineReliability-мок чист
- [ ] grep: nextRetryAt и OfflineSyncError отсутствуют; useOfflineSync/App не изменили обработку ошибок; offlineSync тесты зелёные
- [ ] grep: salary_calculations отсутствует в services/ (кроме осиротевших IDB-хранилищ, их не трогаем); тесты не ссылаются
- [ ] recordOrder.ts: один источник сортировки; database и supabase импортируют оттуда; циклов нет (проверить tsc/тестами)
- [ ] ids.ts: один createOperationId; оба потребителя импортируют
- [ ] AddEstimateItemModal: один файл, kind-проп; старых двух нет; EstimateEditor использует новый; тексты/поведение 1:1
- [ ] App: один normalize→save хелпер, один хелпер sync-статуса; все места через них
- [ ] EstimateEditor: loadingPrices удалён, мёртвое условие удалено, colSpan учитывает Факт, id с суффиксом
- [ ] estimatePricing/boardMaterialSwitch/houseCalibration: Σ только через calculateEstimateTotal
- [ ] `npm run test` полностью зелёный (313 + изменённые), `npm run lint` без новых ошибок
