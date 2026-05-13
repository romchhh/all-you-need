/**
 * Мінімум переглядів, з якого показуємо лічильник (компроміс між 10 і 15).
 * Показуємо при views >= цього значення.
 */
export const LISTING_VIEWS_DISPLAY_MIN = 12;

export function shouldShowListingViews(views: number | null | undefined): boolean {
  return (views ?? 0) >= LISTING_VIEWS_DISPLAY_MIN;
}

/** Обране в UI лише разом із «достатніми» переглядами та якщо хоча б одне додавання в обране. */
export function shouldShowListingFavorites(
  views: number | null | undefined,
  favoritesCount: number | null | undefined
): boolean {
  return shouldShowListingViews(views) && (favoritesCount ?? 0) > 0;
}
