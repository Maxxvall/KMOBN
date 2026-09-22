import { EstimateItem, safeNumber } from '../types';

export const normalizeMeasurementUnit = (value: unknown): string => {
  const unit = String(value || '').trim().toLowerCase();
  if (['м²', 'м2', 'm2', 'm²'].includes(unit)) return 'м2';
  if (['м³', 'м3', 'm3'].includes(unit)) return 'м3';
  if (unit.includes('пог') || unit.includes('м.п') || unit.includes('м/п')) return 'м/п';
  if (unit.includes('упак') || unit === 'уп.' || unit === 'уп') return 'уп';
  if (unit.includes('шт')) return 'шт';
  return unit;
};

export const parsePackAreaSqM = (nameRaw: unknown): number | null => {
  const name = String(nameRaw || '');
  const match = name.match(/(\d+(?:[.,]\d+)?)\s*(?:м2|м²|m2|m²|кв\.?\s*м)(?=$|[\s,;:.)/])/i);
  if (!match) return null;
  const value = safeNumber(match[1].replace(',', '.'), 0);
  return value > 0 ? value : null;
};

export const coverageQuantitySqM = (item: Pick<EstimateItem, 'name' | 'unit' | 'quantity'>): number | null => {
  const quantity = safeNumber(item.quantity, 0);
  const unit = normalizeMeasurementUnit(item.unit);
  if (unit === 'м2') return quantity;

  const packArea = parsePackAreaSqM(item.name);
  if (packArea && (unit === 'шт' || unit === 'уп')) {
    return quantity * packArea;
  }

  return null;
};
