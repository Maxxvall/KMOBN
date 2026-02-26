export const parseEstimateSerial = (estimateNumber: string, year: number): number | null => {
  const text = String(estimateNumber || '').trim();
  const match = text.match(new RegExp(`^SM-${year}-(\\d{3,})`));
  if (!match) return null;
  const serial = Number(match[1]);
  return Number.isFinite(serial) ? serial : null;
};

export const generateEstimateNumber = (existingEstimateNumbers: string[], now = new Date()): string => {
  const year = now.getFullYear();
  const maxSerial = existingEstimateNumbers
    .map(number => parseEstimateSerial(number, year))
    .filter((value): value is number => typeof value === 'number')
    .reduce((max, current) => Math.max(max, current), 0);

  const nextSerial = String(maxSerial + 1).padStart(3, '0');
  const nonce = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `SM-${year}-${nextSerial}-${nonce}`;
};
