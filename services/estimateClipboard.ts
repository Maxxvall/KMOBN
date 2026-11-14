import { SectionId } from '../types';

// Чистое форматирование текста для копирования (R09.2). Единственная новая
// логика со своим тестом: список позиций сметы по разделам («Имя — кол-во ед.»)
// и позиция каталога («Имя — цена ₽/ед.»). Без обращения к буферу обмена —
// запись в clipboard остаётся у CopyButton.

export interface EstimateClipboardItem {
  name: string;
  unit: string;
  quantity: number;
  category: SectionId;
}

export interface EstimateClipboardOptions {
  /** Подпись раздела; по умолчанию — категория как есть (значения enum — уже подписи). */
  resolveSectionLabel?: (category: SectionId) => string;
}

export interface CatalogClipboardEntry {
  name: string;
  price: number;
  /** Единица измерения позиции; добавляется после цены («₽/м³»). */
  unit?: string;
}

/** 10 → «10», 2.5 → «2.5», 1.0 → «1», 2.555 → «2.56» (дробная часть до двух знаков). */
const formatQuantity = (quantity: number): string => (
  Number.isInteger(quantity) ? String(quantity) : String(Number(quantity.toFixed(2)))
);

/** «Имя — кол-во ед.»; без единицы — «Имя — кол-во», без хвостового пробела. */
const formatItemLine = (item: EstimateClipboardItem): string => {
  const unit = item.unit.trim();
  return `${item.name} — ${formatQuantity(item.quantity)}${unit ? ` ${unit}` : ''}`;
};

/**
 * Список позиций по разделам, порядок разделов — по первому появлению во входном
 * списке (потребитель передаёт позиции уже в порядке отображения). Пустой список — ''.
 */
export const formatEstimateItemsClipboard = (
  items: readonly EstimateClipboardItem[],
  options: EstimateClipboardOptions = {},
): string => {
  if (items.length === 0) return '';
  const resolveSectionLabel = options.resolveSectionLabel ?? ((category: SectionId) => category);

  const groups: Array<{ label: string; lines: string[] }> = [];
  const indexByLabel = new Map<string, number>();
  for (const item of items) {
    const label = resolveSectionLabel(item.category);
    let index = indexByLabel.get(label);
    if (index === undefined) {
      index = groups.length;
      indexByLabel.set(label, index);
      groups.push({ label, lines: [] });
    }
    groups[index].lines.push(formatItemLine(item));
  }

  return groups.map((group) => [group.label, ...group.lines].join('\n')).join('\n\n');
};

/** Позиция каталога: «Имя — 1 250 ₽», с единицей — «Имя — 5 400,5 ₽/м³».
 *  Разделители группировки ru-RU (неразрывные пробелы) заменяются на обычные —
 *  текст уходит в чужие приложения. */
export const formatCatalogItemClipboard = (entry: CatalogClipboardEntry): string => {
  const price = entry.price.toLocaleString('ru-RU').replace(/\u00A0|\u202F/g, ' ');
  return `${entry.name} — ${price} ₽${entry.unit ? `/${entry.unit}` : ''}`;
};
