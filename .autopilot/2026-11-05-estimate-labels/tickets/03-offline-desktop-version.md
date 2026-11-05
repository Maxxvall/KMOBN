# 03 — Офлайн-приёмка и ПК-версия 1.9.1

**Требования:** G12, G13
**Зависит от:** 01, F1
**Зона:** `package.json` · `package-lock.json` · `services/estimateLabels.test.ts` · `services/database.test.ts` · `services/database.offline.test.ts` · `services/offlineQueue.test.ts` · `services/offlineSync.test.ts` · `services/estimateSections.test.ts`
**Волна:** 3
**Ревью:** нет — версия и существующий packaging flow, продуктовая функция уже отдельно рассмотрена
**Модель:** обычная

## Что должно заработать

Офлайн-работа меток подтверждена через изолированное локальное хранилище и существующую очередь/merge; текущая ПК-версия 1.9.1 собрана в установщик Windows без внешней публикации.

## Из брифа, дословно

> «Так же офлайн , что бы все продуманно было, и потом в конце ещё версию пк подыми»

## Разделы спецификации

spec.md §7, interfaces.md (включая поздние дополнения), notes.md. Read prompts/executor.md, ub-mode и ponytail; tdd только если действительно отсутствует нужное покрытие, не писать зеркальные тесты ради повторения процесса.

## Критерии приёмки

- [ ] Подтверждены offline CRUD/назначение меток и reopen после локального save, отсутствие возврата удалённого ID, корректная очередь и base/merge при синхронизации. Использовать существующие meaningful tests и добавлять только отсутствующую защиту. Пользовательские хранилища/credentials не читать.
- [ ] В package.json и package-lock.json версия ровно 1.9.1; зависимости не меняются, release workflow/version display используют обычную версию проекта.
- [ ] `npm run build:electron:win -- --publish never` или эквивалентное существующее безопасное разбиение команды завершается с настоящим exit 0; installer 1.9.1 существует, его размер/путь/SHA256 известны.
- [ ] Установщик не запускается и не устанавливается; GitHub Release/тег/внешняя публикация отсутствуют. Generated dist/release не добавляются в git.

## Проверки и ограничения

На 6bf4f1a было 394 tests/checkgreen; после F1 — 397 tests/checkgreen. У неизменного feature-кода full suite не повторять. Для version-only packaging достаточно installer build и адресных offline tests по явному риску. Если добавлен новый service test или код — соответствующая адресная проверка; менять product code вне зоны без возврата BLOCKED нельзя. Не использовать npm version с git-tag по умолчанию; не запускать Vite dev/E2E/Playwright/реальный installer. Не менять .autopilot, AGENTS, .env, SQL. Не коммитить/пушить. Вернуть краткий контракт с артефактом и точными проверками.

