# notes.md — исследование кода под «Стоимость м² по комплектациям»

Дата: 2026-11-15. Только чтение, ничего не менялось. Все пути — от корня репо `C:\Users\Administrator\Desktop\боты\KMSmeta`.

## 1. Estimate и связанные типы — `types.ts` (корень, 432 строки, 4 пробела)

- `Estimate` — types.ts:150-179. Поля: `id`, `parentId?`, `estimateNumber`, `client`, `date`, `status`, `version`, `items: EstimateItem[]`, `total`, `isArchived?`, `buildingType: string`, `area: number`, `region?`, `explanation?`, `needsPriceUpdate?`, `selectedSections?`, `sectionSnapshot?`, `labelIds?: string[]`, `labelSnapshots?: EstimateLabelDefinition[]`, `sortOrder?`, `created_at?/updated_at?`, `crewToolPlan?`, `houseProjectId?`, `houseCalculationSnapshots?: HouseCalculationSnapshot[]`, `houseExecutionStatus?: 'in-progress'|'completed'|'actual-verified'`, `houseActualVerifiedAt?: string`, `houseActualBasis?: 'client-price'|'cost'`.
- **ВАЖНО: у Estimate НЕТ поля «название»** — распознавание «из названия» может опираться только на `buildingType`, `explanation`, `estimateNumber`, `client` (в houseCalculator текст = buildingType + explanation).
- `EstimateStatus` — enum, types.ts:181-185: `DRAFT='Черновик'`, `SENT='Отправлена'`, `APPROVED='Согласована'`.
- `HouseCalculationSnapshot` — types.ts:106-148: `schemaVersion:1, id, createdAt, calculationRulesVersion:1, scopeRulesVersion:1, input{ area, floors, glazingArea, doors, roofShape, package: HousePackage, additions: string[], geometry?, rates{overheadPercent, marginPercent, reservePercent, taxPercent, discountPercent} }, result{ low, base, high, confidence, sourceEstimateId, sourceEstimateNumber, items, warnings, scope[] }`. Конструктор — `createHouseCalculationSnapshot(input, result, createdAt, id, plannedItems?)` в `services/houseCalculationSnapshot.ts:4` (46 строк). «Связанный расчёт» для R07 = `estimate.houseCalculationSnapshots[].input.package`.
- `HousePackage` — **определён НЕ в types.ts**, а в `services/houseCalculator.ts:20-25`: `'box' | 'warm-shell' | 'rough-finish' | 'turnkey' | 'turnkey-engineering'`. Значения кода: box = коробка, warm-shell = тёплый контур, rough-finish = подготовка под чистовую, turnkey = под ключ, turnkey-engineering = под ключ с инженерией (R12: «чистовая отделка» пользователя ≈ turnkey, не rough-finish).
- `houseActualBasis` — types.ts:178, `'client-price' | 'cost'` — готовый образец «нового необязательного поля сметы» (база цены). «База площади» — аналогичное новое поле.
- Прочее: `View` enum (types.ts:189-200, `ANALYTICS=7`), `ESTIMATE_EXPLANATION_MAX_LENGTH=1200` (187), `EstimateLabelDefinition {id, name, deleted?}` (50-54), `normalizeRussianLower`/`normalizeKey`/`safeNumber` (333-340).

## 2. `services/houseCalculator.ts` (635 строк, 4 пробела)

