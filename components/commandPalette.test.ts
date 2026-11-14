import { describe, expect, it } from 'vitest';
import {
  filterCommands,
  isCommandPaletteShortcut,
  type PaletteCommand,
} from './CommandPalette';

const makeCommand = (id: string, label: string, hint?: string, keywords?: string): PaletteCommand => ({
  id,
  label,
  hint,
  keywords,
  perform: () => {},
});

describe('filterCommands', () => {
  const commands = [
    makeCommand('estimate:1', 'Иванов Иван', '№12'),
    makeCommand('estimate:2', 'Петров Пётр', '№7'),
    makeCommand('estimate:3', 'ООО «Стройдом»', '№124', 'иван'),
    makeCommand('action:new', 'Новая смета'),
  ];

  it('finds an estimate by the first letters of the client name, case-insensitively', () => {
    const result = filterCommands(commands, 'иван');
    expect(result.map(command => command.id)).toEqual(['estimate:1', 'estimate:3']);
  });

  it('finds an estimate by its number typed into the same search field', () => {
    const result = filterCommands(commands, '12');
    expect(result.map(command => command.id)).toEqual(['estimate:1', 'estimate:3']);
  });

  it('matches only commands containing every whitespace-separated token', () => {
    const result = filterCommands(commands, 'иван 12');
    expect(result.map(command => command.id)).toEqual(['estimate:1', 'estimate:3']);
    expect(filterCommands(commands, 'петров 12').map(command => command.id)).toEqual([]);
  });

  it('keeps commands whose keyword matches even when the label does not', () => {
    expect(filterCommands(commands, 'смета').map(command => command.id)).toEqual(['action:new']);
  });

  it('returns the full list for a blank query', () => {
    expect(filterCommands(commands, '   ')).toHaveLength(commands.length);
  });
});

describe('isCommandPaletteShortcut', () => {
  const event = (overrides: Partial<KeyboardEvent>): KeyboardEvent =>
    ({ key: 'k', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...overrides }) as KeyboardEvent;

  it('accepts Ctrl+K from the ticket', () => {
    expect(isCommandPaletteShortcut(event({ ctrlKey: true }))).toBe(true);
  });

  it('accepts Cmd+K, including the capital K produced by Shift', () => {
    expect(isCommandPaletteShortcut(event({ metaKey: true, key: 'K' }))).toBe(true);
  });

  it('rejects a bare key press so typing "k" in fields stays untouched', () => {
    expect(isCommandPaletteShortcut(event({}))).toBe(false);
  });

  it('rejects other Ctrl-combinations and modifiers the ticket does not name', () => {
    expect(isCommandPaletteShortcut(event({ key: 'ArrowUp', ctrlKey: true }))).toBe(false);
    expect(isCommandPaletteShortcut(event({ ctrlKey: true, altKey: true }))).toBe(false);
    expect(isCommandPaletteShortcut(event({ ctrlKey: true, shiftKey: true }))).toBe(false);
  });
});
