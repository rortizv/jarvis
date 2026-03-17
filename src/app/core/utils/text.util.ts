/**
 * Normaliza texto para comparaciones (lowercase, NFD, sin diacríticos).
 * @param trim - Si true, aplica trim al resultado.
 */
export function normalizeText(text: string, trim = false): string {
  const t = (text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
  return trim ? t.trim() : t;
}