- В таске названо «PACKAGE_VARIANTS (137-139)» — фактически это `HOUSE_TIER_CONFIG` (строки 136-140), `Array<Omit<HouseVariantResult,'result'>>`, 3 тира: `economy`/«Эконом»/«Тёплый контур без отделки и инженерии»/`warm-shell`; `optimal`/«Оптимальный»/«Дом с подготовкой под чистовую отделку»/`rough-finish`; `premium`/«Премиум»/«Под ключ с инженерными системами»/`turnkey-engineering`.
- Распознавание: `parseHouseDescription(description: string): ParsedHouseDescription` — строки 196-210, **экспортируется**. `ParsedHouseDescription { area?: number; package?: HousePackage }` (121-124). Площадь: regex `/(\d+(?:[.,]\d+)?)\s*(?:м2|м²|кв\.?\s*м)/i`, валидна только 20..500. Комплектация по ключевым словам нормализованного текста: «премиум»→turnkey-engineering; «под ключ»+«инженер»/«коммуникац»→turnkey-engineering; «под ключ»→turnkey; «оптималь»/«чернов»/«предчистов»→rough-finish; «тепл»+«контур»→warm-shell; «коробк»→box. Отрицаний («без отделки») функция не знает — R10 надо закрывать отдельной логикой.
- Приватный `normalize(value)` (145-148) = `normalizeRussianLower` + `[_\-]+`→пробел + схлопывание пробелов.
- Приватная `explanationMatchesPackage(estimate, targetPackage)` (221-233): box/warm-shell ← «тепл»+«контур»; rough-finish ← «оптималь»; turnkey/turnkey-engineering ← «под ключ»|«премиум» — ищет только в `estimate.explanation`.
- Отбор смет: `selectLatestVersions` (172-183, ключ `estimateNumber || parentId || id`, побеждает max `version`, потом `dateOf` = updated_at||date||created_at); `selectHouseHistoryForAi` (186-190) = `isTypicalProject(e) && !e.isArchived && Number.isFinite(e.area) && e.area>0 && items с quantity>0 и price>0` — **это готовый фильтр R02 (площадь+валидные позиции; total проверяется через items)**; `selectEligibleHouseHistory` (192-194) добавляет `isFrameHouse` (158-170: исключает баня/террас/пристрой/пост охраны/крыша/изолятор/обшив, требует «дом»/«коттедж», исключает кирпич/газобет/пеноблок/брус/бревн) — основа R04.
- `chooseHouseReference(estimates, targetArea, targetPackage)` (241-256, экспорт): сортировка статус → совпадение комплектации → эталон `isReference` (клиент «наталья дубровка», «одноэтажный дачный дом», area 79±1, APPROVED) → близость площади → свежесть.
- `services/houseGeometry.ts`: `totalFloorArea = footprintArea * input.floors` (строка 60), в результат попадает округлённым (95); `resolveHouseGeometryQuantity` (144) использует его с basis «суммарная площадь этажей». `calculateHouseEstimate` варнит, если `geometry.totalFloorArea` расходится с `input.area` > 0.01 (561-563) — готовый прецедент «базы площади» (R05/R06).
- additions (терраса и пр.): `HouseAdditionType` (59) = 'terrace'|'porch'|'veranda'|'canopy'|'garage'|'balcony'|'gazebo'; лейблы `HOUSE_ADDITION_OPTIONS` (61-69). **Площадь НЕ меняют** — это отдельные позиции: kind 'addition' (itemKind, 271), `packageAllows` пропускает их всегда (293), включаются только если `input.additions` содержит тип; если позиций не нашлось — warning (565-570). Для R05: смета с террасой отличается набором items, но `estimate.area` один и тот же — различить «площадь с террасой / без» по данным сметы нельзя, нужна подтверждаемая «база площади».
- `ROOF_AREA_PITCH_FACTOR = 1.15` (35) — перевод пятна застройки в площадь кровли; `roofFactor` карта (304-310) — коррекция количеств позиций по форме крыши. Разные вещи, не смешивать.

## 3. Метки — `services/estimateLabels.ts` (77 строк, 2 пробела)

