/** Чи показувати попередню ціну (вікно 7 днів). */
import { parseDbDate } from '@/utils/parseDbDate';

export function isPriceChangeFresh(priceChangedAt?: string | null): boolean {
  if (!priceChangedAt) return false;
  const d = parseDbDate(priceChangedAt);
  if (!d) return false;
  return Date.now() - d.getTime() <= 7 * 24 * 60 * 60 * 1000;
}
