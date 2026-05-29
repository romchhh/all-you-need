import { Listing } from '@/types';
import { getListingDisplayDate } from '@/utils/parseDbDate';

type ListingAgeInput = Pick<Listing, 'createdAt' | 'publishedAt' | 'posted'>;

function listingAgeDays(listing: ListingAgeInput): number {
  const d = getListingDisplayDate(listing);
  if (!d) return 45;
  return Math.max(0, (Date.now() - d.getTime()) / 86_400_000);
}

/** Коефіцієнт відображення переглядів: для старих оголошень — нижчий. */
function viewsDisplayFactor(ageDays: number): number {
  if (ageDays >= 90) return 0.32;
  if (ageDays >= 60) return 0.4;
  if (ageDays >= 30) return 0.52;
  if (ageDays >= 14) return 0.65;
  if (ageDays >= 7) return 0.78;
  if (ageDays >= 2) return 0.88;
  return 1;
}

/** Обране показуємо ще скромніше за перегляди. */
function favoritesDisplayFactor(ageDays: number): number {
  if (ageDays >= 90) return 0.2;
  if (ageDays >= 60) return 0.28;
  if (ageDays >= 30) return 0.38;
  if (ageDays >= 14) return 0.5;
  if (ageDays >= 7) return 0.62;
  if (ageDays >= 2) return 0.75;
  return 0.9;
}

export function displayListingViews(
  listing: Pick<Listing, 'views' | 'createdAt' | 'publishedAt' | 'posted'>
): number {
  const raw = Math.max(0, listing.views ?? 0);
  if (raw === 0) return 0;
  return Math.max(0, Math.round(raw * viewsDisplayFactor(listingAgeDays(listing))));
}

export function displayListingFavoritesCount(
  listing: Pick<Listing, 'favoritesCount' | 'createdAt' | 'publishedAt' | 'posted'>
): number {
  const raw = Math.max(0, listing.favoritesCount ?? 0);
  if (raw === 0) return 0;
  return Math.max(0, Math.round(raw * favoritesDisplayFactor(listingAgeDays(listing))));
}