- `TYPICAL_PROJECT_LABEL_ID = 'system:typical-projects'` (3), системная метка `{ id, name: 'Типовые проекты' }` (6) — **единственная дефолтная метка в коде**, имя захардкожено, подмена/удаление игнорируется. В брифе она «Типовой проект» — в коде мн.ч.
- Пользовательские метки: UUID-идентификаторы (`isLabelId`, 9-10), справочник хранится **в документе разделов** — `EstimateSectionsDocument.labels` (types.ts:42), обновляется через `saveEstimateSections` (database.ts:687 → RPC `save_estimate_sections`). Максимум меток на смету `MAX_ESTIMATE_LABELS = 2`.
- Связь со сметой: `labelIds` (живые id) + `labelSnapshots` (снимок определений на момент сохранения; сейчас нигде не читается активно). Активная логика — `getEffectiveEstimateLabelIds(estimate, document?)` (31-35): фильтрует labelIds по справочнику; **без document** — только по валидности id, т.е. `isTypicalProject(estimate)` (55) работает без загрузки справочника. Ещё: `matchesEstimateLabels` (50, AND-логика + withoutLabels), `resolveSaveLabelIds` (42-45, catalogReady=false → labelIds проходят как есть).
- Пикер: `components/EstimateLabelsPicker.tsx` — `EstimateLabelsPickerProps { selectedIds: string[]; onChange: (ids: string[]) => void; maxSelected?; withoutLabels?; onWithoutLabelsChange? }`.
- Grep «Типовой» по репо: только houseCalculator.ts (текст ошибки 553) и wikiDatabase.ts; строка-лейбл «Типовые проекты» — в estimateLabels.ts и supabase/tests/estimate_sections_rpc_regression.sql.

## 4. Сохранение смет и офлайн-синк

- Путь сохранения: `hooks/useEstimateCrud.ts` → `saveEstimates(estimates)` — `services/database.ts:458` → `saveLocalRecords('estimates', records)` (522-557). Внутри: для 'estimates' нормализуются только `labelIds` через `normalizeEstimateLabelIds` (546-548); diff по `hashData`; затем `offlineQueue.enqueueUpserts(ownerId, table, changed)` (сначала outbox!) и `upsertCachedRecords` (IndexedDB). **Никакого whitelist полей нет — Estimate уходит целиком.**
- `services/offlineQueue.ts` (585 строк): `enqueueUpserts<T>{id}` (292-294) кладёт `{ recordId, data: record }` — объект как есть; legacy-совместимость `getLegacyItems` (195). Есть `offlineQueue.migration.test.ts`.
- `services/indexedDbCache.ts` (305 строк): `CacheTableKey` (3), `OFFLINE_TABLES` (43, estimates первый), `STORE_NAMES` (52), `getCacheUserId = userId ?? 'anon'` (65), `getCachedRecords` (148). Хранит объект целиком.
- `services/offlineSync.ts` (269 строк): `executeRemoteChange` (52) → `saveOfflineRecord(...)` из `services/supabase.ts`; `processOfflineQueue(userId)` (253), дренаж из `hooks/useOfflineSync.ts:177`; конфликт ревизий — HTTP 409.
- `services/supabase.ts` (225 строк): `saveOfflineRecord(table, record, userId, operationId)` (100-120) — RPC **`save_offline_record(p_table, p_record_id, p_payload jsonb, p_expected_revision, p_operation_id)`**; `deleteOfflineRecord` (122); `fetchTable` (139-163) — **`select('*')`**, явного списка колонок нет, постранично по 1000; `normalizeFetchedRows` (71-98) берёт `row.payload` (если есть) и вешает `serverRevision` из `row.revision`; `OFFLINE_RECORD_TABLES` (165-172) = estimates|templates|materials|works|bundles|estimate_sections; `fetchEstimates(userId)` (190).
- Схема таблицы estimates (см. supabase/migrations/20260922040709_offline_record_revisions.sql:94-105): колонки `id, user_id, payload (jsonb), revision, last_operation_id`; триггер инкрементирует revision при изменении payload. **Payload — schemaless jsonb ⇒ новое необязательное поле Estimate НЕ требует SQL-миграции** — достаточно types.ts + ничего в маппингах (их нет). Старые клиенты просто не читают поле.
- `estimate_sections` — отдельный flow: один документ на пользователя (`id = userId`), RPC `save_estimate_sections` (supabase.ts:203-223), конфликты с merge-ревью — не смешивать с построчными таблицами.
- Валидация сметы: `validateEstimate(estimate)` — `services/estimateValidation.ts:19`, вызывается в App.tsx и hooks/useEstimateCrud.ts.
- Миграции: `supabase/migrations/` — 5 файлов, формат `YYYYMMDDHHMMSS_slug.sql`; последняя `20261105193256_qualify_estimate_sections_order_id.sql` — idемпотентный `do $migration$` с `set_config('lock_timeout','5s')`, guard-проверкой `pg_get_functiondef` и точечным `execute replace(...)`. DDL таблиц offline-таблиц в репо нет (базовая схема вне миграций).
- SQL-тесты: `supabase/tests/estimate_sections_rpc_regression.sql`, `offline_record_rpc_regression.sql`, `fixtures/` — `do $test$` блоки против fixture-базы: insert в auth.users, `set_config('request.jwt.claim.sub', ...)`, откат транзакции.
- ENV (только имена): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — services/supabase.ts:4-5.

