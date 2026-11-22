# 01 — Критичные фиксы вкладки «Сметы»

**Требования:** R01, R02, R03, R04, R05, R06, R07, R08, R09i
**Зависит от:** —
**Зона:** `services/estimatePricing.ts` · `services/offlineSync.ts` · `services/estimateLifecycle.ts` · `services/database.ts` · `hooks/useEstimateCrud.ts` · `components/EstimateEditor.tsx` · `components/PasteFromEstimateModal.tsx` · `App.tsx` · соответствующие `services/*.test.ts`
**Волна:** 1
**Ревью:** нет (T0 — общее ревью ветки в конце)
**Модель:** обычная

## Что должно заработать

Работа по списку, по порядку (исполнитель проходит пункты 1–8 последовательно, каждый доводит до зелёного):

1. **Синк не схлопывает список (R01).** Диспатчи подтверждённой записи и rebase (`offlineSync.ts:180-186`, `:205-209`) несут `detail.partial = true`; слушатель в App для partial вмерживает записи по id в текущее состояние (estimates — потом `normalizeEstimateChains`, templates/materials/works/bundles — upsert по id) и пересчитывает `dataHashes[key]` от объединённого списка. Полные снимки ведут себя как раньше.
2. **Одна формула итога (R02).** В `estimatePricing.ts` — экспорт `calculateEstimateTotal(items) = Σ item.total`; локальная `calculateTotal` редактора (EstimateEditor.tsx:632-634) удалена, все её вызовы идут в общий экспорт. В PasteFromEstimateModal.tsx:53-54 и handleDuplicateSection (EstimateEditor.tsx:1240-1241) `total` считается от ОКРУГЛЁННОГО количества × price (продукт дополнительно не округляется) — инвариант `item.total === quantity × price`.
3. **Дробь с клавиатуры (R03).** quantity/price в десктопной таблице и мобильных карточках: `type="text"` + `inputMode="decimal"`, значение — из черновика-строки (Map «itemId:field»), onChange пишет только строку, blur/Enter — парсинг `safeNumber` и запись в позицию, черновик очищается. Программные пути (updateItemFields и др.) не меняются.
4. **Целевой раздел работает (R04).** `handlePasteFromEstimate` (EstimateEditor.tsx:1254) раскладывает вставленные позиции в `targetCategory` (subgroup сохраняется), параметр переименован из `_targetCategory`.
5. **Импорт без чужих ревизий (R05).** В database.ts — экспортируемая чистая функция очистки записи (serverRevision → 0, удалить baseDocument/operationId/syncConflict); применяется к новым записям всех таблиц в importData (estimates :989-1000, ветки templates/materials/works/bundles) и к результату `prepareSharedEstimateImport` (:710-742); для записей, смерженных с существующими локальными, serverRevision берётся из локальной записи, не из файла.
6. **Сейв в общей очереди (R06).** `handleSaveEstimate` выполняется в цепочке той же ref-очереди, что и архивация (реф → `mutationQueueRef`), читает `estimatesRef.current`, после записи обновляет ref.
7. **updated_at при сохранении (R07).** `applyEstimateSave` ставит `updated_at: now` рядом с каждым `date: now` (все 4 ветки).
8. **Флаг цен по normalizeKey (R08).** В `markDraftEstimatesWithPriceChange` (App.tsx:1504-1511) сравнение через `normalizeKey` обеих сторон.

## Из брифа, дословно

> «После каждой успешной синхронизации список смет схлопывается до одной записи»
> «ИТОГО считается по двум разным формулам… Нужна: одна функция расчёта на весь проект»
> «С клавиатуры нельзя набрать дробное количество/цену (0.5, 2.5)»
> «„Целевой раздел“ в окне вставки показывается, но игнорируется»
> «Импорт / „Поделиться“ ломают синхронизацию… Нужна: стирать служебные поля при импорте»
> «Сейв во время архивации или двойной клик = две версии с одним номером»
> «updated_at не обновляется при сохранении»
> «Флаг „нужна актуализация цен“ ставится не всем черновикам»

## Разделы спецификации

§Решение (пункты 1–9), `interfaces.md` (контракты модулей, тестовые швы, что не трогать), `notes.md` (точные места в коде).

## Критерии приёмки

- [ ] offlineSync-тест: событие после подтверждённой записи и после rebase несёт `partial: true`; estimate_sections-события — без partial
- [ ] merge partial-записей в App: юнит-проверка недоступна (компонент) — код следует контракту `interfaces.md` (мердж по id + normalizeChains + пересчёт хэша), проверит ревью ветки
- [ ] estimatePricing-тест: `calculateEstimateTotal` = Σ item.total; в коде редактора нет локальной копии формулы
- [ ] Тест/код: в paste и duplicate `total = округлённое quantity × price`
- [ ] Код: инпуты quantity/price показывают черновик-строку во время ввода («0.» не съедается), на blur/Enter парсят через `safeNumber` и коммитят; мобильные карточки — тот же механизм
- [ ] Код: вставленные позиции получают `category === targetCategory`
- [ ] database-тест: чистящая функция удаляет baseDocument/operationId/syncConflict и обнуляет serverRevision; функция применена во всех импорт-ветках и в «Поделиться»; для смерженных записей ревизия — локальная
- [ ] Код: handleSaveEstimate внутри mutationQueueRef-цепочки, читает estimatesRef.current
- [ ] estimateLifecycle-тест: все ветки applyEstimateSave возвращают записи с `updated_at === date === now`
- [ ] Код: сравнение в markDraftEstimatesWithPriceChange через normalizeKey
- [ ] `npm run test` зелёный полностью (не только новые тесты)
- [ ] `npm run lint` не выдаёт новых ошибок в изменённых файлах
