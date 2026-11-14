# F2 — Ремонт приёмки: табы в EstimateSectionsSettings

**Требования:** R02
**Зависит от:** —
**Зона:** `components/estimate-editor/EstimateSectionsSettings.tsx`
**Волна:** 5
**Ревью:** да — ремонт ветки
**Модель:** сильная

## Что должно заработать

Третий и последний tablist — «Активные/Архив» в настройках разделов — на едином
компоненте табов со скользящим пиллом и клавиатурой, как в истории и раскрое.

## Из брифа, дословно

> п.2: «**Tabs** — один компонент вместо 3 hand-rolled реализаций (EstimateHistory,
> EstimateSectionsSettings, Cutting)»

## Разделы спецификации

Истории 4–5; находка слепой приёмки G4 (дословно): «в EstimateSectionsSettings.tsx:165-167
старый hand-rolled tablist „Активные/Архив" остался».

## Критерии приёмки

- [ ] `components/estimate-editor/EstimateSectionsSettings.tsx` (~165) — tablist переведён на `ui/tabs.tsx`: `role="tablist"` + `aria-selected`, клавиатура ←/→/Home/End, скользящий пилл; табы `'active'`/`'archive'`, state `tab` прежний; `disabled={Boolean(orderDraft)}` сохранён; min-h целей 44/36
- [ ] `npm run check` зелёный (typecheck + lint 0/0 + vitest 424+)
