# F2 — Ремонт приёмки: итог мастера смарт-сметы по единой формуле

**Требования:** R02
**Зависит от:** —
**Зона:** `components/SmartEstimateWizard.tsx` · `components/PasteFromEstimateModal.tsx`
**Волна:** 3
**Ревью:** нет (закрывается повторной слепой приёмкой)
**Модель:** обычная

## Что должно заработать

«Одна функция расчёта на весь проект» доведена до конца: ни одного места, где итог сметы/превью считается второй формулой Σ(quantity×price). Подтверждение мастера смарт-сметы и предпросмотр вставки считают через общий экспорт `calculateEstimateTotal` из `services/estimatePricing.ts`.

## Расхождение слепой приёмки (дословно)

> **Частично** | Единая `calculateEstimateTotal` — `services/estimatePricing.ts:5-6`; редактор использует её во всех 10 точках мутаций… Но **не буквально «одна функция на весь проект»**: `components/SmartEstimateWizard.tsx:152` при подтверждении мастера всё ещё пишет `estimate.total` локально как Σ quantity×price (а в строках total округлённый — тот же класс расхождения в копейках), и предпросмотр в модалке (`PasteFromEstimateModal.tsx:74`) — display-only Σ quantity×price.

## Разделы спецификации

§Решение пункт 2 (R02: единый источник Σ item.total; инвариант item.total = quantity × price).

## Критерии приёмки

- [ ] В SmartEstimateWizard при подтверждении итог считается через `calculateEstimateTotal` (локальной Σ quantity×price нет)
- [ ] В PasteFromEstimateModal предпросмотр-сумма считается через `calculateEstimateTotal`
- [ ] grep подтверждает: в components/ нет оставшихся локальных расчётов итога сметы формулой Σ quantity×price (fallback `it.total || it.quantity*it.price` в отображении подгрупп — не считается: это отображение строки, не итог сметы)
- [ ] `npm run test` полностью зелёный, `npm run lint` без новых ошибок
