# Предложение для памяти

- Перед мелкой правкой читать `.autopilot/PROGRESS.md`: там договорённости, оставшиеся пункты и известные ошибки последнего прогона.
- Для порядка разделов различать per-estimate `sectionSnapshot` и account registry: новый порядок сметы задавать через `setEstimateSectionOrder`; `reorderEstimateSections` меняет общий реестр аккаунта. Реестр остаётся источником legacy fallback.
- Жест переноса живёт в `components/estimate-editor/sectionReorderGesture.ts` (таймер/состояние) и `components/estimate-editor/useSectionReorder.ts` (DOM events, pointer/touch, cleanup); не искать и не реализовывать его внутри списка карточек.
- Правка без автопилота: после правки обновить «Правки без автопилота» в `.autopilot/PROGRESS.md`; исправленный старый баг убрать из его списка. Правила проверок остаются в AGENTS.md.
- История git: последняя сдача находится через `git log -1 --oneline --grep='^Autopilot: сборка сдана'`; изменения требования — через `git log --oneline --grep='Requirements:.*R02'`. В новых коммитах указывать Requirements, когда правка относится к манифесту прогона.
