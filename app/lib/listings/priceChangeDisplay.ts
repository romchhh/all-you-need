/** Чи показувати попередню ціну (вікно 7 днів). */
export function isPriceChangeFresh(priceChangedAt?: string | null): boolean {
  if (!priceChangedAt) return false;
  const t = new Date(priceChangedAt).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t <= 7 * 24 * 60 * 60 * 1000;
}
