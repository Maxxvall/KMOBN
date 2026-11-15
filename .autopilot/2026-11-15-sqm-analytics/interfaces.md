# Границы, решённые в спецификации

## Стек и команды

- React 19 + TypeScript strict, Vite, Tailwind 3; код плоско в корне, папки `src/` нет. Vitest, colocated `*.test.ts`.
- Установка: `npm install`. Одна приёмка: `npm run check` (typecheck + lint 0/0 + vitest). Один файл: `npx vitest run services/sqmAnalytics.test.ts`.
- Новые зависимости НЕ добавлять — всё нужное уже стоит (motion/react, @devigner-ui/icons, react-window, recharts).
- Не трогать: `components/estimate-editor/*` (кроме ничего — редактор вне рамок), `services/offlineSync.ts`/`offlineQueue.ts`/`indexedDbCache.ts`, ключ `itemsMap` (`${name}___${unit}`) в Analytics, `runtimeCaching` в vite.config.ts, pin `xlsx` в package.json, `kmobn:analytics:filters:v1`.

## Границы

### types.ts (владеет доменными типами)
- Добавляет: `HousePackageId = 'box' | 'warm-shell' | 'rough-finish' | 'turnkey' | 'turnkey-engineering'` (инлайн-юнион, стиль `HouseCalculationSnapshot.input.package` — без цикла импортов), `EstimateSqmAreaBase = 'house' | 'house-with-additions'`, поля `Estimate.sqmPackage?: HousePackageId`, `Estimate.sqmAreaBase?: EstimateSqmAreaBase`, `Estimate.sqmConfirmedAt?: string`.
- Открывает: типы. Скрывает: ничего. 4 пробела, существующий стиль.

### services/houseCalculator.ts (владеет справочником ключевых слов комплектации)
- Добавляет экспорт `HOUSE_PACKAGE_MATCHERS` — массив матчеров «пакет → проверка нормализованного текста», единый источник ключевых слов. `parseHouseDescription` переводится на этот массив, поведение не меняется (существующие тесты зелёные — контракт не трогать).
- Открывает: матчеры. Скрывает: нормализацию, приоритет тиров. 4 пробела.

### services/sqmAnalytics.ts (новый, владеет доменом «цена м² по комплектациям»)
- Экспортирует: `detectSqmObjectType(buildingType: string): SqmObjectType` (`'houses' | 'baths' | 'utility' | 'other'`); `classifySqmCompletion(estimate: Estimate): SqmCompletionState` (`{ state: 'confirmed' | 'explicit' | 'hint' | 'ambiguous' | 'none'; package?: HousePackageId; candidates?: HousePackageId[]; reason?: string }`); `buildSqmAnalytics(estimates: Estimate[], filters: SqmFilters): SqmAnalyticsResult`; типы `SqmFilters`, `SqmObjectType`, `SqmAnalyticsResult`, `SqmGroupStats`, `SqmProjectEntry`, `SqmNeedsCheckEntry`, `SqmFieldPatch`.
- Скрывает: медиану/среднее/склонения, правила отрицаний, группировку по базе площади, сборку регионов.
- Зависит от: `types.ts`, `estimateLabels.isTypicalProject`, `houseCalculator.HOUSE_PACKAGE_MATCHERS`, `estimateActuals.calculateActualItemTotal`. Не зависит от компонентов. 2 пробела (новый сервис).
- Семантика `sqmPackage`: пишется ТОЛЬКО явным действием пользователя; `buildSqmAnalytics` никогда не модифицирует входные сметы (чистая функция).

