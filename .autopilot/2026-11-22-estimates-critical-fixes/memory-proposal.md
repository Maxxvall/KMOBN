# memory-proposal — 2026-11-22, прогон estimates-critical-fixes, тир T0

`AGENTS.md` — файл пользователя, не изменялся. Ниже — готовые к вставке строки (раздел «Что вставить») и разбор самого файла (что не хватает, что неверно). Все пути и символы проверены по коду на эту дату; команды — проверенные (прогнаны другим агентом).

## Что вставить в AGENTS.md

### Команды

- `npm install` — один раз.
- `npm run test` — весь юнит-набор (`vitest run --exclude "e2e/**"`, 48 файлов / 303 теста); обязателен при изменении расчётов/сервисов (правило выше).
- `npx vitest run services/<файл>.test.ts` — один тестовый файл.
- `npm run lint` — ESLint (конфиг `eslint.config.mjs`; те же гейты, что у команды lint в package.json).
- `npm run dev` — Vite на http://localhost:3000 (порт задан в `vite.config.ts`).

### Где что

- Точка входа `index.tsx` → `App.tsx` в корне (один оркестратор, ~2400 строк); общие типы и `safeNumber` — `types.ts`.
- Состояние — `contexts/`: EstimateContext, CatalogContext, EstimateSectionsContext, SyncContext, SubscriptionContext.
- Логика — `services/`: чистые функции, тест `*.test.ts` рядом; деньгами смет владеет `services/estimatePricing.ts` — единственная точка итога `calculateEstimateTotal`, инвариант «сумма сметы = Σ item.total».
- UI — `components/` (файл на экран/модалку); редактор смет `components/EstimateEditor.tsx`, вставка из другой сметы `components/PasteFromEstimateModal.tsx`, Wiki — `components/Wiki/`.
- Хуки — `hooks/`: `useEstimateCrud.ts` (все записи таблицы estimates), `useOfflineSync.ts`, `useDebouncedSave.ts`.
- Офлайн-слой: очередь `services/offlineQueue.ts`, процессинг и события `services/offlineSync.ts`, кэш `services/indexedDbCache.ts`, клиент `services/supabase.ts`; событие `kmobn:cache-update` диспатчат offlineSync и database.ts, потребитель — `handleCacheUpdate` в App.tsx.
- Desktop: main-процесс `electron/main.ts` + `electron/preload.ts`; Electron E2E — `e2e/offline-electron.spec.ts` с mock-сервером `e2e/mockSupabaseServer.ts`, конфиг `playwright.electron.config.ts`.
- Серверное: `api/` (ai-chat, webhook, payments), RPC-контракт — `supabase/migrations` (формат экспорта и RPC-сигнатуры не менять без задачи).

### Подводные камни

- Событие `kmobn:cache-update` бывает двух видов: полный снимок таблицы или частичное (`detail.partial: true` — в data только изменённые записи; диспатчат только ветки confirmedRecord/rebaseAfterConfirmation в `services/offlineSync.ts` ~:180/:205); потребитель обязан мерджить по id (`mergePartialRecordsById` в App.tsx), а не заменять список.
- Импортируемые записи всегда чистить `stripImportedServiceFields` (`services/database.ts:773`): снимает baseDocument/operationId/syncConflict, serverRevision → 0 — иначе запись уедет в конфликт ревизий.
- Числовые инпуты редактора (quantity/price) держат строку-черновик `numericDrafts` (`components/EstimateEditor.tsx:340`) и парсят `safeNumber` (`types.ts:355`) на blur/Enter; programmatic-пути (updateItemFields, бандлы, вставка) передают числа напрямую — не смешивать.
- Записи таблицы estimates сериализованы через `mutationQueueRef` (`hooks/useEstimateCrud.ts:58`, единая цепочка save+archive) — новые сценарии записи втыкать в эту же очередь, не параллелить.
- `npm run build` для логических правок не нужен (правило выше) — сборка только при затрагивании упаковки, Vite config или release-поведения.

### Окружение

- `.env`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — только имена переменных; значения не выводить в логи/коммиты/отчёты. Тот же ключ нужен в `.env.electron-e2e` для Electron E2E. При пустых значениях клиент в `services/supabase.ts` не создаётся (warn в консоли, `isSupabaseConfigured()` = false) — приложение продолжает работать локально.

### Тир сборки

- T0.

### Правка без автопилота

- Обычная сессия: перед правкой прочитать `.autopilot/PROGRESS.md` (если файла нет — автопилот ещё не прогонялся), там состояние последнего прогона: что сделано, что в работе.
- После правки оставить одну строку в разделе «Правки без автопилота» ниже: дата, файлы, суть. Без секретов и пользовательских данных.

### Правки без автопилота

- (записи добавляются вручную; формат: `YYYY-MM-DD — <файлы> — <суть>`)

### История git

| Хочу узнать | Команда |
|---|---|
| Что правили после последней сданной сборки | `git log --oneline "$(git log -1 --format=%h --grep='^Autopilot: сборка сдана')"..HEAD -- . ':(exclude).autopilot'` |
| История одного файла | `git log --oneline -10 -- <файл>` |
| Найти коммит по требованию | `git log --oneline --grep="R02"` |
| Что внутри коммита | `git show --stat <sha>` |

- Оформление коммитов: заголовок — «что», тело — «почему», трейлер: `git commit --trailer "Requirements: R02"` (образец в истории: 48e0dcd — `Requirements: R01…R09i` + `Autopilot-Run:`).
- Заголовок «Autopilot: сборка сдана» ставит только автопилот; обычным сессиям такой заголовок не писать.
- Пока коммита «сборка сдана» нет, первая строка таблицы даёт пустой вывод (`..HEAD` деградирует в HEAD..HEAD). До первого такого коммита граница — последний коммит с префиксом «Autopilot:»: `git log --oneline "$(git log -1 --format=%h --grep='^Autopilot:')"..HEAD -- . ':(exclude).autopilot'` (проверено: выводит коммиты текущего прогона).

## Разбор AGENTS.md

### Чего не хватает

- Команд: в файле нет ни одной — весь блок «Команды» вставить целиком.
- Указателей на код: новый агент начинает с разведки; блок «Где что» закрывает вход, сервисы, офлайн, расчёты.
- Ловушек: partial-события, stripImportedServiceFields, numericDrafts/safeNumber, mutationQueueRef — каждое уже определяло поведение правок в этом прогоне.
- Окружения: имена переменных Supabase нигде не зафиксированы.
- Истории git и правила правки без автопилота — обязательные подразделы выше.
- Файл требует Electron E2E при изменении desktop-потока, но команды не даёт: в package.json это `npm run test:e2e:electron`, конфиг `playwright.electron.config.ts`, спека `e2e/offline-electron.spec.ts`. В этот тир команда не прогонялась — вставлять в «Команды» только после первого реального прогона.

### Что неверно / устарело

- Ничего: все четыре правила соответствуют текущему коду. Проверено: `e2e/` и `electron/` существуют; PDF/DOCX/XLSX-вывод — `services/pdfGenerator.ts`, `services/pdfGenerator2.ts`, `services/premiumPdf.ts`, `services/houseProposalDocx.ts`, зависимость xlsx в package.json; `npm run test` в package.json ровно `vitest run --exclude "e2e/**"` — формулировка правила совпадает с фактическим скриптом.
- Одно уточнение к новому правилу «Правка без автопилота»: `.autopilot/PROGRESS.md` в репозитории сейчас нет (создаётся в ходе прогона автопилота), поэтому в формулировку включено «если файла нет — прогона ещё не было».
