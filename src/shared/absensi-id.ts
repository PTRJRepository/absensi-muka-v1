export function normalizeAbsensiId(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

export function pickAbsensiId(...values: unknown[]): string {
  const candidates = values.map(normalizeAbsensiId).filter(Boolean);
  const longId = candidates
    .filter((value) => value.length > 5)
    .sort((left, right) => right.length - left.length)[0];
  if (longId) return longId;

  const scannerId = candidates.find((value) => value.length === 5);
  if (scannerId) return scannerId;

  return candidates[0] ?? '';
}
