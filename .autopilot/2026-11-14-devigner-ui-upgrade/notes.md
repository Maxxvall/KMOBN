# Заметки исследователя — UI-апгрейд devignerui (сборка 2026-11-14)

Код не менялся после коммита `2b153b7` («Autopilot: сборка сдана»); поверх только `54c263c` (docs/AGENTS.md). Все факты ниже сняты с текущего HEAD. Отступы: старые файлы 4 пробела, новые (EstimateSectionsSettings, EstimateLabelsPicker, EstimateTransferModal, ui/*) — 2 пробела.

---

## 1. Badge и StatusBadge

**`components/ui/badge.tsx`** (адаптация рецепта devignerui «badge»):
- Экспорт: `Badge` (`React.FC<BadgeProps>`, L32), типы `BadgeTone` (L22: `neutral | warning | info | success | danger`), `BadgeSize` (L23: `sm | md | lg`), `BadgeProps` (L25: `tone?`, `size?` + extends `React.HTMLAttributes<HTMLSpanElement>`).
- Рендерит `<span data-badge>` rounded-full border, классы из карт `TONES` (L8) и `SIZES` (L16).
- Используют: только `components/estimate-editor/StatusBadge.tsx` (L3). Прямых использований `Badge` больше нет.

**`components/estimate-editor/StatusBadge.tsx`**:
- Экспорт `StatusBadge` (L20), пропсы `status: EstimateStatus`, `className?` (L15–18).
- Маппинг `STATUS_TONES` (L9): `DRAFT→warning`, `SENT→info`, `APPROVED→success`; текст — сам `status` («Черновик»/«Отправлена»/«Согласована»).
- Используют: `components/EstimateHistory.tsx:680,724`, `components/estimate-editor/EstimateEditorHeader.tsx:21`.

**Разница API**: `Badge` — generic-пилюля (tone/size + HTML-атрибуты span), `StatusBadge` — доменная обёртка с обязательным `status: EstimateStatus` (enum из `types.ts:201`-области) и без size (фиксирует `md`).

## 2. DeleteButton

**`components/ui/delete-button.tsx`**:
- Экспорт `DeleteButton` (L25), `DeleteButtonProps` (L17): `onConfirm?: () => void | Promise<unknown>`, `label?: string` (title+aria-label, дефолт `'Delete'`) + Omit<ButtonHTMLAttributes, 'onClick'|'onAnimationStart'|'onDragStart'|'onDragEnd'|'onDrag'>.
- Контракт: НЕ имеет собственного confirm-шага — confirm остаётся вызывающему (комментарий L4–7). Клик → вызывает `onConfirm()`; если вернулся промис: pending (спиннер CSS `animate-spin`) → done (галочка `CHECK`, `RESET_AFTER_MS = 1400`, L15) → idle; reject → сразу idle (L33–45). Фазы: `phase: 'idle' | 'pending' | 'done'` (L26), `aria-busy` при pending.
- Константы путей SVG: `BIN` (L9), `TICKS` (L10), `LID` (L11), `HANDLE` (L12), `CHECK` (L13) — строковые `d`.
- Используют (единственная точка): `components/estimate-editor/EstimateTemplateRow.tsx:48` — `label="Удалить выбранный шаблон"`, `onConfirm={() => onDeleteTemplateAction?.(projectTemplateId)}`. Цепочка: `EstimateTemplateRow` → prop `onDeleteTemplateAction` → в `EstimateEditor` передаётся `handleDeleteTemplate` из `hooks/useEstimateCrud.ts:302` — там `window.confirm` и при отмене `throw new Error('cancelled')` (комментарий L301: reject → кнопка возвращается в покой, галочка только при реальном удалении).

## 3. DateRangePicker

**`components/ui/date-range-picker.tsx`**:
- Экспорт `DateRangePicker` (L25), `DateRangePickerProps` (L9): `from?: string`, `to?: string` (ISO `yyyy-mm-dd`, `''` — не задано), `onFromChange: (v: string) => void`, `onToChange: (v: string) => void`, `fromLabel? = 'Период с'`, `toLabel? = 'Период по'`, `className?`.
- Реализация: `role="group"`, два нативных `<input type="date">` (max/min связаны), иконка `IconCalendar` из `@devigner-ui/icons` (L2, L39).
- Используют (единственный файл): `components/EstimateHistory.tsx:580` (десктоп-фильтры, `fromLabel="Дата сметы с"`, `toLabel="Дата сметы по"`) и `:620` (мобильный блок фильтров в fieldset «Период смет»). Связанные state: `filterDateFrom`/`filterDateTo` (EstimateHistory L282–283).

## 4. Табы (3 реализации + навигация Header)

Все три — `role="tablist"` + `role="tab"` кнопки с `aria-selected`, состояние — один useState, переключение по onClick; **нет** keyboard arrow-navigation и `aria-controls`/`id` связки:

1. **`components/EstimateHistory.tsx:542–545`**: tablist `aria-label="Состояние смет"`; табы `'current'` («Текущие {archiveCounts.current}») и `'archive'` («Архив {archiveCounts.archive}»); state `archiveView, setArchiveView = useState<'current'|'archive'>('current')` (L278); активный — `bg-primary text-white`.
2. **`components/EstimateSectionsSettings.tsx:165–168`**: tablist `aria-label="Состояние разделов"`; табы `'active'` («Активные») и `'archive'` («Архив»); state `tab, setTab = useState<'active'|'archive'>('active')` (L23); кнопки таба `disabled={Boolean(orderDraft)}`.
3. **`components/Cutting.tsx:404–423`**: tablist `aria-label="Раздел раскроя"`, grid grid-cols-2; табы `'boards'` («Пиломатериал») и `'sheets'` («OSB и фанера»); state `activeSubgroup, setActiveSubgroup = useState<CuttingSubgroup>('boards')` (L105, тип `CuttingSubgroup = 'boards'|'sheets'` L31).

**Header.tsx — это nav, не tablist** (только структура): `MOBILE_TABS` (L54–60): `[{view: View.HISTORY,'Сметы','file-text'}, {View.HOUSE_CALCULATOR,'Дом','house'}, {View.PRICES,'Материалы','tag'}, {View.WORKS,'Работы','briefcase-business'}, {'MORE','Ещё','more-horizontal'}]` — нижняя таб-панель `<nav aria-label="Мобильная навигация">` (L272). Десктоп: `PRIMARY_DESKTOP_NAV_ITEMS` (L62, lg-зона L197), `XL_NAV_ITEMS` (L69–79, все 9 разделов, xl-зона L178), drawer `DRAWER_NAV_ITEMS` (L81) + `MORE_TABS` (L90, для мобильного «Ещё»). Локальный icon-компонент `NavIconName` (L15) рисует 10 svg вручную.

## 5. SyncToast и управление в App

**`components/SyncToast.tsx`**: `export default React.memo(SyncToast)` (L122). Пропсы (L5–16): legacy-toast `visible: boolean; message?: string; type?: 'success'|'error'|'info'; onClose?: () => void`; автосохранение `saveStatus?: SaveStatus ('idle'|'saving'|'saved'|'error', L3); lastSaved?: Date|null; saveError?: string|null`. Логика: если `visible` — большой toast (роль `status`, aria-live polite, круглая иконка с текстовыми глифами: `iconFor` L35 → `✓` success / `!` error / `i` info, кнопка закрытия — глиф `✕`); иначе компактный индикатор автосохранения (точка-акцент `autosaveAccentFor` L30, метки «Сохранение…» / «Ошибка» / «Сохранено» + время `в ЧЧ:ММ`).

**App.tsx**:
- State (объединённые объекты): `uiState.sync: SyncState = { visible, message, type }` (initialSyncState L133), `saveState: SaveState = { isSaving, lastSaved, saveError }` (L104–108, initialSaveState L152). Сеттеры `setSync` (L227), `setIsSaving/setLastSaved/setSaveError` (L247–249).
- `toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)` (L315).
- `showToast = useCallback((message, type = 'info', duration = 3200))` L1176–1187: `setSync({visible:true,...})`, clearTimeout, при `duration > 0` таймер скрывает `setSync(s => ({...s, visible:false}))`. Вызовы: online/offline-эффект L1189–1197 (offline с `duration = 0` — не скрывать).
- Очистка таймера на unmount L1207–1213.
- Рендер `<SyncToast ...>` L2292–2300: `visible={sync.visible}` (неявно через spread? — проверено: props `saveStatus={isSaving ? 'saving' : saveError ? 'error' : lastSaved ? 'saved' : 'idle'}`, `lastSaved`, `saveError`; legacy-часть прокидывается из `sync`).
- Автосохранение заполняется эффектом debounced-сохранения L1091–1124 (`saveEstimates(estimates)` и т.д., `setIsSaving`/`setLastSaved(new Date())`/`setSaveError`).

## 6. UpdateBanner

**`components/UpdateBanner.tsx`** (`export default`, L94). Пропсы (L5–13): `version: string; downloaded: boolean; downloading: boolean; progress: UpdateDownloadProgress | null; onDownload: () => void; onInstall: () => void; onDismiss: () => void`. Внутри: progressbar (`role="progressbar"` с aria-valuemin/max/now, L39–59), тексты «Доступна версия v…» / «Загрузка обновления v…» / «Обновление v… готово к установке», кнопки «Скачать»/«Установить»/«Закрыть».
- Inline-SVG (2): иконка загрузки-стрелка вниз (L22–30, `animate-pulse` при скачивании) и крестик закрытия (L85–88).
- Данные: `UpdateDownloadProgress` из `electron/types.ts`; `formatBytes` из `services/format`.

**App.tsx**: state `appUpdateInfo` (`{version:string}|null`, L310), `appUpdateDownloaded` (L311), `appUpdateDownloading` (L312), `appUpdateProgress` (L313). IPC-подписки L818–822: `window.electronAPI.onUpdateAvailable / onUpdateDownloadProgress / onUpdateDownloaded / onUpdateNotAvailable / onUpdateError`; вызовы: `electronAPI.downloadUpdate?.()`, `electronAPI.installUpdate?.()` (L2092–2096), также `checkForUpdates?.()` в ProfileModal. Рендер баннера L2086–2101; onDismiss сбрасывает только `appUpdateInfo` (загрузка продолжается — комментарий L2098–2100).

## 7. Степперы

**`components/SmartEstimateWizard.tsx`**:
- `type Step = 1|2|3|4|5` (L26); `STEP_TITLES` (L28): 1 «Тип и размеры», 2 «Конструктив», 3 «Отделка и окна», 4 «Регион и клиент», 5 «Результат»; `STEP_ICONS` (L36): эмодзи 📐 🏗 🪟 📍 ✅.
- Мобильный степпер L356–372: `flex items-center gap-1`, кружки `w-8 h-8 rounded-full` с соединительными линиями `h-0.5` (`md:hidden`). Десктоп — вертикальный сайдбар L374–400 (`aria-label="Шаги мастера"`, `aria-current="step"`).
- **Клики по шагам невозможны** — это div/spans без onClick; навигация только кнопками «Назад»/«Далее» внизу (`step > 1 &&` L418) и `setStep`.
- State: `step` (L123) + поля мастера clientName/buildingType/area/floors/foundation/roof/insulation/windowsDoors/region/finishLevel (L124–133).

**`components/HouseCalculator.tsx`** — степпера нет; переключатели/слайдеры:
- `calculationMode: 'area' | 'geometry'` (L81) — переключатель способа расчёта.
- `foundationType: 'slab'|'strip'|'piles'` (L89), `roofShape: RoofShape` (L98, дефолт 'gable'), `selectedPackage: HousePackage` (L99, 'warm-shell'), `selectedTier: HouseTier` (L110, 'optimal'), `additions: HouseAdditionType[]` + `toggleAddition` (L100, L246).
- Слайдер: единственный `<input type="range">` для площади `id="house-area"` min 20 max 500 (L438).
- Прочее: `rates` (overheadPercent/marginPercent/reservePercent/taxPercent/discountPercent, L101), `variants`/HouseVariantResult (L109).

## 8. EstimateEditor — действия над разделами

Кастомного дропдаун-меню у раздела **нет** — прямые кнопки в заголовке секции (`components/EstimateEditor.tsx:1605–1636`):
- Сворачивание: `toggleCategoryCollapse(category)` (кнопка с `IconChevronRight`, `aria-expanded`, `aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown Alt+Home Alt+End"`).
- `handleDuplicateSection(category)` — «Дублировать» (IconCopy, L1633).
- `handleOpenPasteModal(category)` — «Из другой сметы» (IconClipboard, L1634).
- `removeVisibleCategory(category)` — «Удалить раздел» (IconTrash, destructive, L1635; confirm-текст L1140: `'В разделе есть позиции. Удалить раздел и все позиции?'`).
- Кнопки — обёртка `EditorActionButton` (components/estimate-editor/EditorActionButton.tsx).
- Переименование раздела — НЕ из этого меню (имена берутся из справочника `sectionLabel(category)`).

**Мобильный перенос**: `sectionReorder = useSectionReorder({order, resetKey, disabled, onCommit})` (components/estimate-editor/useSectionReorder.ts:16–22) на контейнере `#estimate-sections` (containerRef, L1602); жест — `createSectionReorderGesture` (sectionReorderGesture.ts:9): удержание заголовка `data-section-header` ~400 мс (таймер L33) активирует перенос, движение >8px до активации отменяет; превью-карточка в portal + маркер вставки `insertionMarkerRef` (L1601); клавиатура: `onHeaderKeyDown` → `sectionReorder.onHeaderKeyDown` (Alt+↑/↓/Home/End), анонсы `announcement`. Заголовок имеет title «Удерживайте заголовок для переноса; Alt + ↑/↓ на кнопке сворачивания» (L1614).

## 9. EstimateHistory — действия над строкой

Десктоп-таблица (L643+): в строке на selectedEstimate (L689–693) кнопки-иконки 9×9:
- Открыть: `editAction?.(selectedEstimate)` (IconDocument) — aria-label «Открыть смету»;
- Поделиться: `handleShareEstimate(selectedEstimate)` (IconShare);
- PDF: `generatePdfAction?.(selectedEstimate)` (IconDocumentDownload) — «PDF для клиента»;
- Архив: `setArchivedAction?.(selectedEstimate, archiveView !== 'archive')` (IconArchive);
- Удалить: `deleteAction?.(estimate)` (IconTrash).
Мобильные карточки (L724–753): те же действия текстовыми кнопками «Открыть» / «PDF клиенту» / (share) / (архив) / «Удалить».
Версии: компонент списка версий (L86–89: props `versions, selectedId, onSelect, onDelete`) с `role="listbox" aria-label="Версии сметы"` (L195) и удалением версии `onDelete(v)` → `deleteVersionAction` (L233, aria-label `Удалить версию v${v.version}`).
Резолв действий (L253–258): `onEdit/onDelete/onDeleteVersion/onGeneratePdf` из пропсов или fallback `estimateContext?.actions.*` (contexts/EstimateContext.tsx:11–25: `onCreateNew, onEdit, onDelete, onDeleteVersion, onDeleteVersionDuplicates, onSetArchived, onGeneratePdf, ...`). Доп. state: `selectedVersions: Record<string,string>` (L284), `archiveView`, `handleShareEstimate`, меню `HistoryActionsMenu` (L36–80, см. п.12).

## 10. LandingPage

**`components/LandingPage.tsx`** (264 строки). Пропсы: `onOpenLogin: () => void; onOfflineMode?: () => void` (L3–6).
Структура: fixed header (L11) → hero (L86–130: badge «Платформа для смет и знаний», H1 «Сметы, материалы и работы в едином профессиональном пространстве», подзаголовок, CTA) → 3 карточки-фичи (L132–148, эмодзи 📊📚📄) → 3 вторых карточки (L150–166, 🧠🧩🔒) → Wiki-секция + «Премиальный контур» (L168–200) → финальный CTA-блок (L202–214) → footer (L217–259).
CTA-тексты: header «Войти» (L70), hero «Начать работу» (L107), финал «Войти в систему» (L211), «Оффлайн-режим» (L78, amber). Контакты — ссылки: `https://karkasmaster.ru` (лого L14), VK `https://vk.ru/kmobn` (L29/222), Telegram `https://t.me/karkasmaster40` (L40/233), YouTube `https://www.youtube.com/@KarkasMasterObninsk/videos` (L51/244); aria-label «ВКонтакте»/«Telegram»/«YouTube». Текст footer: «© 2026 Каркас Мастер. Премиальная платформа смет.»
Inline-SVG (6): бренд-иконки VK, Telegram, YouTube — по 2 копии (header L35/46/57 и footer L228/239/250), fill=currentColor path-глифы. Остальные «иконки» фич — эмодзи-текст.

## 11. PdfStyleModal, зум Cutting/SheetRoomPlanner

**`components/PdfStyleModal.tsx`**: `export default React.memo(PdfStyleModal)`. Пропсы (L6–9): `onClose; onSelectStyle: (style: PdfStyle, title: string) => void | Promise<void>`; `type PdfStyle = 'simple' | 'colored' | 'word-contract'` (L4). **Числовых полей (страницы/отступы) нет** — единственный ввод текстовый: `title` («Название сметы в PDF», state `title` L13, дефолт `'Смета'`, maxLength 80) + `pendingStyle` (L12) для isGenerating. Три большие кнопки-опции: «Премиальный PDF» (colored, бейдж «Рекомендуем»), «Простой PDF» (simple), «Приложение к договору» (word-contract). FocusLock, Escape-закрытие.

**`components/Cutting.tsx`**: зум/слайдеров нет вообще (grep zoom/scale/range — пусто, кроме `active:scale-[0.98]` на кнопке). Схема раскроя рендерится без масштабирования.
**`components/SheetRoomPlanner.tsx`**: зум/слайдеров нет; схема помещения — inline-SVG `RoomGrid` (L188–210) c `viewBox={`0 0 ${room.length} ${room.width}`}` и `role="img" aria-label="Схема листов для …"`; state: `rooms` (localStorage `kmobn:sheet-rooms:v1`), `isExporting`, `exportError` (L37–39).

## 12. Импорт данных (UI + сервис)

**`services/dataTransfer.ts`**: `SCHEMA_VERSION = 3` (L32), `exportData(): Promise<string>` (L170), `validateImportData(jsonData): ImportValidationResult` (L196), `importData(jsonData): Promise<ImportResult>` (L240), `importSharedEstimate(payloadText)` (L143), `createEstimateTransfer`/`parseEstimateTransfer` (L54/65). ImportResult содержит счётчики added/updated/unchanged/inFileDuplicates по blocks: estimates/templates/materials/works/bundles.

**UI-точки**:
1. **`components/EstimateHistory.tsx`**: `handleExportData` (L341–353) — `exportData()` → Blob JSON → `downloadBlob(blob, 'backup-YYYY-MM-DD.json')`, алерты «Данные экспортированы успешно!» / «Ошибка при экспорте данных.». `handleImportData` (L355–425+) — **динамически создаёт** `document.createElement('input')` c `type='file'`, `accept='.json'` (без видимого input в DOM); чтение → `validateImportData` (ошибка — `alert(validation.error)`) → `importData(text)` → итоговый alert со сводкой по разделам; при успехе `window.dispatchEvent(new CustomEvent('kmobn:data-imported'))`. Точки входа — меню `HistoryActionsMenu` (L36–80: кнопка «Ещё», `aria-haspopup="menu"`, `role="menu"/"menuitem"`, пункты «Вставить смету» / «Экспорт данных» / «Импорт данных» / «Найти дубли версий»), монтируется 2 раза: мобильный L561, десктоп L597 (props `onExport={handleExportData} onImport={handleImportData} onImportSharedEstimate={() => setTransferModal('import')} onCheckDuplicates={handleCheckDuplicates}`).
2. **`components/EstimateTransferModal.tsx`** (share/import одной сметы): props `mode: 'share' | 'import'; estimate?; onClose; onImport?: (payload: string) => Promise<void>` (L7–12); state `payload, preview, error, notice, isSubmitting` (L41–45); **видимый** `<input type="file" accept=".json,application/json">` (L159, sr-only) + textarea для вставки JSON; `createEstimateTransfer`/`parseEstimateTransfer`. Открывается из App через `transferModal`-подобный механизм (EstimateHistory state `transferModal: 'share'|'import'|null` L292).
3. **`components/ProfileModal.tsx`**: только экспорт `handleExportData` (L75–85) — «Экспортировать JSON», файл `karkas-master-export-YYYY-MM-DD.json`; импорта нет.
4. **`components/Cutting.tsx`**: отдельный импорт CSV — видимый `<input type="file" accept=".csv,.txt,text/csv,text/plain" id="cutting-file">` (L326–331) + drag-n-drop (`isDragging`, readFile); ошибки `fileError` (role=alert L341), пропущенные строки — `importResult.skippedRows/skippedDetails` c state `showSkippedRows` (L104, блок L372–399).

## 13. Диалоги дубликатов

**`components/DuplicateCheckerDialog.tsx`** (дубликатов материалов/работ каталога): props (L7–13) `isOpen; onClose; title: string; duplicateGroups: DuplicateGroup<Material | Work>[]; onMerge: (decisions: CatalogDuplicateDecision[]) => Promise<number>`. Группировка по `group.normalizedKey`, выживший — `survivorByKey: Record<string,string>` (L23), авто-выбор `selectPreferredCatalogDuplicate` (L28–37). Отображает имя/цену/категорию позиций (`getSectionLabel(item.category…)`), ID записей в radio-value, но не номера смет. ID смет здесь нет.
**`components/EstimateDuplicateDialog.tsx`** (дубли версий смет): props (L5–10) `isOpen; onClose; duplicateGroups: EstimateDuplicateGroup[]; onDelete: (requests: EstimateDuplicateDeleteRequest[]) => Promise<number>`. Отображает **номера смет** — `Смета №{group.estimateNumber}` (L138), главная версия `v{group.latestVersion.version}` (L140–149), списки «Идентичны главной версии» (v-номера, L161–183), пары исторических дубликатов с ключом выжившего `` `${group.estimateNumber}:${pairIndex}` `` (L191–192). Удаление формирует `EstimateDuplicateDeleteRequest { estimateNumber, latestVersion?, candidates: [{id, fingerprint?}] }` (L53–60); fingerprint — `getEstimateContentFingerprint` из `services/estimateIntelligence`. Открывается из EstimateHistory: state `showDuplicateDialog`/`duplicateGroups` (L290–291), `handleCheckDuplicates` (L315+ через `findEstimateVersionDuplicates(allEstimatesList)`), рендер L786+ c `onDelete={handleDeleteDuplicates}` (L320 → `estimateContext.actions.onDeleteVersionDuplicates`).

## 14. Analytics

**`components/Analytics.tsx`** (2108 строк). Props: `estimates: Estimate[]; isLoading?: boolean` (L58–61). Хранилище фильтров: `STORAGE_KEY = 'kmobn:analytics:filters:v1'` (L67).
- **Типы**: `PeriodPreset = 'month'|'quarter'|'year'|'all'` (L64), `AnalyticsMode = 'overview'|'compare'|'details'|'actual'` (L65), `DetailFilterPreset = 'all'|'growth'|'decrease'|'added'|'removed'|'price'|'quantity'|'significant'|'same'` (L66).
- **Фильтр периода —preset-кнопки, НЕ DateRangePicker**: `periodPreset, setPeriodPreset = useState<PeriodPreset>('quarter')` (L345); presets-массив L1029–1034 («Месяц»/«Квартал»/«Год»/«Всё»). DateRangePicker в Analytics не используется.
- **Моды (верхние таб-кнопки, не role=tab)**: `modeButtons` L1036–1040 + splice вставка `{key:'actual', label:'План-факт'}` L1041; `activeMode, setActiveMode` (L344).
- **KPI-карточки** (режим overview, L1162–1227): локальный `KpiCard` (L156–192: props `title, value, subtitle?, accentClassName, icon: ReactNode, badge?: {label, tone: 'up'|'down'|'flat'}`; hover:-translate-y-0.5) и обёртка `Icon` (L152, круглый контейнер). Пять карточек: «Смет за период» (totalEstimates), «Оборот по сметам» (totalEstimateValue + badge динамики), «Средняя смета» (averageEstimate), «Средняя стоимость за м²» (L1203), «Средняя маржа» (L1215). В режиме actual — KpiCard «План»/«Факт заполнен»/«Прогноз»/«Отклонение» (L1234–1239) с текстовыми литерами П/Ф/Σ вместо svg.
- **recharts** (импорт L7–20: BarChart, LineChart, ResponsiveContainer и др.): waterfall `BarChart` L1424–1453, diverging `BarChart layout="vertical"` L1464–1476, тренды `LineChart` (expenseTrends) L1639–1662. `chartHeight` state где-то рядом с isWideScreen L325.
- **react-window**: `import { List, RowComponentProps } from 'react-window'` (L21); строчный компонент `AnalyticsItemsRow` (L40, module-level для стабильности); `<List>` используется один раз L2058 (виртуализированная таблица позиций).
- Прочее: `Sparkline` (L130–149, inline-SVG polyline — рисунок), `EmptyState` (L193–205), `detailPreset` (L346), `significantThreshold` (L347, число), сортировки `categorySort`/`itemSort` (L352–353).

## 15. Чекбоксы/toggle и чипы меток

**`components/ProfileModal.tsx`**: **boolean-настроек (чекбоксов) нет**. Табы `activeTab: 'profile'|'stats'|'app'` (L25, L37; tab-кнопки L160–166 БЕЗ role=tab — просто кнопки с иконками-глифами ◉ ↗ ⚙). Действия: экспорт JSON, «Очистить данные устройства» (handleClearCache L94–116 — удаляет IndexedDB `kmobn_indexeddb_cache`, `kmobn_offline_queue`, cache `supabase-api`, localStorage), обновления (`window.electronAPI.checkForUpdates/installUpdate/downloadUpdate`), блок обновления показывается при `window.electronAPI?.isElectron`.
**`components/EstimateSectionsSettings.tsx`** — toggle/чекбоксов нет; переключатели — таб active/archive, поиск, drag-сортировка (draggable li L212–219, кнопки ↑/↓ `move(id, -1|1)` L95), «Изменить»/«В архив»/«Восстановить» (L232–243), форма add/rename в модалке (L250–290, FocusLock). Конфликт-баннер `document.syncConflict` c resolveConflict('local'|'remote') (L180–201).
**`components/EstimateLabelsPicker.tsx`** (`export const EstimateLabelsPicker`, L13; props L5–11: `selectedIds: string[]; onChange; maxSelected?; withoutLabels?; onWithoutLabelsChange?`): **чипов нет** — выбранные метки показываются текстом в кнопке-триггере (`selected.map(l => l.name).join(', ')` L44). Удаление метки: в выпадающей панели кнопка «Удалить» (L58, aria-label `Удалить метку «…»`) → state `deleting` (L17) → inline-подтверждение «Снять метку … со всех смет?» → `context.deleteLabel(deleting)` (L62). Переименование — кнопка «Изменить» → `form {id?, name}` → `context.renameLabel` / `context.addLabel` (L66). Чекбоксы выбора меток — нативные `<input type="checkbox" className="accent-primary">` (L49, L53). Контекст: `useOptionalEstimateSections()` (activeLabels, saving, isLoading, pending, document.syncConflict, deleteLabel, renameLabel, addLabel). Константы `MAX_ESTIMATE_LABEL_NAME_LENGTH`, `TYPICAL_PROJECT_LABEL_ID` из `services/estimateLabels`.
**Чекбокс в Cutting**: `settings.separateStages` («Не смешивать этапы», L462–465, нативный checkbox accent-primary).

## 16. Иконки: импорты и 14 файлов с inline-SVG

**Стиль импорта**: именованные импорты с префиксом `Icon`, имена PascalCase-«осмысленные» (`import { IconTrash, IconClose, IconChevronRight } from '@devigner-ui/icons'`). Свойства: `aria-hidden="true"`, класс `size-4`/`size-5` или `className="h-5 w-5"`. Всего **44 уникальных имени** в 16 файлах: IconAdd, IconAlertTriangle, IconArchive, IconArrowLeft, IconArrowRight, IconArrowSwapHorizontal, IconBolt, IconBookmark, IconBox, IconCalendar, IconCar, IconChartSquare, IconCheck, IconChevronDown, IconChevronRight, IconClipboard, IconClose, IconCopy, IconDiskette, IconDocument, IconDocumentDownload, IconDocumentText, IconDoubleChevronDown, IconDoubleChevronUp, IconDrop, IconEye, IconFolder, IconHome, IconHomeAngleDoor, IconLayers, IconMenu, IconNote, IconPen, IconRefresh, IconRobot, IconSettingSlidersHorizontal, IconShare, IconSledgehammer, IconStar, IconStarsSparkles, IconTrash, IconTruck, IconWater, IconWindowFrame.
Примеры: `components/EstimateHistory.tsx:6` — `{ IconArchive, IconDocument, IconDocumentDownload, IconShare, IconTrash }`; `components/estimate-editor/EstimateToolbar.tsx:3–14` — 9 иконок (IconArrowSwapHorizontal, IconBookmark, IconBox, IconDiskette, IconEye, IconLayers, IconSettingSlidersHorizontal, IconSledgehammer, IconTruck); `components/estimate-editor/EditorSectionIcon.tsx:1` — 9 иконок секций (IconBolt, IconDrop, IconFolder, IconHome, IconLayers, IconSledgehammer, IconTruck, IconWater, IconWindowFrame). Версия пакета — 3.5.0 (см. п.18).

**14 файлов с inline-SVG — иконки или рисунки**:
| Файл | SVG | Классификация |
|---|---|---|
| `components/UpdateBanner.tsx` | 2 | Иконки: стрелка-загрузка (L22), крестик закрытия (L85) → можно заменить |
| `components/Header.tsx` | 10 | Иконки: локальный `Icon` с `NavIconName` (L15–51): file-text, house, tag, briefcase-business, wrench, layers, more-horizontal, chart, book-open, log-out → кандидаты на замену |
| `components/Login.tsx` | 1 | Иконка-бренд: многоцветный логотип Google (L203–209, viewBox 48, фикс. заливки #EA4335…) — цветной бренд, заменять аккуратно (остаётся inline или кастом) |
| `components/LandingPage.tsx` | 6 | Иконки-бренды: VK/Telegram/YouTube ×2 (header+footer), монохромные fill=currentColor → можно заменить на брендовые иконки пакета, если есть |
| `components/ProfileModal.tsx` | 1 | Иконка: крестик закрытия (L156) → заменить |
| `components/Analytics.tsx` | 7 | 1 рисунок: `Sparkline` polyline (L146) — оставить; 6 иконок: 5 KPI-иконок (L1171–1221: документ, ₽-знак, оси-график, м², маржа) + иконка EmptyState-документа (L204) → заменить |
| `components/Cutting.tsx` | 6 | Иконки: локальный `Icon` c `IconName = 'upload'|'alert'|'calculator'|'file'|'reset'|'download'` (L33–47) → заменить |
| `components/SheetRoomPlanner.tsx` | 1 | РИСУНОК: схема раскладки листов RoomGrid (L188–210, viewBox в мм, role="img") — оставить inline |
| `components/Wiki/WikiAIChat.tsx` | 1 | Иконка: «источник»-скрепка/линк (L64) → заменить |
| `components/Wiki/WikiArticle.tsx` | 1 | Иконка: стрелка «Назад» (L24) → заменить |
| `components/Wiki/index.tsx` | 2 | Иконки: поиск-лупа (L188), шеврон-вправо у карточки категории (L383) → заменить |
| `components/DuplicateCheckerDialog.tsx` | 1 | Иконка: спиннер (внутренний `Spinner`, L95–100) → можно заменить (или оставить: animate-spin) |
| `components/EstimateDuplicateDialog.tsx` | 1 | Иконка: спиннер (L80) → аналогично |
| `components/ui/delete-button.tsx` | 3 | Иконки: спиннер (L59), галочка CHECK (L63), корзина BIN/TICKS/LID/HANDLE (L67–72) — это сам компонент-адаптация рецепта; менять только в рамках его редизайна |

## 17. Tailwind и styles.css

**`tailwind.config.js`** (весь файл, 33 строки): content — index.html, App.tsx, index.tsx, components/**, hooks/**, services/**, api/**. Кастомы `theme.extend`:
- `colors`: `background #111827`, `surface #1F2937`, `primary #DC2626`, `primary-hover #B91C1C` (ключ `'primary-hover'`), `text-primary #F9FAFB`, `text-secondary #9CA3AF`, `border #374151`.
- `maxWidth`: `'8xl': '93.75rem'` (1500px).
- `screens`: `'3xl': '1920px'`.
- Keyframes/animation — **нет**; plugins — пусто.

**`styles.css`** (25 строк): `@tailwind base/components/utilities`; `body { @apply bg-background text-text-primary }`; `html, body, #root { max-width:100%; overflow-x: clip }`; `@media (max-width:767px) { main { padding-bottom: calc(72px + env(safe-area-inset-bottom)) } }`; `* { -webkit-tap-highlight-color: transparent }`.

## 18. package.json и components.json

**`package.json`** (name karkas-master, version 1.9.1):
- `@devigner-ui/icons: "3.5.0"` (точная, dependencies L25).
- **motion/framer-motion отсутствуют** (в dependencies и devDependencies их нет) — адаптации рецептов специально без motion.
- Ключевые deps: react ^19.2.0, react-dom ^19.2.0, react-focus-lock ^2.13.7, react-window ^2.2.3, recharts ^2.12.0, xlsx (CDN-тарбол sheetjs 0.20.3 — не трогать), @supabase/supabase-js, jspdf, docx, electron-updater.
- Scripts: `check` = `npm run typecheck && npm run lint && npm run test`; `test` = `vitest run --exclude "e2e/**"`; `lint`, `typecheck` = `tsc --noEmit && tsc -p tsconfig.electron.json --noEmit`; `test:e2e:electron` (см. AGENTS.md).

**`components.json`** — мёртвый shadcn-конфиг: `tailwind: {config: 'tailwind.config.js', css: 'styles.css', baseColor: 'neutral', cssVariables: true}`; `aliases: {components: '@/components', ui: '@/components/ui', lib: '@/lib', hooks: '@/hooks'}`; `path: 'components/estimate-editor/ui'`. Псевдонимы `@/*` в tsconfig.json paths указывают на `./*`, но папок `components/ui` по алиасу никто не импортирует (все импорты относительные `../ui/...`); shadcn CLI этим конфигом не пользовался — файл можно игнорировать или удалить, на рантайм не влияет.

## 19. App.tsx — навигация и горячие клавиши

- **View enum** (`types.ts:189–199`): `HISTORY=0, EDITOR=1, PRICES=2, WORKS=3, BUNDLES=4, HOUSE_CALCULATOR=6, ANALYTICS=7, CUTTING=9, WIKI=10, SECTIONS=11` (числовые, 5 и 8 пропущены). Для Command Palette переключение — `setView(View.X)` или `handleNavigationAttempt(target: View)` (App L1215–1223: при dirty-редакторе кладёт `setPendingView(target)` + `setShowUnsavedModal(true)`); `goToView` сбрасывает currentEstimate для не-EDITOR (эффект ~L1167–1172).
- **State-группы** (композиция вместо отдельных useState): `uiState` (view, sync, showPasswordRecoveryModal, showLoginModal, showPdfStyleModal, showContractNameModal, showSaveOptions, showUnsavedModal, pendingView — initialUiState L135–145), `editorState` (currentEstimate, pendingExportEstimate, editorValidationResult, editorDirty, editorDraft, viewAfterSave — L96–102), `saveState` (L104–108), `authState`. Сеттеры-обёртки L231–250. `offlineModeRaw/setOfflineMode` (L175–186, localStorage OFFLINE_MODE_KEY).
- **Открытие сметы**: `handleEdit(estimate: Estimate)` — из хука `useEstimateCrud` (`hooks/useEstimateCrud.ts:66`; пересчёт работ при needsPriceUpdate, `setCurrentEstimate(nextEstimate)`, `goToView(View.EDITOR)`). `handleCreateNew` (там же L46). Открытие **по id**: `handleEditPendingEstimate(estimateId: string)` (App L1292–1297) — `estimates.find(item => item.id === estimateId)` → `handleEdit`; используется для офлайн-очереди (`onEditEstimate` L2288).
- **Горячих клавиш глобального уровня нет**: в App и Header нет window-keydown на навигацию/Ctrl+K (Command Palette придётся добавлять с нуля). Все keydown-слушатели локальные: Header — Escape для drawer (Header.tsx:153–161), EstimateHistory — Escape в меню (L49, L117), EstimateLabelsPicker — Escape (L27), BoardMaterialSwitchModal (L75), useSectionReorder — клавиатурный перенос разделов (L227), модалки App — `handleSaveOptionsKeyDown` (L1358)/`handleUnsavedKeyDown` (L1364).

## 20. Реестр смет для поиска

- Список: `const [estimates, setEstimates] = useState<Estimate[]>([])` (App L281) — единственный источник; загрузка `loadEstimates()` из `services/database` (L29), refresh `refreshEstimatesFromRemote`; флаг готовности `loadedFlags.estimates` + `dataHashes.estimates` (L300–347); сохранение `saveEstimates(estimates)` в debounce-эффекте (L1091).
- В EstimateHistory список приходит через проп `estimates` ИЛИ контекст: `estimateList = estimates ?? estimateContext?.estimates ?? []`, `allEstimatesList = estimateContext?.allEstimates ?? estimateList` (L251–252). Контекст `EstimateContextValue` (contexts/EstimateContext.tsx:28–37): `view, setView, estimates, allEstimates, setEstimates, templates, setTemplates, currentEstimate, setCurrentEstimate, validationResult, actions`; провайдер `EstimateProvider` — App рендерит с actions (onEdit: handleEdit L1804 и др.).
- Функция открытия по id — `handleEditPendingEstimate` (п.19) или напрямую `handleEdit(estimates.find(...))`. Поиск/фильтрация в EstimateHistory локальные: фильтры filterClient/filterStatus/filterBuildingType/filterAreaMin/Max/filterDateFrom/To + метки selectedLabelIds/withoutLabels, `archiveCounts` и `filteredEstimates` (useMemo).

---

## Опасные места

1. **Офлайн-ядро** — `services/offlineSync.ts`, `offlineQueue.ts`, `indexedDbCache.ts`: не трогать без нужды (AGENTS.md); `runtimeCaching: []` в vite.config.ts пуст намеренно. SyncToast-автосохранение (saveState) и offline-тосты (showToast с duration=0) связаны с этим контуром — правки тоста не должны ломать `duration = 0` (не скрывать) и очистку `toastTimerRef` на unmount.
2. **Контракты пропсов ui-адаптаций**: `Badge` (tone/size), `DeleteButton` (onConfirm промис-контракт: reject = отмена, галочка только на успех; confirm остаётся в `handleDeleteTemplate` — `useEstimateCrud.ts:301–303`), `DateRangePicker` (ISO-строки, '' = не задано). Менять сигнатуры — только вместе с EstimateTemplateRow/EstimateHeader/EstimateHistory.
3. **SaveState/SyncState — вложенные объекты**: сеттеры-обёртки (`setSync` и т.д.) — любые новые тост-API надо добавлять в SyncState/UiState, а не отдельным useState, чтобы не разнести состояние.
4. **View — числовой enum** с пропусками (5, 8): не превращать в строковый и не переупорядочивать; сериализация не задействована, но сравнения `View.HOUSE_CALCULATOR` и фильтры `Partial<Record<CacheTableKey, View>>` завязаны на значения.
5. **Tab-реализации трижды скопированы** (History/Sections/Cutting) с чуть разными классами: унификация меняет 3 файла; aria-паттерн одинаковый (role=tablist + aria-selected, без keyboard nav) — при унификации сохранить min-h цели (44px мобильные / 36px десктоп).
6. **Кровельная математика**: `roofFactor` и `ROOF_AREA_PITCH_FACTOR = 1.15` в `services/houseCalculator.ts` — две разные величины; UI-редактуры HouseCalculator не должны трогать расчёт.
7. **style-дубли**: локальные константы `inputClass`/`focusClass` повторяются в Cutting.tsx, SheetRoomPlanner.tsx, ещё `inputStyles` в `components/estimate-editor/shared.ts` — при редизайне полей править согласованно, а не один файл; Tailwind-кастомы `max-w-8xl`/`3xl` есть только в tailwind.config.js.
8. **sectionReorderGesture**: таймер 400 мс и порог 8px — покрыты тестом `sectionReorderGesture.test.ts`; менять жест — только с прогоном теста.
9. **Эмодзи-иконки** (STEP_ICONS в SmartEstimateWizard, карточки LandingPage, табы ProfileModal ◉↗⚙) — текст, не svg; при замене на иконки пакета не потерять aria-скрытость и мобильные размеры.
10. **Ре-рендер производительность**: Analytics `AnalyticsItemsRow` module-level ради react-window (комментарий L38); SyncToast — React.memo; KpiCard-иконки передаются как ReactNode-пропс.
