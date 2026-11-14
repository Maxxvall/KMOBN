# Манифест требований

Источник: `2026-11-14-brief.md` (сообщение 2 «примени это все что нашел» — относится к
списку 15 вариантов из приложения к брифу). Строку из этого списка может снять
**только пользователь**.

| ID | Из брифа (дословно) | Статус | Основание | Где |
|----|---------------------|--------|-----------|-----|
| R01 | «примени это все что нашел» → «может npm i @devigner-ui/icons иконки так же где то поменять» | in-ticket | приложение п.1: миграция инлайн-SVG-иконок 13 файлов на @devigner-ui/icons (3.5.0→3.6.0) + иконки вместо `✓ ! i ✕` в SyncToast; рисунки (RoomGrid/Sparkline/бренды) остаются | spec Истории 1–3, Решения «Иконки» → T01, T02, T03, T04, T05 |
| R02 | «примени это все что нашел» | in-ticket | приложение п.2: Tabs — один компонент вместо 3 реализаций (EstimateHistory, EstimateSectionsSettings, Cutting) + keyboard-nav | spec Истории 4–5, Решения «Табы» → T01, T03, T04 |
| R03 | «примени это все что нашел» | in-ticket | приложение п.3: официальный Badge (icon/count/onRemove) — StatusBadge и потребители не меняются | spec История 6 → T01, T04 |
| R04 | «примени это все что нашел» | in-ticket | приложение п.4: официальный Delete Button со встроенным confirm; reject-контракт сохранён, window.confirm из useEstimateCrud убран | spec История 7, Решения «DeleteButton» → T01 |
| R05 | «примени это все что нашел» | in-ticket | приложение п.5: полный Date Range Picker (календарь с превью + пресеты) в EstimateHistory — реальный сайт использования; пользователь «ок» (недоделанный с прошлой сборки) и «добавь» (Analytics получает опцию «Произвольный период» этим же календарём) | spec Истории 8, 8a → T01, T03 |
| R06 | «примени это все что нашел» | in-ticket | приложение п.6: Timeline — степпер SmartEstimateWizard (моб+деск, эмодзи→иконки); в HouseCalculator степпера нет | spec История 9 → T04 |
| R07 | «примени это все что нашел» | in-ticket | приложение п.7: Command Palette — Ctrl/Cmd+K + кнопка в Header; поиск смет, новая смета, навигация 9 разделов; lazy | spec Истории 10–13, Решения «Command Palette» → T05 |
| R08 | «примени это все что нашел» | in-ticket | приложение п.8: Context Menu — ПКМ на заголовке раздела редактора и строке истории; действия существующие; desktop-only | spec Истории 14–15 → T01, T03, T04 |
| R09 | «примени это все что нашел» | in-ticket | приложение п.9: Copy Button — номер сметы (EstimateDuplicateDialog) + «Копировать список позиций» тулбара (services/estimateClipboard.ts + тест) | spec Истории 16–17 → T01, T02, T04 |
| R10 | «примени это все что нашел» | in-ticket | приложение п.10: island-визуал SyncToast и UpdateBanner; состояние/таймеры App не переписываются | spec Истории 18–19 → T01, T02 |
| R11 | «примени это все что нашел» | in-ticket | приложение п.11: KPI Chart — 5 KPI-карточек overview в Analytics; recharts не тронут | spec Истории 20–21 → T03 |
| R12 | «примени это все что нашел» | in-ticket | приложение п.12: Switch — реальные boolean-переключатели (Cutting separateStages, HouseCalculator additions если чекбоксы); в ProfileModal чекбоксов нет | spec История 22 → T01, T04 |
| R13 | «примени это все что нашел» | in-ticket | приложение п.13: File Upload dropzone — импорт EstimateHistory (вместо динамического input) + EstimateTransferModal; dataTransfer.ts не меняется | spec Истории 23–24 → T01, T03 |
| R14 | «примени это все что нашел» | in-ticket | приложение п.14: лендинг — Magnetic «Начать работу», Flip «Войти в систему», Contact Lens VK/TG/YT (клик = переход) | spec Истории 25–26 → T02 |
| R15 | «примени это все что нашел» | in-ticket | приложение п.15: Slider — площадь HouseCalculator:438 (реальная точка; в PdfStyleModal/Cutting слайдеров нет) | spec История 27 → T01, T04 |
