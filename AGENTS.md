# Project rules

- A small visual or copy change in the React UI needs code and diff inspection only. Do not automatically start Vite, Electron, Playwright, lint, test or build; the user may verify it manually.
- Treat estimates/calculations, local persistence, Supabase, import/export, PDF/DOCX/XLSX output and Electron main-process changes as behaviour changes with a focused check.
- Run `npm run test` for changed calculation or service behaviour; run Electron E2E only for a changed desktop integration flow. Use a build only when the change affects packaging, Vite config or release behaviour.
- Do not expose Supabase credentials or local persisted user data in logs or reports.

<!-- autopilot:start -->
# Как здесь работать (поддерживает Autopilot; применено 2026-11-22 по решению пользователя)

## Команды

| Команда | Что делает |
|---------|------------|
| `npm install` | Установить зависимости (один раз) |
| `npm run test` | Весь юнит-набор (`vitest run --exclude "e2e/**"`); обязателен при изменении расчётов/сервисов (правило выше) |
| `npx vitest run services/<файл>.test.ts` | Один тестовый файл |
| `npm run lint` | ESLint (`eslint.config.mjs`) |
| `npm run dev` | Vite на http://localhost:3000 (порт задан в `vite.config.ts`) |

Electron E2E (`npm run test:e2e:electron`, конфиг `playwright.electron.config.ts`, спека `e2e/offline-electron.spec.ts`) — запускать только при изменении desktop-потока (правило выше).

## Где что

- Точка входа `index.tsx` → `App.tsx` в корне (один оркестратор); общие типы и `safeNumber` — `types.ts`.
- Состояние — `contexts/`: EstimateContext, CatalogContext, EstimateSectionsContext, SyncContext, SubscriptionContext.
- Логика — `services/`: чистые функции, тест `*.test.ts` рядом; деньгами смет владеет `services/estimatePricing.ts` — единственная точка итога `calculateEstimateTotal`, инвариант «сумма сметы = Σ item.total».
- UI — `components/` (файл на экран/модалку); редактор смет `components/EstimateEditor.tsx`, вставка из другой сметы `components/PasteFromEstimateModal.tsx`, Wiki — `components/Wiki/`.
- Хуки — `hooks/`: `useEstimateCrud.ts` (все записи таблицы estimates), `useOfflineSync.ts`, `useMediaQuery.ts`.
- Офлайн-слой: очередь `services/offlineQueue.ts`, процессинг и события `services/offlineSync.ts`, кэш `services/indexedDbCache.ts`, клиент `services/supabase.ts`; событие `kmobn:cache-update` диспатчат offlineSync и database.ts, потребитель — `handleCacheUpdate` в App.tsx.
- Desktop: main-процесс `electron/main.ts` + `electron/preload.ts`; Electron E2E — `e2e/offline-electron.spec.ts` с mock-сервером `e2e/mockSupabaseServer.ts`.
- Серверное: `api/` (ai-chat, webhook, payments), RPC-контракт — `supabase/migrations` (формат экспорта и RPC-сигнатуры не менять без задачи).

## Подводные камни

- Событие `kmobn:cache-update` бывает двух видов: полный снимок таблицы или частичное (`detail.partial: true` — в data только изменённые записи; диспатчат только ветки confirmedRecord/rebaseAfterConfirmation в `services/offlineSync.ts`); потребитель обязан мерджить по id (`mergePartialRecordsById` в App.tsx), а не заменять список.
- Импортируемые записи всегда чистить `stripImportedServiceFields` (`services/database.ts`): снимает baseDocument/operationId/syncConflict, serverRevision → 0 — иначе запись уедет в конфликт ревизий.
- Числовые инпуты редактора (quantity/price) держат строку-черновик `numericDrafts` (`components/EstimateEditor.tsx`) и парсят `safeNumber` (`types.ts`) на blur/Enter; programmatic-пути (updateItemFields, бандлы, вставка) передают числа напрямую — не смешивать. Пуш черновика в App — дебаунс 300 мс со сбросом на blur/unmount.
- Записи таблицы estimates сериализованы через `mutationQueueRef` (`hooks/useEstimateCrud.ts`, единая цепочка save+archive) — новые сценарии записи втыкать в эту же очередь, не параллелить.
- Хэши сравнения — `fingerprintData`/`memoizedFingerprint` (`services/hashing.ts`); поле `hash` в IndexedDB — компактный fingerprint; `duplicateManagement` — полный `hashData` (дедупликация без коллизий).
- В списке и редакторе смет монтируется один DOM-вариант (хук `hooks/useMediaQuery.ts`, порог 768px) — новые блоки добавлять в обе ветки или учитывать только активную.

## Окружение

- `.env`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — только имена переменных; значения не выводить в логи/коммиты/отчёты. Тот же ключ нужен в `.env.electron-e2e` для Electron E2E. При пустых значениях клиент в `services/supabase.ts` не создаётся (warn в консоли, `isSupabaseConfigured()` = false) — приложение продолжает работать локально.

## Как здесь работает Autopilot

Сборка ведётся навыком `/autopilot`. Требования, спецификация и таски — в `.autopilot/`.
Прогресс — `.autopilot/PROGRESS.md`. Требование из `manifest.md` может снять
только пользователь. Прерванную сборку продолжает «продолжи автопилот».
Python на этой машине нет — `ap.py`/дашборд недоступны, статусы ведутся в файлах прогона (`ledger.md`, `manifest.md`).

### Правка без автопилота

Мелкий баг или доводка после сборки — обычная сессия, без прогона.

Сначала прочитай:
1. `.autopilot/PROGRESS.md` — что не доделано, известные баги, о чём договорились с пользователем.
2. Что правили после последней сборки — первая строка таблицы в «История git».
3. Только если правка их касается: почему сделано так — `docs/adr/`; что значат слова — `CONTEXT.md`;
   что именно просили — `manifest.md` в папке сборки (указана в начале `PROGRESS.md`).

После правки:
- коммит — по правилам из «История git»;
- строка в «Правки без автопилота» в `PROGRESS.md`: дата — что — почему;
- починенный пункт из «Не доделано» или «Известные баги» — удали;
- договорились с пользователем о том, что следующая сборка не должна пересматривать, —
  строка в «Договорились», его словами.

### История git

Целиком не читай — бери срез под вопрос:

| Вопрос | Команда |
|---|---|
| что правили после последней сборки | `git log --oneline "$(git log -1 --format=%h --grep='^Autopilot: сборка сдана')"..HEAD -- . ':(exclude).autopilot'` |
| всё, что делали ради требования | `git log --oneline --grep="R02"` |
| история файла | `git log --oneline -10 -- <файл>` |
| когда появился или исчез код | `git log --oneline -S "<фрагмент>"` |
| почему строка такая | `git blame -L <с>,<по> <файл>`, затем `git show <sha>` |
| что внутри коммита | `git show --stat <sha>` |

Коммит: заголовок — что (`fix: даты в одном формате`), тело — почему, трейлер
`--trailer "Requirements: R02"`, если правка касается требования из `manifest.md`.
Заголовок `Autopilot: сборка сдана` пишет только автопилот — по нему находят последнюю сборку.
<!-- autopilot:end -->

