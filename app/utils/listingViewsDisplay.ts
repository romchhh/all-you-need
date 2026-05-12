/** Перегляди показуємо лише якщо їх строго більше цього числа (≤ — ніде не показуємо). */
export const LISTING_VIEWS_DISPLAY_THRESHOLD = 10;

export function shouldShowListingViews(views: number | null | undefined): boolean {
  return (views ?? 0) > LISTING_VIEWS_DISPLAY_THRESHOLD;
}