## 5. Electron

- `electron/types.ts` (34 строки): `ElectronAPI` — getStore/setStore/getTheme/minimizeWindow/maximizeWindow/closeWindow/checkForUpdates/downloadUpdate/installUpdate/getAppVersion/isElectron/openExternal?/onAuthCallback?/onUpdate* — **сметы через IPC не ходят**, сериализации нет. `electron/preload.ts` (27) — contextBridge. `electron/main.ts` (341) — лог рендерера в userData/app.log, автоапдейт (autoDownload=false), env `KMOBN_E2E`/`KMOBN_E2E_USER_DATA_DIR`.
- Вывод: добавление полей сметы Electron не затрагивает.

## 6. Analytics и навигация

### `components/Analytics.tsx` (2253 строки, 4 пробела)
- Props: `AnalyticsProps { estimates: Estimate[]; isLoading?: boolean }` (62-65); `const Analytics: React.FC<AnalyticsProps>` (402). Из App.tsx:2252 `<Analytics estimates={estimates} isLoading={isLoading} />`, `lazy(() => import('./components/Analytics'))` (App.tsx:58). estimates — общий state App (database.loadEstimates + события `kmobn:cache-update`).
- Типы: `PeriodPreset = 'month'|'quarter'|'year'|'all'|'custom'` (67); `AnalyticsMode = 'overview'|'compare'|'details'|'actual'` (68); `DetailFilterPreset` (69); `STORAGE_KEY = 'kmobn:analytics:filters:v1'` (71); палитры `CHART_COLORS`/`CHART_TICK_STYLE` (73+).
- Состояние: `activeMode` (424, дефолт 'compare'), `periodPreset` (425, дефолт 'quarter'), `customPeriodFrom/To` (427-428, ISO `yyyy-mm-dd`, `''` = не задано); фильтры сохраняются в localStorage (500-510), старые записи читаются с дефолтами (447-465). Границы периода — 527-533.
- Готовый блок «Стоимость м²»: `costPerSqmData` (608-623) = `estimatesInPeriod.filter(e => e.area > 0)` → `{ date, costPerSqm: Math.round(total/area), area, total, buildingType, estimateNumber }`; `averageCostPerSqm` (624-626) — простое среднее. KPI «Средняя стоимость за м²» (1355-1360) и график «Стоимость квадратного метра» (1840-1856). Новый блок должен лечь рядом; медианы в коде пока нигде нет.
- Режимы: `modeButtons` (1187-1193): overview «Обзор», compare «Сравнение», actual «План-факт» (splice(2)), details «Детализация». Рендер по `activeMode`: overview 1327, actual 1374, compare 1489, общий блок overview+details 1728, details 1865.
- Заголовки секций (h2): «Из чего сложилась разница» 1565, «Категории роста и снижения» 1604, «Инженерная схема сметы» 1633, «Позиции, которые двигают итог» 1684, «Куда уходят деньги» 1735, «Финансовый тренд» 1778, «Эффективность работ» 1814, «Стоимость квадратного метра» 1840, «Сравнение смет» 1869, «Сравнение по категориям» 1926. KPI: KpiCard «Смета за период» 1330, «Оборот по сметам» 1338, «Средняя смета» 1347, «Средняя стоимость за м²» 1355, «Средняя маржа» 1363; план-факт 1379-1385.
- Виртуализация: `AnalyticsItemsRow` объявлен **на уровне модуля** (43) c `RowComponentProps` из react-window — инлайн-компонент перемонтирует строки (комментарий в коде). Не повторять ошибку в новых списках (дриллдаун, «требуют проверки»).
- Импорты: recharts (Bar/Line/BarChart/LineChart/XAxis/YAxis/Tooltip/...), `react-window` (List, RowComponentProps), `motion/react`, `@devigner-ui/icons` (IconDocument, IconDocumentText, IconGraphUp, IconRuble, IconRuler, IconStar), `./ui/date-range-picker`, `useOptionalEstimateSections` (contexts/EstimateSectionsContext), `filterToLatestEstimateVersions` (`services/estimateIntelligence.ts:80` = getLatestEstimateVersions + !isArchived), `buildActualComparisons`/`calculateActualSummary` (services/estimateActuals), `getSectionLabel` (services/estimateSections), `downloadBlob` (services/download), `XLSX` (CDN-тарбол).
- `formatRub` — **локальная** константа Analytics.tsx:89: `` `${Math.round(value).toLocaleString('ru-RU')} ₽` `` (пробел перед ₽ зафиксирован коммитом cf00b17). Общего formatRub в services нет; `services/format.ts` содержит только formatBytes/formatDuration/sanitizeFileName. Числа в таблицах — класс `tabular-nums`.