### components/analytics/SqmByPackageSection.tsx (новый, владеет UI блока)
- Props: `SqmByPackageSectionProps { estimates: Estimate[]; onUpdateSqmFields: (id: string, patch: SqmFieldPatch) => void; onOpenEstimate?: (id: string) => void; periodLabel?: string }`.
- Вся логика — вызовы `services/sqmAnalytics.ts`; внутри только состояние фильтров и раскрытых панелей. Никаких прямых обращений к Supabase/offline-очереди.
- Стиль: `React.FC`, токены темы (`text-text-primary`, `border-border`, `bg-surface`, primary #DC2626), `ui/badge`, `inputStyles`/`fieldLabelStyles` из `estimate-editor/shared.ts`, тач-таргеты `min-h-[44px] md:min-h-9`, сетка карточек `grid` (1 колонка → 5 на больших экранах). Без новых `max-w` внутри main. 2 пробела.

### components/Analytics.tsx (точка монтажа — минимальная правка)
- В режиме `overview` монтирует `<SqmByPackageSection>` после KPI-строки; передаёт `estimates`, `onUpdateSqmFields`, `onOpenEstimate`. Никакой другой логики; `itemsMap` (`${name}___${unit}`), `costPerSqmData`, существующие секции — не трогать. 4 пробела.

### App.tsx (шов сохранения и навигации — минимальная правка)
- `onUpdateSqmFields(id, patch)` → существующий путь обновления/сохранения смет (`hooks/useEstimateCrud.ts` → `saveEstimates`, outbox-first); патч содержит ТОЛЬКО `sqmPackage`/`sqmAreaBase`/`sqmConfirmedAt`.
- `onOpenEstimate(id)` → открыть редактор существующим механизмом переключения view (по образцу уже имеющихся переходов App→редактор).
- Аналитика не сохраняет сама — сохранение всегда через App.

### services/clientEstimate.ts
- `sqmPackage`, `sqmAreaBase`, `sqmConfirmedAt` → в `InternalEstimateField` (служебные данные бригады, в клиентские экспорты не уходят).

### components/estimateEditorSignature.ts
- Новые поля → в signature-hash (иначе dirty-детект редактора не увидит изменения).

### components/estimate-editor/* — НЕ ТРОГАТЬ (Договорились: редактор без перестройки).

### Тест-швы
- `services/sqmAnalytics.test.ts` — чистые функции (фабрики-фикстуры по образцу `houseCalculator.test.ts`); тесты согласованности матчеров с `parseHouseDescription`. Компонентных тестов нет (нет инфраструктуры — PROGRESS «Не доделано»).

## Построенное тасками (фактические интерфейсы)

### T01 (коммит после приёмки 468/468)
- `types.ts`: `HousePackageId`, `EstimateSqmAreaBase`, `Estimate.sqmPackage?/sqmAreaBase?/sqmConfirmedAt?`.
- `services/houseCalculator.ts`: экспорт `HOUSE_PACKAGE_MATCHERS: readonly HousePackageMatcher[]` (`{ package: HousePackageId; test(text): boolean }`); `parseHouseDescription` работает через матчеры, поведение прежнее (43 старых теста зелёные).
- `services/sqmAnalytics.ts` (новый, экспортирует): `detectSqmObjectType(buildingType): 'houses'|'baths'|'utility'|'other'`; `classifySqmCompletion(estimate): { state: 'confirmed'|'explicit'|'hint'|'ambiguous'|'none'; package?; candidates?; reason? }`; `resolveSqmAreaBase(estimate): EstimateSqmAreaBase | undefined`; `buildSqmAnalytics(estimates, filters): { groups: Record<HousePackageId, SqmGroupStats>; needsCheck: SqmNeedsCheckEntry[]; regions: string[] }`; `createSqmFieldPatch({package?, areaBase?, confirmedAt?}): SqmFieldPatch`; `formatSqmProjectCount(count): string`; константы `SQM_PACKAGE_ORDER`, `SQM_PACKAGE_LABELS`, `SQM_AREA_BASE_LABELS`, `NEEDS_CHECK_REASON_LABELS`; типы `SqmFilters`, `SqmObjectType`, `SqmCompletionState`, `SqmGroupStats`, `SqmBaseGroupStats`, `SqmProjectEntry`, `SqmNeedsCheckEntry`, `SqmFieldPatch`, `SqmMetricStats`.
- `components/analytics/SqmByPackageSection.tsx`: `SqmByPackageSectionProps { estimates; onUpdateSqmFields(id, patch); onOpenEstimate?; periodLabel? }`.
- `components/Analytics.tsx`: `AnalyticsProps += onUpdateSqmFields (обязательный), onOpenEstimate?` (после финальной приёмки необходимость обязательности пересмотрена: см. «Построенное» — prop сделан обязательным, App его передаёт).
- Семантика фильтров: `region: undefined` = все регионы, `region: null` = «Без региона»; себестоимость требует `houseActualBasis='cost'` И `houseExecutionStatus='actual-verified'` И `actual.source='verified'` на позициях; любой ручной выбор комплектации («подтвердить» или «исправить») пишет `sqmConfirmedAt`.

## Проектные правила (перенос из PROGRESS.md «Договорились», слово в слово)

- Пользовательский AGENTS.md — главный источник проверок; платежи не возвращаем; «Типовые проекты» постоянна; офлайн-ядро (outbox-first, tombstones) обязательное.
- Иконки действий нейтральные, удаление красное; «Сохранить»/ИТОГО красные.
- Монолиты и @ts-nocheck — отдельный прогон (R32/R33); Prices↔Works, общий Modal — там же.
- Кровля: карта roofFactor по форме крыши остаётся отдельной от ROOF_AREA_PITCH_FACTOR=1.15; AI и визард = 1.15 — намеренно.
- R42 Analytics-ключ — НЕ БАГ (itemsMap `${name}___${unit}`) — не трогать.
- console.error/warn в проде остаются; удаляются только log/info/debug.
- max-w-8xl (1500px) — единственный ограничитель контента; локальные max-w внутри main не добавлять.
- Редактор смет — без перестройки принятого редизайна fa9ad3c.
- Delivery UI-рецептов — ручная адаптация под Tailwind 3 и тёмную тему (без CLI devignerui и без components.json — удалён).
- Клик по названию метки не переключает выбор (только чекбокс и ×) — следствие removable-чипов, принято.
- ADR 0006: ключ `kmobn:analytics:filters:v1` и контракт `'' = не задано` не менять; `'custom'` в PeriodPreset учитывается каждым потребителем.
- ADR 0001: ui-компоненты — ручная адаптация рецептов, шапка-комментарий «Adapted from the devignerui …».
- ADR 0002: анимации — только `motion/react`.
- Терминология CONTEXT.md: «Раздел», не «категория»; «Метка», не «тег»; дополнить словарь словами «комплектация», «база площади».
- Стилистика: старые файлы 4 пробела, новые 2; компоненты `React.FC<Props>`; `xlsx` — CDN-тарбол, не менять; `runtimeCaching: []` пуст намеренно.
- ENV-значения не логировать; пользовательские данные (клиенты, цены) в логи не писать.
