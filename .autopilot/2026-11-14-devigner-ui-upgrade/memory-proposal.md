# Предложение для AGENTS.md пользователя (AGENTS.md не трогать — вставить вручную)

Каждый пункт — готовая к вставке строка. Основание каждой — в коде (файл указан).

## В раздел «Где что» добавить:

- `- docs/architecture.md — архитектура: data flow, границы модулей, конвенции (создан этой сборкой); рядом docs/adr/ — ADR-решения; CONTEXT.md в корне — глоссарий домена (смета/раздел/позиция/метка/шаблон/раскрой).`
- `- components/ui/ — слой примитивов (tabs/badge/delete-button/date-range-picker/copy-button/switch/slider/context-menu/island/file-upload) — адаптации рецептов devignerui: владеют рендером/анимациями/клавиатурой/aria, наружу только пропс-API.`
- `- components/CommandPalette.tsx — палитра команд, React.lazy в App (экспортирует PaletteCommand, filterCommands, isCommandPaletteShortcut); тест components/commandPalette.test.ts.`
- `- services/estimateClipboard.ts — чистое форматирование позиций сметы/каталога для копирования (запись в буфер — у ui/copy-button); тест services/estimateClipboard.test.ts.`

## В раздел «Подводные камни» добавить:

- `- В @devigner-ui/icons@3.6.0 нет VK/Telegram — брендовые глифы остаются inline в LandingPage.tsx с комментарием-причиной; YouTube → IconYoutube, Google → IconGoogle из пакета.`
- `- ui/context-menu: ContextMenu требует handle из useContextMenu() — позиция у курсора, навешивание на <tr> без обёртки; desktop-only по контракту.`
- `- ui/tabs: Tabs — generic-функция (Tabs<T extends string>), не React.FC — FC не параметризуется дженериком (отмечено в коде).`
- `- Анимации — пакет motion (импорты motion/react), не framer-motion; keyframes в tailwind.config.js нет — анимации делают рецепты ui/, конфиг не раздувать.`
- `- Правило Ctrl/Cmd+K продублировано инлайном в keydown App: статический импорт isCommandPaletteShortcut склеил бы lazy-чанк палитры; каноническое правило — в CommandPalette.tsx, покрыто тестом.`

## Устарело — заменить:

- Строку `npm run check | … vitest (408/408 тестов, 58 файлов)` → `npm run check | Основная приёмка: typecheck + lint + vitest (424/424 теста, 60 файлов)` (фактический прогон этой сборки).