### Навигация (после d5b9697)
- Роутинга нет: enum `View` + `setView` (App.tsx:237), условный рендер секций в `<main>` App.tsx:2230-2267 (`view === View.ANALYTICS && <Analytics .../>`).
- `components/Header.tsx`: в шапке только «Сметы» (HISTORY) и «Расчёт дома» (HOUSE_CALCULATOR); боковое меню (строки 65-77): Сметы, Расчёт дома, Материалы (PRICES), Работы (WORKS), Комплекты (BUNDLES), **Аналитика (ANALYTICS)**, Раскрой (CUTTING), Wiki, Разделы смет (SECTIONS); мобильное «Ещё» (83-87).

### ui-примитивы `components/ui/` (все — ручная адаптация devignerui-рецептов, шапка-комментарий «Adapted from the devignerui ... recipe»)
- `tabs.tsx` — `Tabs<T extends string>` (generic, объявлен функцией, НЕ React.FC): `TabsProps { tabs: readonly TabItem<T>[]; active: T; onChange; disabled?; ariaLabel; className? }`, sliding-pill через motion layoutId.
- `badge.tsx` — `BadgeProps extends HTMLAttributes<HTMLSpanElement>`: `tone?`, `size?`, `icon?`, `count?`, `onRemove?` (крестик), `removeLabel?`.
- `date-range-picker.tsx` — `DateRangePickerProps { from?/to?: string (ISO, '' — не задано); onFromChange/onToChange; fromLabel?/toLabel?; className? }`.
- `island.tsx` — `IslandProps` (открыт/закрыт + содержимое; шелл для SyncToast/UpdateBanner).
- `context-menu.tsx` (ContextMenuProps), `copy-button.tsx` (CopyButtonProps), `delete-button.tsx` (DeleteButtonProps), `file-upload.tsx` (FileDropzoneProps), `slider.tsx` (SliderProps), `switch.tsx` (SwitchProps).
- **НЕТ** button/card/input/select/dialog/checkbox — нативные элементы со строковыми стилями; инпуты: `inputStyles`, `fieldLabelStyles` из `components/estimate-editor/shared.ts`; touch-таргеты `min-h-[44px] … md:min-h-9`.

## 7. EstimateEditor и Пояснение

