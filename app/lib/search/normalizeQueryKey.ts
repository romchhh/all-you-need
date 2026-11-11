/** Ключ підписки: trim, lower, один пробіл між словами. */
export function normalizeQueryKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ');
}
