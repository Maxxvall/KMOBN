import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import FocusLock from 'react-focus-lock';
import { IconChevronLeft, IconChevronRight, IconMagnifier } from '@devigner-ui/icons';

// Адаптация рецепта devignerui «Command Palette» (вложенные страницы +
// скользящая подсветка строки) под Tailwind 3, тёмную тему и токены проекта.
// Команды строит App из существующих обработчиков — компонент только ищет,
// рисует и запускает.

export type PaletteCommand = {
  id: string;
  label: string;
  icon?: React.ReactNode;
  hint?: string;
  /** Дополнительный поисковый текст, например номер сметы для строки клиента. */
  keywords?: string;
  perform: () => void;
  /** Вложенная страница палитры: выбор команды раскрывает подкатегорию. */
  children?: PaletteCommand[];
};

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  commands: PaletteCommand[];
}

const MAX_VISIBLE_RESULTS = 30;

/** Поиск по первым буквам: регистр не важен, все слова запроса должны встретиться. */
export const filterCommands = (commands: PaletteCommand[], query: string): PaletteCommand[] => {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return commands;
  return commands.filter(command => {
    const haystack = [command.label, command.hint, command.keywords]
      .filter((part): part is string => Boolean(part))
      .join(' ')
      .toLowerCase();
    return tokens.every(token => haystack.includes(token));
  });
};

/** Горячая клавиша из тикета: Ctrl/Cmd+K, без лишних модификаторов. */
export const isCommandPaletteShortcut = (event: KeyboardEvent): boolean => {
  if (event.altKey || event.shiftKey) return false;
  if (!event.ctrlKey && !event.metaKey) return false;
  return event.key.toLowerCase() === 'k';
};

const highlightTransition = { type: 'spring' as const, bounce: 0.18, duration: 0.4 };

