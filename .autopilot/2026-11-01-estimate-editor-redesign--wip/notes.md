# Notes: разведка кода KMSmeta (karkas-master)

Стек: React 19 + Vite 6 + Tailwind 3 (тёмная тема, токены в `tailwind.config.js`: background `#111827`, surface `#1F2937`, primary `#DC2626`, primary-hover `#B91C1C`, border `#374151`, text-primary `#F9FAFB`, text-secondary `#9CA3AF`). Web и Electron — один React-компонент (`electron/main.ts` грузит тот же `dist/index.html`).

## Верхняя область редактора сметы — `components/EstimateEditor.tsx` (2401 строка)

Карта (номера строк точные):
- обёртка: 1361 (`rounded-xl border border-border/70 bg-surface p-2 sm:p-4 md:p-5`)
- шапка: 1362–1365 — заголовок `Редактирование сметы №{estimate.estimateNumber}` / `Создание новой сметы` (1363), кнопка «← Назад к истории» (1364)
- баннеры (архив/валидация/AI): 1367–1407 — не трогаем
- поля: 1409–1432 — сетка `grid-cols-6 xl:grid-cols-[minmax(220px,1.5fr)_150px_170px_minmax(220px,1fr)_110px]`: Клиент 1410–1413, Дата (`<input type="date">`) 1414–1417, Статус (`<select>` из `Object.values(EstimateStatus)`) 1418–1423, Тип строения 1424–1427, Площадь 1428–1431
- «Пояснение для расчёта дома»: 1434–1447 — textarea `rows={2}`, `maxLength={ESTIMATE_EXPLANATION_MAX_LENGTH}`, подпись «Внутреннее поле — не выводится в документах» (1437)
- ряд «Шаблон генерации»: 1449–1500 — select шаблона 1453–1455, кнопка удаления ✖ 1456–1464 (`onDeleteTemplateAction`, aria-label «Удалить выбранный шаблон»), красная «По шаблону» 1468–1470 (`handleGenerate`), «AI» 1471–1491 (проверки hasOpenRouterKey/buildingType/area → `setAiGenModalOpen(true)`), «🤖 AI-анализ» 1492–1498 (`handleAnalyzeEstimate`)
- нижняя панель: 1502–1589 — три группы в `xl:grid-cols-[minmax(240px,auto)_minmax(330px,1fr)_minmax(480px,auto)]`:
  - группа 1: 1503–1511 — `v{estimate.version} · дата` (1504), «Сравнить» 1506 (при `getPreviousVersion()`, → `setShowComparison(true)`), «В шаблон» 1509 (при `initialEstimateValue`, → `onSaveAsTemplateAction`)
  - группа 2: 1512–1577 — «Комплекты» 1513–1518 (`setBundlePickerOpen(true)`); сегмент «Доска | СС | ЕВ» 1519–1543 (метки СС/ЕВ захардкожены на 1527; групповой title 1523); select «+ Раздел...» 1544–1561 (`addCategory`); «Управлять разделами» 1562–1566 (`onManageSectionsAction`); toggle «Факт» 1568–1576 (`showActuals`, title 1573)
  - группа 3: 1578–1588 — итоги Р/М/Д 1580–1582 (`subgroupTotals.works/materials/delivery`), ИТОГО 1583 (`estimate.total`), «Сохранить» 1585–1587 (`handleSave`, красная bg-primary)
- состояние: 246–272 (`showComparison`, `bundlePickerOpen`, `boardSwitchTarget`, `showActuals`, `aiGenModalOpen`, …); `inputStyles` — 1346
- после 1589: `boardSwitchNotice` 1591–1595, панель «Факт» с 1597 — не трогаем

Сокращения: СС = сухостроганая, ЕВ = естественной влажности (`BoardMoisture` в `types.ts:243`; полные имена в `BoardMaterialSwitchModal.tsx` ~37–44 — взять формулировки оттуда). Р = работы, М = материалы, Д = доставка (`subgroupTotals`).

## История смет — `components/EstimateHistory.tsx` (760 строк)

- `EstimateHistory: React.FC<EstimateHistoryProps>` на 249; в App монтируется **без пропсов** (`App.tsx:48` lazy, рендер 2081–2084) — данные из `useOptionalEstimateContext()` (250–259), провайдер `App.tsx:2018`
- фильтры: state 261–277 (`filterClient`, `filterStatus`, `archiveView`, `filterBuildingType`, `filterAreaMin/Max`), `hasActiveFilters`/`activeFilterCount` 277–278, `resetFilters` 284–290
- отбор+сортировка: memo `filteredEstimates` 402–416, сортировка `new Date(b.date)` desc (415) — предикат периода вставляется сюда же
- UI фильтров: desktop 533–559 (клиент 536, статус 540–543, тип 547, площадь 550–551, «Сбросить» 554), мобильный (по `showFilters`) 561–589, тумблер 518–531
- список: desktop-таблица 592–656 (строки с 605, дата в ячейке 613–616, бейдж статуса 626–630), карточки мобильные 659–714 (бейдж 672–674, дата 677); empty state 650–655
- бейджи статусов: `statusColors` 24–28 — DRAFT: `border-amber-500/30 bg-amber-500/10 text-amber-200`; SENT: sky-500; APPROVED: emerald-500; рендер `<span className="inline-flex rounded-full px-2 py-1 text-xs font-medium …">`
- архив-табы «Текущие/Архив» 513–516

## Типы и данные

- `types.ts:143–170` — `Estimate`: `date: string` (148) в формате **yyyy-mm-dd** (создаётся как `new Date().toISOString().split('T')[0]`, `EstimateEditor.tsx:218`), `status: EstimateStatus` (149), `estimateNumber` (146), `total` (152), `buildingType` (154), `area` (155), `isArchived?` (153)
- `types.ts:172–176` — `enum EstimateStatus { DRAFT = 'Черновик', SENT = 'Отправлена', APPROVED = 'Согласована' }` — значения уже человекочитаемые, карта подписей не нужна
- утилит дат нет; форматирование инлайн `toLocaleDateString('ru-RU')`; сравнение дат строкой/через `new Date(...)` уже в коде

## Конвенции UI

- иконок нет: инлайн-SVG (3 в EstimateEditor 66–113, 7 в Header.tsx) + эмодзи (✖ 1463, 🤖 1497); тултипы — native `title` + `aria-label` (никакой библиотеки)
- инпуты — сырой Tailwind; паттерн тач-таргетов `min-h-[44px] … md:min-h-9`; рецепт инпута истории: `h-9/min-h-11 rounded-lg border border-border bg-background/60 px-3 text-sm focus:border-primary focus:ring-2 focus:ring-primary/30`
- модалки — порталы + react-focus-lock; общих Button/Select/Tooltip нет
- пакет `@devigner-ui/icons` (npm, v3.5.0): Solar+Iconsax, MIT/CC-BY-4.0, 0 deps, tree-shakeable ESM/CJS — пиновать точную версию; имена экспортов сверить с README пакета
- CLI devignerui: `npx devignerui add badge | delete-button | date-range-picker` (badge 4 варианта, delete-button 3, date-range-picker 3)

## Команды

- `npm run typecheck` — tsc noEmit (web + electron tsconfig)
- `npm run lint`, `npm run test` — по правилам AGENTS.md автозапуск запрещён; тесты только при изменении расчётов/сервисов (не наш случай)
- визуальная проверка — вручную пользователем
