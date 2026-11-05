# Проверки

## Разработка — финальный код исполнителя

- `npm run check`: exit 0; frontend и Electron typecheck PASS; lint 0 errors / 6 прежних warnings; 56 test files / 394 tests passed. Неизменный код повторно полным набором не проверяется.
- Первый итоговый check: exit 1, 393 passed / 1 failed. Старый fixture houseCalculationSnapshot не имел обязательной метки источника; fixture исправлен, поведение snapshot сохранено, итоговый check выше зелёный.
- `git diff --check`: whitespace errors нет.
- Impeccable detector по 8 изменённым TSX выполнен один раз: exit 1, один прежний warning App.tsx:2167 (indigo gradient вне задачи), новых замечаний нет.

## Значимые RED → GREEN

- Нормализация и legacy save документа настроек теряли labels/tombstones; теперь сохранение, повторное открытие и merge защищены.
- Labels-only change не менял dirty signature; теперь меняет, перестановка ID не меняет.
- Калькулятор выбирал обычную согласованную смету вместо старого отмеченного черновика; теперь источники ограничены системным ID.
- Restore экспорта только смет не восстанавливал определения; теперь snapshots переносятся с приоритетом актуального справочника и tombstones.
- Документ прошлого аккаунта мог записаться новому owner; теперь отклоняется до записи очереди.

## Ограничения

- Локальный браузер отключён настройками Work; визуальная раскладка и физическое взаимодействие не проверены.
- Live пользовательские хранилища и Supabase не использовались; persistence проверялся изолированно.
- Vite, Electron, Playwright, build и E2E не запускались: desktop integration и packaging не менялись.
- Независимые ревью и приёмка записываются по фактическим результатам после выполнения.

## Ремонт по независимому ревью

- Code commit `2aea9cc`: два условия F1 закрыты; повторный независимый reviewer проверил только diff ремонта и не нашёл новых блокирующих поломок.
- `npm run check`: exit 0, frontend/Electron types PASS, lint 0 errors / 6 прежних warnings, 56 files / 397 tests passed.
- Адресно estimateLabels/dataTransfer/database: 3 files / 28 tests passed, exit 0.
- Public importData RED → GREEN: до фикса Bath + «  BATH  » разрешались; после — понятный отказ, сохранённый export и вся offlineQueue неизменны. Дополнительные snapshots/local canonical checks зелёные; отдельный RED для них не заявляется.
- App guard принимает cache-update только своего owner; проверен кодом и типизацией, без UI runtime.

## Дополнительная офлайн-приёмка и версия

- Ticket03 добавил один characterization lifecycle-test в существующий fake-IndexedDB offline harness; продуктовый код не менялся.
- Local save/reopen назначения, rename со стабильным ID, удаление/tombstone после reopen и stale estimate, assignments и первоначальная base в очереди — проверены.
- 6 адресных suites / 52 tests passed, exit 0; eslint нового test-файла exit 0; typecheck exit 0; diff check exit 0.
- Metadata и lockfile повышены до 1.9.1 без изменений зависимостей, commit `2848de5`. Windows build `npm run build:electron:win -- --publish never` завершён с exit 0.
- Установщик: `release/Setup.1.9.1.exe`, 114495492 bytes, FileVersion/ProductVersion 1.9.1. SHA256 `4A58E9AC06710EF681F43CCA65EAABF5B90A1100DE18FFB97C3D6EE4BF671F1E`. Файл не запускался и не устанавливался.
- `release/latest.yml`: version 1.9.1, 327 bytes; blockmap 120830 bytes. Generated outputs ignored, внешняя публикация не выполнялась.
- Полный набор неизменного кода повторно не запускался; итоговый CI evidence — 397 tests, новый офлайн-тест покрыт адресным прогоном 52 tests.

## Независимая приёмка и отправка

- Повторный независимый агент подтвердил полный brief без spec/manifest/tickets; блокирующих расхождений нет. Чистый clone: 7 files / 109 tests, exit 0; команда и ограничения в acceptance.md. Первая попытка агента завершилась внешним HTTP 403 без результата и evidence не считается.
- После сетевого сбоя пользователь временно оставил результат локально, затем явно возобновил push. Сеть восстановлена; GitHub HTTP 200 и push permission подтверждены.
- В локальном менеджере два аккаунта; для команды явно выбран существующий Maxxvall, без новых credentials/глобальной перенастройки.
- `git -c credential.https://github.com.username=Maxxvall push origin main`: exit 0, origin/main `271a1b9..2848de5`. Документация отправляется отдельно после landing.