const CommandPalette: React.FC<CommandPaletteProps> = ({ open, onClose, commands }) => {
  const [query, setQuery] = useState('');
  const [pageStack, setPageStack] = useState<PaletteCommand[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [pageDirection, setPageDirection] = useState(1);
  const layoutId = React.useId();
  const highlightId = `palette-highlight-${layoutId}`;
  const inputRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const currentPage = pageStack.length > 0 ? pageStack[pageStack.length - 1] : null;
  const pageCommands = currentPage?.children ?? commands;
  const results = useMemo(
    () => filterCommands(pageCommands, query).slice(0, MAX_VISIBLE_RESULTS),
    [pageCommands, query],
  );

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setPageStack([]);
    setActiveIndex(0);
    setPageDirection(1);
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, currentPage]);

  useEffect(() => {
    if (activeIndex >= results.length) {
      setActiveIndex(results.length > 0 ? results.length - 1 : 0);
    }
  }, [activeIndex, results.length]);

  useEffect(() => {
    optionRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const openPage = useCallback((command: PaletteCommand) => {
    setPageDirection(1);
    setPageStack(stack => [...stack, command]);
    setQuery('');
    inputRef.current?.focus();
  }, []);

  const popPage = useCallback(() => {
    setPageDirection(-1);
    setPageStack(stack => stack.slice(0, -1));
    setQuery('');
    inputRef.current?.focus();
  }, []);

  const runCommand = useCallback((command: PaletteCommand) => {
    if (command.children && command.children.length > 0) {
      openPage(command);
      return;
    }
    onClose();
    command.perform();
  }, [onClose, openPage]);

  const handlePanelKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex(index => (results.length > 0 ? (index + 1) % results.length : 0));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(index => (results.length > 0 ? (index - 1 + results.length) % results.length : 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const command = results[activeIndex];
      if (command) runCommand(command);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (pageStack.length > 0) popPage();
      else onClose();
    } else if (event.key === 'Backspace' && query === '' && pageStack.length > 0) {
      event.preventDefault();
      popPage();
    }
  }, [activeIndex, onClose, pageStack.length, popPage, query, results, runCommand]);

  if (!open) return null;

  const dialogLabel = currentPage ? `Поиск и команды — ${currentPage.label}` : 'Поиск и команды';

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/60 p-4 backdrop-blur-[2px] sm:p-6"
      onClick={onClose}
    >
      <FocusLock returnFocus>
        <div
          role="dialog"
          aria-modal="true"
          aria-label={dialogLabel}
          onKeyDown={handlePanelKeyDown}
          onClick={event => event.stopPropagation()}
          className="mx-auto mt-[8vh] flex w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl"
        >
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            {currentPage ? (
              <button
                type="button"
                tabIndex={-1}
                onClick={popPage}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-text-secondary transition hover:bg-white/5 hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
                aria-label="Назад"
              >
                <IconChevronLeft aria-hidden="true" className="size-5" />
              </button>
            ) : (
              <IconMagnifier aria-hidden="true" className="size-5 shrink-0 text-text-secondary" />
            )}
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder={currentPage ? `Поиск в «${currentPage.label}»…` : 'Поиск смет и команд…'}
              aria-label="Поиск смет и команд"
              role="combobox"
              aria-expanded="true"
              aria-controls="command-palette-listbox"
              aria-activedescendant={results[activeIndex] ? `command-palette-option-${results[activeIndex].id}` : undefined}
              autoComplete="off"
              spellCheck={false}
              className="min-h-9 w-full bg-transparent text-text-primary outline-none placeholder:text-text-secondary"
            />
          </div>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={pageStack.length}
              initial={{ opacity: 0, x: 24 * pageDirection }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 * pageDirection }}
              transition={highlightTransition}
            >
              <div
                id="command-palette-listbox"
                role="listbox"
                aria-label={currentPage ? currentPage.label : 'Команды'}
                className="max-h-[52vh] overflow-y-auto p-2"
              >
                {results.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                    <IconMagnifier aria-hidden="true" className="size-8 text-text-secondary" />
                    <p className="text-sm font-semibold text-text-primary">Ничего не найдено</p>
                    <p className="text-xs text-text-secondary">
                      {currentPage
                        ? 'В этом разделе таких команд нет. Вернитесь назад и попробуйте другой запрос.'
                        : 'Проверьте раскладку или попробуйте другой запрос — например, номер сметы или фамилию клиента.'}
                    </p>
                  </div>
                ) : (
                  results.map((command, index) => {
                    const isActive = index === activeIndex;
                    const hasChildren = Boolean(command.children && command.children.length > 0);
                    return (
                      <button
                        key={command.id}
                        ref={node => { optionRefs.current[index] = node; }}
                        type="button"
                        tabIndex={-1}
                        role="option"
                        aria-selected={isActive}
                        id={`command-palette-option-${command.id}`}
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => runCommand(command)}
                        className="relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left"
                      >
                        {isActive && (
                          <motion.span
                            layoutId={highlightId}
                            aria-hidden="true"
                            transition={highlightTransition}
                            className="absolute inset-0 rounded-lg bg-white/5 ring-1 ring-white/10"
                          />
                        )}
                        <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-black/20 text-text-primary" aria-hidden="true">
                          {command.icon ?? <IconMagnifier className="size-4" />}
                        </span>
                        <span className="relative min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-text-primary">{command.label}</span>
                          {command.hint && <span className="block truncate text-xs text-text-secondary">{command.hint}</span>}
                        </span>
                        {hasChildren && <IconChevronRight aria-hidden="true" className="relative size-4 shrink-0 text-text-secondary" />}
                      </button>
                    );
                  })
                )}
              </div>
            </motion.div>
          </AnimatePresence>

          <div className="flex items-center gap-4 border-t border-border px-4 py-2 text-[11px] text-text-secondary">
            <span><kbd className="font-semibold text-text-primary">↑↓</kbd> — выбор</span>
            <span><kbd className="font-semibold text-text-primary">Enter</kbd> — открыть</span>
            <span><kbd className="font-semibold text-text-primary">Esc</kbd> — закрыть</span>
            {pageStack.length > 0 && <span><kbd className="font-semibold text-text-primary">Backspace</kbd> — назад</span>}
          </div>
        </div>
      </FocusLock>
    </div>
  );
};

export default CommandPalette;
