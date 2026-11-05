# Предложение для памяти проекта

Пользовательский `AGENTS.md` не изменялся. Это необязательные указатели, применение не требуется.

- `EstimateSectionsDocument.labels` — канонический справочник; сохраняй tombstones `deleted: true` при normalize/merge/offline conflict, иначе отложенная офлайн-запись может воскресить удалённый ID (`services/estimateSections.ts`, `services/database.offline.test.ts`).
- `Estimate.labelIds` — назначения по стабильным ID; `labelSnapshots` — переносной fallback, не источник истины при известном справочнике (`services/estimateLabels.ts`, `services/dataTransfer.ts`).
- Backup/restore объединяет переносимые определения с локальным справочником; Share import очищает назначения/частный справочник. Проверяй оба пути при изменении формата переноса (`services/dataTransfer.ts`).
- Текущие договорённости и незавершённую работу смотри в `.autopilot/PROGRESS.md`; обычный fix может обновить этот файл. Историю читай ограниченно по нужному файлу/срезу, например `git log -5 -- services/estimateLabels.ts`.
