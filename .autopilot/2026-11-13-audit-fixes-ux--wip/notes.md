# notes — карта кода для исполнителей

Репозиторий: `C:\Users\Administrator\Desktop\боты\KMSmeta` (продукт «Каркас Мастер», package name `karkas-master`, версия 1.9.1). Все координаты ниже проверены чтением/grep-ом 13.11.2026 по рабочему дереву (включая незакоммиченный WIP). НЕ запускать npm/vite/electron — по AGENTS.md проверка маленьких правок делается только чтением кода.

**Поправка оркестратора (проверено вручную):** разведчик ошибся в п. g — `services/pdfGenerator.ts` ЖИВ: динамический импорт `services/documentExport.ts:8` (`exportEstimatePdfPlain` → `await import('./pdfGenerator')`). Импортёров, кроме него и `pdfGenerator.test.ts`, нет. WIP в git — 7 файлов (включая electron/main.ts и electron/preload.ts).

## 1. Карта и конвенции

### Структура (проверено ls)
- Корень: `App.tsx` (2294 строки, корневой компонент + все роутинг/стейты), `index.tsx` (точка входа), `types.ts` (425 строк — доменные типы + enum EstimateCategory/View + normalizeKey).
- `components/` — экраны и модалки (указаны ниже); `components/estimate-editor/` — подпапка редактора сметы: `EstimateEditorHeader.tsx`, `EstimateMetaFields.tsx`, `EstimateExplanation.tsx`, `EstimateTemplateRow.tsx`, `EstimateToolbar.tsx`, `EditorActionButton.tsx`, `EditorSectionIcon.tsx`, `StatusBadge.tsx`, `useSectionReorder.ts` (+`sectionReorderGesture.ts`), `shared.ts` (рецепты классов, наружу из папки не экспортируются — см. комментарий в shared.ts:1-2).
- `components/ui/` — 3 файла: `badge.tsx`, `date-range-picker.tsx`, `delete-button.tsx`.
- `components/Wiki/` — вики-раздел (в vite.config.ts вынесен в отдельный chunk только для web).
- `services/` — ~70 файлов доменной логики, рядом колокализованные `*.test.ts` (vitest). Ключевые: `database.ts` (690), `dataTransfer.ts` (546), `estimateSections.ts` (507), `estimateLabels.ts` (67), `openRouterService.ts` (1784), `smartEstimateBuilder.ts` (415), `houseCalculator.ts` (622), `wikiDatabase.ts` (669), PDF-стек: `pdfGenerator.ts` (374, ЖИВ — plain-экспорт), `pdfGenerator2.ts` (27, алиас premiumPdf), `premiumPdf.ts` (751), `pdfContractGenerator.ts` (328), `cutting/exportPdf.ts` (236).
- `hooks/`: `useOfflineSync.ts`, `useDebouncedSave.ts`, `useEstimateCrud.ts`.
- `contexts/`: `CatalogContext.tsx`, `EstimateContext.tsx`, `EstimateSectionsContext.tsx`, `SubscriptionContext.tsx`, `SyncContext.tsx` (все «optional» хуки вида `useOptional*Context`).
- `electron/`: `main.ts` (339), `preload.ts` (27), `types.ts` (34 — публичный контракт `ElectronAPI`).
- `api/`: `ai-chat.ts` (+тест) — serverless-прокси.
- `e2e/`: `offline-electron.spec.ts`, `mockSupabaseServer.ts` (Playwright, excluded из vitest).
- Прочее: `supabase/` (миграции), `docs/` (планы), `.autopilot/` (планы сборок), `AGENTS.md` — правила работы.