- `components/estimate-editor/EstimateExplanation.tsx` — `EstimateExplanationProps { value: string; onChange: (value: string) => void }`; сворачиваемое поле: пилюля → textarea `#estimate-explanation-field`, PLACEHOLDER «Например: дом под ключ, тёплый контур, оптимальный или премиум», лимит 1200. Сюда просится статус «комплектация распознана/подтверждена».
- `components/estimate-editor/EstimateMetaFields.tsx` — `EstimateMetaFieldsProps { estimate; setEstimate }`; форма: Клиент, Дата (date), Статус (select), Тип строения (`buildingType`), Площадь м² (`area`, number), `EstimateLabelsPicker` (labelIds). **Поля region в форме нет** — регион задаётся только при AI-генерации (EstimateEditor.tsx:232 дефолт 'Московская область', применение 981/1039). Новый селектор комплектации/базы площади логичнее всего рядом.
- `houseActualBasis`-селектор: **EstimateEditor.tsx:1563** — `<select value={estimate.houseActualBasis || ''} onChange={... houseActualBasis: event.target.value as Estimate['houseActualBasis'] ...}>`; рядом статус дома (1558), дата подтверждения (1559), кнопки «Объект завершён» (1569) и «Подтвердить факт» (1570, disabled пока basis пуст или факт заполнен не полностью). Готовый паттерн «подтвердить данные» для R27.
- `components/estimateEditorSignature.ts:35-37` — `houseExecutionStatus`/`houseActualBasis`/`houseActualVerifiedAt` входят в signature-hash. **Новое поле сметы обязано попасть в этот hash**, иначе редактор не увидит dirty-состояние.
- Прочие подкомпоненты `components/estimate-editor/`: EditorActionButton, EditorSectionIcon, EstimateEditorHeader, EstimateTemplateRow, EstimateToolbar, StatusBadge, shared.ts, sectionReorderGesture.ts (+test), useSectionReorder.ts. Сам EstimateEditor.tsx ~2300 строк — монолит (R32).

## 8. Словарь и ADR

