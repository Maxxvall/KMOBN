# 02 — Доводка: семантические фиксы известных багов

**Требования:** R35, R36, R37, R38, R39, R40, R41, R44
**Зависит от:** —
**Зона:** `components/EstimateEditor.tsx` · `components/estimate-editor/` · `hooks/useEstimateCrud.ts` · `App.tsx` · `services/premiumPdf.ts` · `services/documentExport.ts` · `components/Header.tsx`
**Волна:** 1
**Ревью:** нет (ревью ветки после)
**Модель:** обычная

## Что должно заработать

Отмена удаления шаблона больше не мигает зелёной галочкой успеха. «Пояснения» связаны aria в обоих состояниях. Стили полей редактора — один рецепт без визуальных изменений. Линт чист от exhaustive-deps. Сбой перечитывания кэша не ругается «Не удалось сохранить». Мёртвый max-w редактора убран. Premium-пайплайн PDF живёт в premiumPdf. «Выйти» согласована в шапке и drawer.

## Из брифа, дословно

> «а вот по этому можно более подробно провести аудит и исправить проблема?»

## Разделы спецификации

Истории 38-44, 47; диагнозы — `notes.md` §4 (пункты 1-7, 10, с точными координатами).

## Критерии приёмки

- [ ] `useEstimateCrud.ts:301`: при отмене `window.confirm` обработчик ОТКЛОНЯЕТСЯ (`throw new Error('cancelled')` до try) → `delete-button.tsx:38-43` не проходит в `.then`, `setPhase('idle')`; на реальном удалении галочка «done» остаётся
- [ ] `EstimateExplanation.tsx`: textarea `id="estimate-explanation-field"`; свёрнутая кнопка `aria-controls="estimate-explanation-field"`; развёрнутая подпись «Пояснение для расчёта дома» — кнопка с `aria-expanded={true}`, `aria-controls` и `onClick` свернуть
- [ ] 6 инлайн-копий классов мобильной таблицы (EstimateEditor 1953-2003) сведены к локальной `const mobileFieldStyles = inputStyles + " min-h-[44px] text-sm md:min-h-9"`; видимые классы НЕ изменились (focus-цвета не появились там, где их не было); shared.ts наружу estimate-editor не экспортируется
- [ ] `setEstimate` добавлен в массивы зависимостей useCallback на строках 445, 874, 1066, 1171, 1184, 1208; `npm run lint` — 0 warnings exhaustive-deps; поведение идентичное (все шесть используют функциональный setState или уже имеют deps)
- [ ] `persistSectionsDocument` (App.tsx:1890-1911): перечитывание кэша в собственном try с фолбэком `stored = next`; сбой `loadEstimateSections` после успешного `saveEstimateSections` НЕ выставляет «Не удалось сохранить»
- [ ] `EstimateEditor.tsx:1383`: `max-w-[1600px]` убран (остаётся `mx-auto space-y-4`)
- [ ] `services/premiumPdf.ts`: экспорт `generatePremiumEstimatePdf(estimate, materials = [], title?)` — построчно тело из documentExport.ts:12-27; `documentExport.exportEstimatePdfColored` делегирует; СВОЯ сигнатура неизменна
- [ ] `Header.tsx`: константа `LOGOUT_HOVER = 'text-text-secondary hover:bg-red-500/10 hover:text-red-300 focus:ring-2 focus:ring-primary'` подмешана в обе кнопки «Выйти» (xl+ :232-241 и drawer :381-388, layout-специфику оставить локально); `aria-label="Выйти"` снят с xl+-кнопки

## Ограничения исполнителя

- Не трогать: components/SmartEstimateWizard.tsx (зона 03), components/Analytics.tsx (R42 вне рамок — не баг), всё вне зоны.
- НЕ запускать vite/electron/playwright/сборку; проверка — `npm run check`.
- НЕ коммитить (коммитит оркестратор).
- Тесты на п.1/п.5 (компонентная логика App/хуков) — known gap, vitest node-env компоненты не покрывает; компенсируется ревью ветки.