### Конвенции кода
- **TS strict** (`tsconfig.json`: `"strict": true`, `noEmit`, target ES2022, alias `@/*` → корень, `allowImportingTsExtensions`). Отдельный проект `tsconfig.electron.json` для electron/.
- **ESLint** (`eslint.config.mjs`): `js.configs.recommended` + `tseslint.configs.recommended`; важные правила: `react-hooks/rules-of-hooks: error`, `exhaustive-deps: warn`, `no-unused-vars: warn` c `argsIgnorePattern: '^_'`; ОТКЛЮЧЕНЫ: `no-explicit-any`, `prefer-const`, `no-empty`, `ban-ts-comment`, `no-useless-escape`, `consistent-type-imports`. Отдельные globals для `api/**`, `electron/**` (node), `electron/preload.ts` (node+browser), `e2e/**`.
- **Отступы: 2 варианта в репо.** Старые/основные файлы (App.tsx, services/*.ts, EstimateEditor.tsx, EstimateLabelsPicker.tsx, Header.tsx) — **4 пробела**. Новые файлы (components/UpdateBanner.tsx, components/ProfileModal.tsx, electron/*.ts, components/ui/*) — **2 пробела**. При правке сохраняй стиль конкретного файла.
- Кавычки: одинарные почти везде (в EstimateEditor.tsx встречаются двойные в литералах — не трогать массово).
- Компоненты: именованные типы пропсов `interface XxxProps` + `const Xxx: React.FC<Props> = ({...}) => ...`; Header обёрнут в `React.memo` (Header.tsx:335). Иконки: два способа — импорт `Icon*` из `@devigner-ui/icons` (15+ файлов) и локальный inline-SVG `Icon` в Header.tsx:17-46.
- Тесты: `*.test.ts` рядом с сервисом, `import { describe, expect, it } from 'vitest'`; vitest конфига нет (в vite.config.ts секции test нет), запуск `vitest run --exclude "e2e/**"`. Тесты — чистая логика (node env); в database-тестах используется `fake-indexeddb`.
- Пример «как принято» (services/estimateLabels.ts:26-35): стрелочные экспорты, normalize-функции возвращают массив всегда, `slice(0, MAX_ESTIMATE_LABELS)`.

### Команды (package.json:6-23)
- `npm run test` — `vitest run --exclude "e2e/**"`.
- `npm run typecheck` — `tsc --noEmit && tsc -p tsconfig.electron.json --noEmit` (web + electron).
- `npm run lint` — eslint по фиксированному списку globs.
- `npm run check` — `typecheck && lint && test` (полный гейт перед сдачей).
- Сборки НЕ выполнять (AGENTS.md).

## 2. Точки правок

### a) Метки смет
**services/estimateLabels.ts (весь файл 67 строк):**
- `TYPICAL_PROJECT_LABEL_ID = 'system:typical-projects'` (стр. 3), `MAX_ESTIMATE_LABELS = 2` (стр. 4), `MAX_ESTIMATE_LABEL_NAME_LENGTH = 64` (стр. 5).
- `const isLabelId = (value: unknown): value is string` (стр. 9-10) — не экспортируется; допускает `system:typical-projects` или UUID-regex.
- `normalizeEstimateLabelName(value: string): string` (стр. 11) — trim + collapse `\s+`.
- `normalizeEstimateLabelDefinitions(value: unknown): EstimateLabelDefinition[]` (стр. 14-24) — всегда массив, первым элементом системная метка.
- `normalizeEstimateLabelIds(value: unknown): string[]` (стр. 26-27) — уникальные валидные id, срез до MAX.
- `getActiveEstimateLabels(document?)` (стр. 28-30) — без `deleted`.
- `getEffectiveEstimateLabelIds(estimate: LabelAssignment, document?)` (стр. 31-35) — пересечение labelIds сметы с активными метками документа.
- `getActiveEstimateLabelFilterIds` (36-39), `matchesEstimateLabels(...)` (40-44), `isTypicalProject(estimate)` (45), `validateEstimateLabelName(document, value, exceptId?)` (47-53, бросает Error с русскими сообщениями), `mergeImportedEstimateLabels(existing, incoming)` (56-66) — существующие каноничны, импорт добавляет только новые id.

**App.tsx:**
- Стейт: стр. 295-297 `sectionsDocument`/`sectionsLoading`/`sectionsError`; стр. 295: `useState<EstimateSectionsDocument>(() => createEstimateSectionsDocument('local'))`.
- Загрузка: эффект стр. 375-396 — без юзера сброс в `createEstimateSectionsDocument('local')`; с юзером `setSectionsLoading(true)`, `loadEstimateSections().then(documents => setSectionsDocument(normalizeEstimateSectionsDocument(documents[0], supabaseUser.id)))` (384-386), catch ставит `sectionsError('Не удалось загрузить пользовательские разделы. Встроенные разделы доступны.')` (391); deps `[supabaseUser, offlineSync.workspaceVersion]`.
- Обработчик кеш-апдейта: `handleCacheUpdate` (337-373), ветка меток/разделов 354-358: `if (detail.key === 'estimate_sections') { const loaded = detail.data[0]; if (supabaseUser && loaded?.id === supabaseUser.id) setSectionsDocument(normalizeEstimateSectionsDocument(loaded, supabaseUser.id)); return; }`. Событие `kmobn:cache-update` подписывается на 398-408.
- `persistSectionsDocument` стр. 1884-1901: `sectionsSaving` (1884), `sectionsOwnerRef` (1885-1886), `useCallback(async (next) => { setSectionsError(null); setSectionsSaving(true); try { await saveEstimateSections(next); if (sectionsOwnerRef.current === next.id) setSectionsDocument(next); } catch ... finally setSectionsSaving(false); }, [])`.
- Контекст для UI: `sectionsContextValue` 1903-1920 (`addLabel/renameLabel/deleteLabel/resolveConflict(...)`), провайдер `<EstimateSectionsProvider>` на 2034.

**components/EstimateEditor.tsx (2340 строк):**
- Интерфейс пропсов `interface EstimateEditorProps` стр. 46-66: `initialEstimate, templates, materials, works, bundles, onRequestSave?, onDraftChange, onDirtyChange, onSaveAsTemplate, onDeleteTemplate, onBack, onManageSections, allEstimates, validationResult, aiAccess`.
- Деструктуризация стр. 185.
- Метки берутся из контекста, НЕ из пропсов: 224-226 `const sectionsDocument = sectionsContext?.document; const sectionsDocumentRef = useRef(sectionsDocument); sectionsDocumentRef.current = sectionsDocument;`
- Инлайн-хук `useIsDesktopViewport` 111-123: matchMedia `(min-width: 768px)`; вызов на 391.
- `handleSave` 1340-1370: проверка `estimate.client` (1341-1344), формирование `finalEstimate` с `labelIds: getEffectiveEstimateLabelIds(estimate, sectionsDocument)`, `setEstimate(finalEstimate)`, `onRequestSaveAction?.(finalEstimate)`; стр. 198: `const onRequestSaveAction = onRequestSave ?? estimateContext?.actions.onRequestSave;`

**services/database.ts — `saveLocalRecords` (522-557):**
- `export const saveLocalRecords = async <T extends { id: string }>(table: CacheTableKey, records: T[]): Promise<void>`.
- Защита label-операций 535-548: для `estimate_sections` метки мержатся с предыдущим кешем — «Omission is a legacy save, never a deletion. Tombstones are irreversible.»; для `estimates` — нормализация `labelIds` (546-548). 528-530: запрет сохранять справочник чужого аккаунта.
- Вызов сохранения разделов: `saveEstimateSections` на 688 через `prepareEstimateSectionsDocumentForSave`.

UI меток: `components/EstimateLabelsPicker.tsx` — пропсы `{ selectedIds, onChange, maxSelected?, withoutLabels?, onWithoutLabelsChange? }` (5-11), чипы в EstimateHistory через `renderLabels` (EstimateHistory.tsx:271-274).

### b) Импорт/экспорт — services/dataTransfer.ts
- Импорты меток, стр. 1: `getActiveEstimateLabels, getEffectiveEstimateLabelIds, mergeImportedEstimateLabels, normalizeEstimateLabelIds` из './estimateLabels'.
- `hasEstimateChanged(existing, incoming)` 293-309; сравнение меток — первая строка (294): `JSON.stringify(normalizeEstimateLabelIds(existing.labelIds).sort()) !== JSON.stringify(normalizeEstimateLabelIds(incoming.labelIds).sort())`.
- Маппинг смет 396-409: `mergeImportedEstimate(e, existingEstimateByNumberVersion.get(key))` → `{ ...merged, labelIds: getEffectiveEstimateLabelIds(e, labelsDocument), labelSnapshots: undefined, id: mappedId, ... }`.
- Слияние определений меток: 351-352: `labelsDocument = { labels: mergeImportedEstimateLabels(existingSections?.labels, importedLabels) }`.
- `SCHEMA_VERSION = 3` (30), формат переноса одной сметы `kmobn-estimate` v2 (31-33).
- Тесты dataTransfer.test.ts по меткам: 108 (чужой аккаунт), 115-140 (дубли имён definitions/snapshots), 141-161 (дубликат канонического имени — частичный импорт запрещён), 163-181 (легаси-draft сохраняет метки; `labelIds → ['system:typical-projects']`), 183-197 (restores estimates-only label definitions, tombstones). Явный `labelIds: []` кейсы: 131, 145, 153, 174-177, 185-190.

### c) Конфликт меток/разделов
**services/estimateSections.ts:**
- `tryMergeEstimateSectionsDocuments(local, remote)` 386-449; меточная часть 392-409: base/local/remote Map'ы с легаси-фолбэком «Legacy clients may omit labels; only explicit tombstones remove them» (394-396), трёхсторонний цикл (398-407) — при двустороннем изменении с разными результатами `return null`; проверка дубликатов имён активных меток (408-409) тоже `return null`.
- `resolveEstimateSectionsConflict(document, choice: 'local'|'remote')` 330-347, метки на 340: `labels: normalizeEstimateLabelDefinitions([...(selected.labels ?? []), ...[...(local.labels ?? []), ...(remote.labels ?? [])].filter(label => label.deleted)])` (выбранный вариант + все надгробия с обеих сторон).
- `normalizeSectionName` 38-42 (trim, collapse, `toLocaleLowerCase('ru-RU')`, ё→е).

**components/EstimateSectionsSettings.tsx (286 строк) — диалог конфликта 180-192:**
- Блок `document.syncConflict && (<div role="alert" ...>)`: заголовок «Разделы или метки изменены на другом устройстве» (182), сетка 2 колонки `(['local','remote'] as const).map(...)` с подписями «На этом устройстве» / «На другом устройстве» · метки, пометка `label.deleted ? ' · удалена' : ''` (185); кнопки 188-189: «Оставить этот вариант» → `resolveConflict('local')`, «Принять вариант с другого устройства» → `resolveConflict('remote')`.
- Сообщение в App.tsx:2027-2029: «Конфликт разделов: откройте «Разделы смет» и выберите вариант.»

### d) Баннер обновлений — НЕЗАКОММИЧЕННЫЙ WIP (как есть в рабочем дереве)
`git status` (проверено оркестратором): модифицированы **App.tsx, components/ProfileModal.tsx, components/UpdateBanner.tsx, electron/main.ts, electron/preload.ts, electron/types.ts**; новый файл **services/format.ts**. Суть WIP (по diff): тип `UpdateDownloadProgress` вынесен в electron/types.ts, флаг `appUpdateDownloading` + передача `downloading/progress` в баннер, прогресс-бар в баннере, **удалён** `cancelUpdate` (из ElectronAPI, preload, main.ts и кнопки «Отменить загрузку» в ProfileModal), `formatBytes` вынесен из ProfileModal в services/format.ts.
- **App.tsx:** импорт типа стр. 5; стейты 310-313; эффект подписки 787-820: `handleUpdateAvailable` (790-793), `handleDownloadProgress` (794-797, `setAppUpdateDownloading(true)`), `handleUpdateDownloaded` (798-803), `handleUpdateNotAvailable` (804-809), `handleError` (810-813); подписки 815-819.
- Рендер баннера 2070-2086 (внутри `{appUpdateInfo && (...)}`); `onDismiss` сейчас сбрасывает `setAppUpdateDownloading(false)`.
- **components/UpdateBanner.tsx (94 строки, 2-пробельные отступы):** пропсы 5-13; `percent` клампится (17); три текстовых состояния (31-37); прогрессбар с aria, процент, скорость `{formatBytes(progress.bytesPerSecond)}/с` (38-60); кнопки: «Установить» (63-69) / «Скачать» при !isDownloading (70-79) / крестик (80-88).
- **components/ProfileModal.tsx (251 строка):** пропсы 11-22; обновления — блок 228-236 при `window.electronAPI?.isElectron`; кнопка скачивания стр. 233: `{!updateProgress && !updateDownloadedVersion && updateAvailableVersion && <button onClick={() => window.electronAPI?.downloadUpdate?.()}>Скачать обновление</button>}`; установка 232; `handleCheckUpdates` (122-133); `formatDuration` 26-30 (часы/минуты, без склонений). В интерфейсе 11-22 объявлены materials/works/bundles, но в деструктуризации (32-40) их нет — неиспользуемые пропсы (вне рамок этого тикета, не трогать).
- **electron/types.ts (34 строки):** `UpdateDownloadProgress` (1-6); `ElectronAPI` (8-27). В WIP удалён `cancelUpdate`.
- **electron/preload.ts (27 строк):** `downloadUpdate: () => ipcRenderer.invoke('download-update')` (14), `installUpdate` (15), подписки `update-download-progress` и др. (20-24).
- **electron/main.ts (339 строк):** `LOG_FILE = path.join(app.getPath('userData'), 'app.log')` (28); функция логирования 31-35: `function log(...args) { const msg = `[${new Date().toISOString()}] ${args.join(' ')}\n`; console.log(...args); try { fs.appendFileSync(LOG_FILE, msg); } catch {} }` — appendFileSync на 34, вызывается из ~25 мест (жизненный цикл окна, auth-callback, автоапдейт, ошибки рендера). Автоапдейт `initAutoUpdater` 85-133 (`autoDownload = false`, события → `mainWindow.webContents.send`); IPC 307-335: `check-for-updates` (307), `download-update` (318, fire-and-forget), `install-update` (327, `quitAndInstall()`), `get-app-version` (333).
- **services/format.ts (новый, 9 строк):** `formatBytes` — Б/КБ/МБ. Импортируют UpdateBanner.tsx:3 и ProfileModal.tsx:8.
- **Кто вызывает downloadUpdate:** App.tsx:2078 (баннер) и ProfileModal.tsx:233.

### e) Кровля
**services/houseCalculator.ts (622 строки):**
- Тип: `export type RoofShape = 'single-slope' | 'gable' | 'hip' | 'flat' | 'mansard';` (стр. 26). UI-подписи в components/HouseCalculator.tsx:34-38 (Односкатная/Двускатная/Вальмовая/Плоская/Мансардная), стейт `roofShape` (98).
- Карта `const roofFactor: Record<RoofShape, number>` 293-299: `single-slope: 0.95, gable: 1, hip: 1.15, flat: 0.9, mansard: 1.25`; применяется в `scaleReferenceItems` 384: `if (kind === 'roof') factor *= roofFactor[input.roofShape];` — СЕМАНТИКА: коррекция реальных количеств из смет-референсов по форме крыши, НЕ оценка площади.
- `isFrameHouse(estimate)` 150-162: исключения по buildingType (баня/террас/пристрой/пост охраны/крыша/изолятор/обшив), требует «дом/коттедж», исключает кирпич/газобетон/пеноблок/брус/бревно по items; используется в `selectEligibleHouseHistory` (184-186).
- Fallback-пул 536-538 в `calculateHouseEstimate` (524-615): `const eligible = selectEligibleHouseHistory(input.estimates, input.now); const broaderTypical = eligible.length ? [] : selectHouseHistoryForAi(input.estimates); const history = eligible.length ? eligible : broaderTypical;`
- Предупреждение 558-560: `if (!eligible.length && broaderTypical.length) { warnings.push('Тип объекта не распознан автоматически: использована ближайший типовой проект.'); }` (опечатка как есть).

**services/smartEstimateBuilder.ts (415 строк):**
- 1.15 — 232-245: ветки `if (params.roof === 'Металлочерепица') { const roofArea = area * 1.15; ... }` и `else if (params.roof === 'Мягкая кровля') { ... area * 1.15 ... }` (для «Шифер» кровельных позиций нет). СЕМАНТИКА: roofArea — оценка площади кровли с единицы пятна (pitch-фактор).
- `ROOF_OPTIONS = ['Металлочерепица', 'Мягкая кровля', 'Шифер']` (54-58) — это МАТЕРИАЛ кровли, не форма; `WIZARD_OPTIONS` (79-86), `buildSmartEstimate(...)` (408).
- Визард ЗНАЕТ материал кровли: `SmartWizardParams.roof: string` (types.ts:401); форму крыши визард НЕ знает.
- **В AI-генерацию (openRouterService) тип кровли НЕ передаётся** — только `buildingType` (1045, 1249, 1314, 1348).

**services/openRouterService.ts (1784 строки) — места с 1.3:**
- 196 — КОД: порог аномалии упаковок (`suggestedFromArea * 1.3`) — К УНИФИКАЦИИ НЕ ОТНОСИТСЯ, не трогать.
- 996-998 — КОД: `const estimateRoofArea = (floorArea: number, pitchFactor = 1.3): number => Math.ceil(floorArea * pitchFactor);` — вызывается из `getCoverageArea` (1003-1013) для `EstimateCategory.ROOF`. СЕМАНТИКА: pitch-фактор площади.
- 502 — ТЕКСТ ПРОМПТА: `- coverage_area: СТЕНЫ = периметр×2.8, КРОВЛЯ = площадь×1.3, остальное = площадь проекта`.
- 1063 — ТЕКСТ ПРОМПТА: `...для кровли — площадь крыши (площадь × 1.3).`
- 1249 — stage1Prompt: `...Для стен — площадь стен = периметр × 2.8м. Для кровли — площадь × 1.3.`
- 1314 — stage2Prompt: `...для кровли = площадь × 1.3`.

**Вывод для R11 (оркестратор):** «1.3» в AI и «1.15» в визарде — ОДНА семантика (pitch-фактор площади кровли) → унифицировать ОДНОЙ константой 1.15. Карта roofFactor в houseCalculator — ДРУГАЯ семантика (коррекция референсов по форме) → не трогать, задокументировать.

### f) Нормализация текста
- **types.ts:328**: `export const normalizeKey = (s: unknown): string => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');` — ё→е НЕТ (key для дедупликации каталога, findDuplicates types.ts:374-394).
- 8 мест с `.replace(/ё/g,'е')` и их отличия:
  1. `services/aiProjectSpec.ts:29` — `normalizeKey(...).replace(/ё/g, 'е')` — если normalizeKey получит ё→е, этот .replace станет избыточным.
  2. `services/estimateSections.ts:38-42` — normalizeSectionName: trim → collapse → `toLocaleLowerCase('ru-RU')` → ё→е.
  3. `services/houseCalculator.ts:136-140` — `toLocaleLowerCase('ru-RU')` → ё→е → `[_\-]+`→пробел → collapse → trim.
  4. `services/houseScope.ts:68` — **`export const normalizeRussianLower = (value: string): string => value.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');`** (без trim/collapse; комментарий 66-67). Реэкспорт в houseGeometry.ts:3.
  5. `services/houseGeometry.ts:110` — normalizedUnit: `toLocaleLowerCase('ru-RU')` → удалить ВСЕ пробелы → ё→е.
  6. `services/cutting/stageOrder.ts:3` — `toLocaleLowerCase('ru-RU')` → ё→е → trim.
  7. `services/wikiAI.ts:55` — normalizeToken: `toLowerCase()` → ё→е → убрать не-буквы/цифры → collapse → trim.
  8. `services/cutting/importCsv.ts:24-30` — normalizeHeader: срез BOM → `toLocaleLowerCase('ru-RU')` → ё→е → `[.,;:_]+`→пробел → collapse → trim.
- Унификация: НЕ менять поведение каждого сайта (отличия в trim/collapse/локали перечислены выше); общий хелпер — только там, где замена байт-в-байт.

### g) Санитайзеры имён файлов (3 реализации + 1 инлайн; pdfGenerator ЖИВ)
1. `services/pdfContractGenerator.ts:12` (не экспортируется): `value.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim()`; использование 326 (доп. `.replace(/\s+/g,'_')`); вызов через documentExport.ts:18.
2. `services/premiumPdf.ts:125-128` (экспортируется `sanitizePremiumPdfFileName`): то же + fallback `'Без_названия'`; `premiumEstimateFileName(estimate, title?)` 130-134 (пробелы→`_`). Файл с `@ts-nocheck` (1).
3. `services/cutting/exportPdf.ts:21`: `safeFileName = value.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]+/g, '_') || 'Раскрой'` — срезает исходное расширение, fallback «Раскрой»; использование 235: `` doc.save(`Раскрой_${safeFileName(fileName)}.pdf`) ``.
4. `services/pdfGenerator.ts:371-373` — инлайн: fileTitle/fileClient с `.replace(/[\\/:*?"<>|]/g,'_').replace(/\s+/g,'_')` (+`_+`→`_`), БЕЗ trim и fallback; `doc.save(`${fileTitle}_${fileClient}.pdf`)`.
- **ВАЖНО (поправка оркестратора):** `services/pdfGenerator.ts` (374 строки, `@ts-nocheck` на 1) ЖИВ — динамический импорт `services/documentExport.ts:8` (`exportEstimatePdfPlain`). Импортёров, кроме documentExport.ts:8 и `pdfGenerator.test.ts`, нет.
- `pdfGenerator2.ts` (27 строк) — thin-алиас premiumPdf; импортёр один — documentExport.ts:13 (`exportEstimatePdfColored`).

### h) Форматтеры
- `services/format.ts` (новый): `formatBytes`.
- `formatDuration` — ProfileModal.tsx:26-30: часы/минуты без склонений.

### i) Прочая косметика
- **services/wikiDatabase.ts:653** — статья `engineering-7` («Наружная канализация», 646-656): `'Ревизионные колодцы устанавливают на每一个 повороте и через каждые 10–15 м прямого участка. ...'` → «на каждом повороте».
- **onKeyPress (10 шт., все Enter→действие):** Bundles.tsx:136; Prices.tsx:303, 321, 330, 481, 565; Works.tsx:173, 182, 254, 330. Замена — onKeyDown с `event.key === 'Enter'` (в onKeyDown правильный первый параметр — событие; в onKeyPress тоже; проверить сигнатуры обработчиков при замене).
- **key={idx}/key={index} (7 шт.):** BundlePickerModal.tsx:164 (name/price строки); Analytics.tsx:1845 (таблица категорий, есть стабильное `c.category`); EstimateEditor.tsx:1442 (warnings — строки) и 1453 (suggestions — строки); AIMissingItemsModal.tsx:216 (`r.map` — li); VersionComparisonModal.tsx:95 (diffs, есть `diff.type`); WorkToolRequirementsEditor.tsx:55 (требования, id нет); Analytics.tsx:2054-2055 fallback-список (`key={i}`). Где есть стабильное поле — его; где строки — сама строка (при уникальности) или составной ключ.
- **console-подсчёт (без test-файлов):** services/ — 30 (12 error, 9 info, 8 warn, 1 log); components/+App — 48 (41 error, 3 debug, 3 info, 1 warn). Топ: App.tsx 32; openRouterService.ts 13 (8 console.info пайплайна AI: 680, 1251, 1261, 1316, 1327, 1350, 1361, 1382, 1395); EstimateEditor.tsx 10 (544, 779, 785, 794, 798, 1364 — debug/info трассировка); database.ts 5; dataTransfer.ts:537 — единственный console.log в services. Удаляются log/info/debug; error/warm остаются.
- **electron/main.ts:34 appendFileSync** — см. d.
- **pdfGenerator2.ts** — см. g.

### j) Tailwind/UX
- **tailwind.config.js (25 строк):** content globs; `theme.extend.colors` (тёмная тема, `primary: '#DC2626'`); плагинов нет. Кастомных screens/maxWidth НЕТ.
- **styles.css (25 строк):** директивы; `body { @apply bg-background text-text-primary; }`; `html,body,#root { max-width: 100%; overflow-x: clip; }`; на <768px `main { padding-bottom: calc(72px + env(safe-area-inset-bottom)); }`.
- **App.tsx main-контейнер — стр. 2103:** `<main className="p-2 sm:p-4 md:p-6 max-w-8xl mx-auto pb-24 lg:pb-6">` (max-w-8xl не существует в Tailwind — класс не применяется). Корневой div: 2038 `min-h-screen bg-background text-text-primary`.
- **components/Header.tsx (335 строк):** десктоп-хедер (lg+) 148-183 — KARKAS MASTER, `PRIMARY_DESKTOP_NAV_ITEMS` (56-60: Сметы/Материалы/Работы, БЕЗ иконок), кнопка-логотип открывает drawer (171-180). Мобильный хедер 185-205. Мобильная нижняя навигация 207-249 — `MOBILE_TABS` (48-54) + popup `MORE_TABS` (71). Drawer 251-330 — `DRAWER_NAV_ITEMS` (62-69): Расчёт дома, Комплекты, Аналитика, Раскрой, Wiki, Разделы смет + Профиль/Выйти/версия. Иконки — локальный inline-SVG `Icon`, тип `NavIconName = 'file-text' | 'house' | 'tag' | 'briefcase-business' | 'more-horizontal' | 'wrench' | 'layers'` (15-46). Header в `React.memo` (335). `@devigner-ui/icons` в шапке НЕ используется.
- **components/Prices.tsx (766) — форма добавления 296-374:** наименование (297-304, onKeyPress 303), категория+цена (305-323), ссылка (324-331), блок «Это доска» (332-366), кнопка «Добавить» (368-373). Все поля `min-h-[44px]`.
- **components/Works.tsx (425) — форма 166-200:** наименование (167-174), цена+категория (175-193), кнопка (194-199).
- **components/Bundles.tsx (272) — 119-176:** форма «Название комплекта»+категория+«Создать» (129-153, onKeyPress 136), фильтр (155-166), карточки с 169 (expandable, `expandedBundles` Set).
- **components/SheetRoomPlanner.tsx (240) — 125-176:** карточки помещений `rooms.map((room, index) => <section key={room.id}>` (129-176): имя (139-144), RoomNumberField (151-152), `RoomGrid`+Summary (159-168).
- **components/Analytics.tsx (2095):** react-window — импорт 21; виртуализация 2044-2051: `<List rowCount={...} rowHeight={44} rowComponent={AnalyticsItemsRow} rowProps={{...}} style={{ height: 360 }} />` (комментарий 38: rowComponent module-level); ≤45 — обычный map (2053-2067). Recharts `ResponsiveContainer height={320}` — 1411, 1451, 1626, 1660, 1686, 1721 (один `height={280}` на 1743). `key={idx}` 1845.
- **components/EstimateHistory.tsx (808):** десктоп-таблица 642-706: колонки Клиент и смета/Версия/Статус/Объект/Сумма/Действия; truncate: 664 `max-w-[240px]` (клиент), 682 `max-w-[180px]` (объект); чипы меток `renderLabels` (271-274, вызов 665); кнопки действий 686-693: «Открыть»/«Поделиться»/«PDF для клиента»/«В архив»/«Удалить» (текстовые px-2 py-1.5, удаление — красный hover). Мобильные карточки 709+ (`md:hidden`).
- **components/SmartEstimateWizard.tsx (419):** 5 шагов, степпер 354-369 (`([1,2,3,4,5] as Step[]).map`, STEP_ICONS), итог 330-343; выбор кровли 230-231; params-memo 140-145 → `buildSmartEstimate(params, estimates, materials, works)` (148).

### k) Общие UI-компоненты components/ui/
- `badge.tsx` — тон-пиллюли; потребитель EstimateHistory.
- `date-range-picker.tsx` — потребитель EstimateHistory:14 (~610-627).
- `delete-button.tsx` — потребителей в продакшн-рендере нет (вне рамок, не трогать).
- Новые общие компоненты класть сюда.

## 3. Что менялось после прошлой сборки
- **ed784e7** — SQL-миграция `supabase/migrations/20261105193256_qualify_estimate_sections_order_id.sql` (квалификация `id` в RPC, SQLSTATE 42702) + регрессионные SQL-тесты `supabase/tests/estimate_sections_rpc_regression.sql`. TS-код не тронут.
- **Незакоммиченный WIP баннера обновлений** — 7 файлов, см. d; коммитить целиком первым коммитом тикета.

## 4. Диагнозы доводки 14.11 (детальный аудит известных багов — источники для тикетов 02/03)

1. **Индикатор успеха при отмене удаления шаблона — РЕАЛЬНЫЙ БАГ.** Цепочка: `components/estimate-editor/EstimateTemplateRow.tsx:48-51` (DeleteButton) → `components/EstimateEditor.tsx:179,1444` → `App.tsx:1814` → `hooks/useEstimateCrud.ts:300-310`. Корень: `handleDeleteTemplate` async — при отмене `window.confirm` возвращает fulfilled → `components/ui/delete-button.tsx:38-42` идёт в `.then` → `setPhase('done')` → зелёная галочка на 1400 мс без удаления. Фикс (1 строка, useEstimateCrud.ts:301): `if (!window.confirm('Вы уверены, что хотите удалить этот шаблон?')) throw new Error('cancelled');` ПЕРЕД try → reject ловится delete-button.tsx:43 → `setPhase('idle')`. DeleteButton единственный потребитель — этот ряд; contract: onConfirm может отклониться.
2. **aria «Пояснения» — a11y.** `components/estimate-editor/EstimateExplanation.tsx:24-45` (свёрнуто), `47-72` (развёрнуто). Файл создан 77e6780; раньше textarea был внутри `<label>` (неявная ассоциация) — при выносе потеряна. Фикс (~7 строк): textarea `id="estimate-explanation-field"` (53); свёрнутой кнопке `aria-controls` (31); в раскрытой ветке «Пояснение для расчёта дома» (50) сделать кнопкой `aria-expanded={true} aria-controls=... onClick={() => setOpen(false)}`.
3. **Дубли стилей полей.** Рецепт `p-2 bg-background border border-border rounded-md text-text-primary` ×8: `estimate-editor/shared.ts:4` (inputStyles), локальная const `EstimateEditor.tsx:1352` (байт-копия), 6 инлайн в мобильной таблице `EstimateEditor.tsx:1953,1958,1984,1989,1995,2003` (`"w-full min-h-[44px] p-2 … text-sm md:min-h-9"`, БЕЗ focus-цветов). Фикс: локальная `const mobileFieldStyles = inputStyles + " min-h-[44px] text-sm md:min-h-9"` (внутри файла — shared.ts наружу estimate-editor не экспортируется, см. комментарий shared.ts:1-2). НЕ подставлять inputStyles в инлайны напрямую — это добавит focus-цвета (микро-визуальное изменение).
4. **6 warnings exhaustive-deps — ЛОЖНОПОЛОЖИТЕЛЬНЫЕ.** Это `useCallback` (не useEffect). `setEstimate` — `useCallback(…, [])` на EstimateEditor.tsx:205-218 (читает только sectionsDocumentRef и стабильные импорты → ссылка вечна). По массивам: 445 (board-switch; estimate в deps), 874 (только функциональный setEstimate), 1066 (функциональный + estimate.* в deps), 1171 (функциональный), 1184 (deps [], только аргументы), 1208 (функциональный). Stale-closure НИГДЕ. Фикс: добавить `setEstimate` в 6 массивов — поведение не меняется вообще.
5. **Ложное «Не удалось сохранить» — РЕАЛЬНЫЙ БАГ.** `App.tsx:1890-1911` persistSectionsDocument: `loadEstimateSections()` (1897) в общем try — после УСПЕШНОГО save сбой перечитывания трактуется как сбой сохранения (сообщение видно в EstimateSectionsSettings.tsx:176 из context.error). Фикс (~5 строк): `let stored = next; try { stored = (await loadEstimateSections())[0]; } catch { /* кэш недоступен — оставляем next */ }`, остальной блок 1898-1902 без изменений. Тест: логика в App.tsx — компонентный тест не настроен, known gap.
6. **max-w-[1600px] редактора — мёртвый код.** EstimateEditor.tsx:1383 `mx-auto max-w-[1600px] space-y-4` при родителе main `max-w-8xl` (93.75rem=1500px, tailwind.config, коммит 64788bb). Фикс (1 строка): убрать `max-w-[1600px]` — 8xl единственный источник ширины.
7. **Premium-пайплайн.** `services/documentExport.ts:12-27` содержит тело удалённого pdfGenerator2 (loadPremiumPdfResources, проверка fontBase64, save). Фикс: экспортировать из `services/premiumPdf.ts` `export const generatePremiumEstimatePdf = async (estimate, materials: readonly Material[] = [], title?: string): Promise<void> => {…}` (тот же код построчно, файл с @ts-nocheck); documentExport.exportEstimatePdfColored сжимается до делегирования; сигнатура exportEstimatePdfColored НЕ меняется (потребитель один — App.tsx:45,1428).
8. **Analytics key — ЛОЖНАЯ ТРЕВОГА.** `Analytics.tsx:2068` (не 2064) ключ `${it.name}-${it.unit || ''}`; `itemsComparison` строится 604-620 через itemsMap с `keyOf = ${name}___${unit||''}` — одинаковые имя+единица УЖЕ смёржены, дублей в filteredItems быть не может; порядок Object.values стабилен. Фикс не обязателен; унифицировать сепаратор ключа строки с merge-ключом (`___` вместо `-`) — 1 строка, поведение идентично.
9. **Отступ Wizard — whitespace-only.** `SmartEstimateWizard.tsx:376-445`: 376 `<div className="md:flex md:gap-6">` (16 пробелов); дети aside 378-401 и контейнер 403 с контентом 405-443 на том же уровне 16; закрывающие 443/444/445 подряд. Фикс: сдвиг 378-401 +4, 403 +4, 404-443 +8, 444 +4. Разметка не меняется ни на байт.
10. **Logout hover + aria-дубль.** `Header.tsx:232-241` (xl+, `hover:bg-white/5`, `aria-label="Выйти"` при видимом тексте) и `381-388` (drawer, `hover:bg-red-500/10 hover:text-red-300`). Фикс (~4 строки): константа `const LOGOUT_HOVER = 'text-text-secondary hover:bg-red-500/10 hover:text-red-300 focus:ring-2 focus:ring-primary';` в className обеих (layout-специфику — border/px/w-full — оставить локально); aria-label снять — видимый текст уже даёт доступное имя.

Объём: ~15 строк семантических (1,2,5,6,7,10) + 6 deps (4) + ~8 дедуп (3) + 1 ключ (8) + ~68 whitespace (9). Тикет-разрез: 02 — семантические (1,2,3,4,5,6,7,8,10); 03 — style-only (9).
