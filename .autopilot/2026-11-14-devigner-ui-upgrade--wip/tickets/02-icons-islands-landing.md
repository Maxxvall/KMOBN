# 02 — Иконки легаси, островки SyncToast/UpdateBanner, лендинг

**Требования:** R01.1 (ProfileModal, Wiki×3, диалоги дублей, Login, LandingPage-бренды), R01.2, R10.1, R10.2, R14.1, R14.2, R09.2 (копикнопки в диалогах дублей)
**Зависит от:** 01
**Зона:** `components/ProfileModal.tsx` · `components/Wiki/` · `components/DuplicateCheckerDialog.tsx` · `components/EstimateDuplicateDialog.tsx` · `components/Login.tsx` · `components/SyncToast.tsx` · `components/UpdateBanner.tsx` · `components/LandingPage.tsx`
**Волна:** 2
**Ревью:** нет
**Модель:** обычная

## Что должно заработать

В профиле, Wiki, диалогах дублей и лендинге иконки — из одного пакета. Статус сохранения
и баннер обновления выглядят как плавающие «островки»: пилюля раскрывается в панель
с прогрессом. На лендинге CTA-кнопки притягиваются к курсору и переворачиваются,
соцсети — светящаяся контактная строка. Номер сметы и позиции каталога копируются
кнопкой с зелёной фазой.

## Из брифа, дословно

> п.1: «иконки так же где то поменять… в `SyncToast.tsx` текстовые „иконки" `✓ ! i ✕` →
> нормальные иконки»; п.10: «плавающая пилюля „Сохранено / Ошибка / Обновление 45%"»;
> п.14: «CTA-кнопки и строка контактов → **Magnetic Button**, **Flip Button**,
> **Contact Lens**»; п.9: «копирование… ID из `DuplicateCheckerDialog`/`EstimateDuplicateDialog`»

## Разделы спецификации

Истории 2, 18, 19, 25, 26, 17 (диалоговая часть); Решения «Иконки», «Island», «Copy»; interfaces.md — контракты SyncToast (duration=0, таймеры App) и UpdateBanner (progressbar, onDismiss).

## Критерии приёмки

- [ ] В ProfileModal, WikiAIChat, WikiArticle, Wiki/index, DuplicateCheckerDialog, EstimateDuplicateDialog нет иконочных inline-SVG (спиннеры/крестик — иконки пакета с `animate-spin` где было)
- [ ] Google-логотип в Login и бренды VK/TG/YT — иконки пакета, если есть; иначе остаются inline с комментарием-причиной
- [ ] SyncToast — визуал `ui/island.tsx`: пилюля «Сохранение…/Сохранено ЧЧ:ММ/Ошибка», иконки пакета вместо `✓ ! i ✕`; legacy-toast — та же пилюля с раскрытием; `duration=0` не исчезает сам; React.memo и таймеры App не тронуты
- [ ] UpdateBanner — островок: пилюля → раскрытие; `role="progressbar"` с aria-значениями сохранён; onDismiss при скачивании продолжает загрузку; обе inline-SVG заменены
- [ ] LandingPage: «Начать работу» — Magnetic, «Войти в систему» — Flip, блок соцсетей — Contact Lens (клик = переход в новой вкладке, aria-label прежние); тексты не изменились
- [ ] Копикнопки: у «Смета №{estimateNumber}» (EstimateDuplicateDialog) и у группы каталога (DuplicateCheckerDialog, формат из `estimateClipboard`)
- [ ] `npm run check` зелёный