- `CONTEXT.md` (38 строк) — глоссарий: **Смета**, **Раздел** (избегать «категория»/«секция» — в Analytics.tsx и UI слово «категория» уже гуляет), **Позиция**, **Метка** (пример «Типовые проекты»; избегать «тег»), **Шаблон**, **Раскрой**, **Версия сметы**, **Токен темы** (primary #DC2626). Слов «комплектация», «база площади», «типовой проект» в CONTEXT.md нет — глоссарий при сборке стоит дополнить.
- `docs/adr/`: `0001-manual-recipe-adaptation.md` (UI-рецепты копируются руками в components/ui, без CLI devignerui, components.json удалён); `0002-motion-animation-dependency.md` (одна анимационная зависимость motion, импорты motion/react); `0003-ai-generation-seam-estimate-context.md` (шов App→редактор через счётчик aiGenerationRequest, не DOM-click); `0004-island-shell-legacy-toast-state.md` (общий шелл ui/island.tsx); `0005-lazy-command-palette-duplicated-hotkey.md` (CommandPalette — React.lazy-чанк); `0006-daterangepicker-history-analytics-custom-period.md` (пресеты + «Произвольный период» в Analytics, ISO-контракт `''` = не задано, ключ kmobn:analytics:filters:v1 не менять).
- ADR про офлайн-ядро/изоляцию домена нет — правила только в AGENTS.md и PROGRESS.md («Договорились»: outbox-first, tombstones обязательное).

## 9. Форматирование денег/чисел

- `formatRub` — локально в Analytics.tsx:89 (см. п.6); для нового блока либо переиспользовать/поднять его, либо повторить паттерн. Формат: `Math.round` + `toLocaleString('ru-RU')` + ` ₽`. Прокатка цифр с пробелом перед ₽ — токен `ROLLING_NUMERIC_TOKEN` (коммит cf00b17, без конечного пробела). Табличные числа — Tailwind-класс `tabular-nums`.

## 10. Тесты

- Vitest colocated: `services/*.test.ts` рядом с исходником; приёмка `npm run check` (typecheck + lint + vitest, 408 тестов / 58 файлов); один файл: `npx vitest run services/xxx.test.ts`.
- Структура: `import { describe, expect, it } from 'vitest'`; фабрики-фикстуры (`const item = (overrides: Partial<EstimateItem> = {}): EstimateItem => ({...})` — houseCalculator.test.ts:20).
- Готовые файлы по теме: `services/houseCalculator.test.ts` (импортирует parseHouseDescription, selectHouseHistoryForAi, selectEligibleHouseHistory, chooseHouseReference, calculateHouseVariants, ROOF_AREA_PITCH_FACTOR...), `services/estimateLabels.test.ts`, `services/houseCalculationSnapshot.test.ts`, `services/houseGeometry.test.ts`, `services/houseScope.test.ts`, БД/синк: `database.test.ts`, `database.offline.test.ts`, `offlineQueue.test.ts`, `offlineQueue.migration.test.ts`, `offlineSync.test.ts`, `offlineReliability.test.ts`. **Тестов на components/Analytics.tsx нет** (нет и компонентной vitest-инфраструктуры — см. PROGRESS «Не доделано»).
- SQL: `supabase/tests/*.sql`; E2E: `e2e/offline-electron.spec.ts` + `e2e/mockSupabaseServer.ts` (гонять только при изменении desktop-интеграции).

## 11. Стилистика

- Отступы: старые/крупные файлы — 4 пробела (types.ts, App.tsx, Analytics.tsx, EstimateEditor.tsx, houseCalculator.ts, ui/*.tsx); часть новых сервисов — 2 пробела (estimateLabels.ts, estimateIntelligence.ts, tailwind.config.js). Следовать стилю конкретного файла, не переформатировать.
- Компоненты — `React.FC<Props>` + отдельный `interface XxxProps`; исключение — generic `Tabs<T>` (объявлен функцией, с комментарием почему).
- ui-компоненты после devignerui-апгрейда: комментарий «Adapted from the devignerui "..." recipe for this project's dark theme (tokens: ...)», экспортируемый props-интерфейс с TSDoc, токены `text-text-primary`, `text-text-secondary`, `border-border`, `bg-surface`, `bg-background`, `primary #DC2626`.
- Tailwind-кастомы `tailwind.config.js`: `max-w-8xl` = 93.75rem (1500px) — единственный ограничитель контента; экран `3xl` = 1920px.

## 12. Опасные места

- **R42**: ключ `itemsMap` в Analytics — `${name}___${unit}` — НЕ БАГ, не трогать (PROGRESS.md, «Договорились»).
- `runtimeCaching: []` в vite.config.ts пуст **намеренно** — SW не должен переигрывать устаревшие строки Supabase.
- `xlsx` pinned на CDN-тарбол в package.json — не заменять на npm-версию.
- `roofFactor` (houseCalculator.ts:304, карта по форме крыши) ≠ `ROOF_AREA_PITCH_FACTOR = 1.15` (35, площадь кровли) — не смешивать.
- Новое поле Estimate: (а) добавить в `estimateEditorSignature.ts`, иначе dirty не сработает; (б) не задеть ветку 'estimates' в `saveLocalRecords` (database.ts:546-548, нормализация labelIds); (в) миграция Supabase не нужна (payload jsonb), но офлайн-клиенты старых версий будут молча терять поле при апсейте из старой сборки.
- `estimate_sections` — single-document flow (id = userId) со своими RPC/конфликтами; не применять к нему построчную логику.
- `'custom'` в PeriodPreset обязан учитываться каждым потребителем типа (ADR 0006); ключ `kmobn:analytics:filters:v1` и контракт `'' = не задано` не менять.
- Терминология CONTEXT.md: «Раздел», не «категория»; «Метка», не «тег». R12: кодовый `rough-finish` = «Подготовка под чистовую», «чистовая отделка» пользователя = `turnkey` — карточки именовать фактическими названиями.
- У сметы `area` может быть 0/NaN, `total` = 0, `houseCalculationSnapshots` отсутствовать — все выборки с явными Number.isFinite-фильтрами (прецедент: selectHouseHistoryForAi).
- `parseHouseDescription` не знает отрицаний («без отделки») и_multi-match — для R10 нужна обёртка, не правка самой функции (её используют калькулятор и тесты).
- `max-w-8xl` — единственный ограничитель; локальные `max-w` внутри main не добавлять. console.error/warn в проде остаются.
- Не логировать `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` и пользовательские данные.
