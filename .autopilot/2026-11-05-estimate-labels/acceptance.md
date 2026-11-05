# Независимая приёмка

Код `2848de5`: блокирующих расхождений с полным brief нет; 23 продуктовых требования покрыты.

- До двух меток на смету, AND-фильтр только текущих, CRUD своих и постоянная системная метка.
- Старые сметы без автоматической разметки; версии сохраняют метки, отдельные копии и черновик калькулятора пусты.
- Все источники дома ограничены последними пригодными типовыми независимо от статуса/возраста; нет источников — понятное сообщение.
- Офлайн CRUD/reopen/assignments/import/tombstones подтверждены публичными тестами. Package version 1.9.1, installer проверен отдельно.
- Чистый clone `C:/Users/ADMINI~1/AppData/Local/Temp/KMSmeta-accept-7d70cb07aa`; checkout и clean status подтверждены, node_modules через junction, env не читался/не копировался.
- `npm run test -- services/estimateLabels.test.ts services/estimateSections.test.ts services/database.offline.test.ts services/dataTransfer.test.ts services/houseCalculator.test.ts services/estimateLifecycle.test.ts components/estimateEditorSignature.test.ts`: exit 0, 7 files / 109 tests passed.

UI wiring проверен по коду, визуальный UI/live cloud/fresh install не проверялись. Первый агент не дал результата из-за внешнего HTTP 403; его попытка evidence не является. Remote delivery отдельно проверяет координатор.
