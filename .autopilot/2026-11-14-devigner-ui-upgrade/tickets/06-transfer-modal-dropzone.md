# 06 — Dropzone в EstimateTransferModal

**Требования:** R13.1
**Зависит от:** 01
**Зона:** `components/EstimateTransferModal.tsx`
**Волна:** 3
**Ревью:** нет
**Модель:** обычная

## Что должно заработать

В модалке передачи/приёма сметы файл выбирается перетаскиванием в dropzone с карточкой
статуса (имя/размер/ошибка) вместо невидимого input; вставка JSON в textarea остаётся.

## Из брифа, дословно

> п.13: «**File Upload** — импорт смет/данных (dataTransfer): dropzone с карточками очереди»

## Разделы спецификации

История 23 (часть про EstimateTransferModal:159), Решения «File Upload», «Коррекция предпосылок».

## Критерии приёмки

- [ ] `<input type="file">` (:159) заменён на `ui/file-upload.tsx` (FileDropzone): drag-n-drop и клик, accept `.json,application/json`
- [ ] Ошибка чтения/парсинга — текст в карточке, не alert
- [ ] textarea, `createEstimateTransfer`/`parseEstimateTransfer` и пропсы модалки не изменены
- [ ] `npm run check` зелёный
