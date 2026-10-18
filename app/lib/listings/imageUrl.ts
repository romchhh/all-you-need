/**
 * URL для відображення фото оголошення у веб-додатку.
 */

/** Заглушки / дефолтні копії лого (старі послуги без реального фото). */
export function isSyntheticListingImage(
  imagePath: string | null | undefined
): boolean {
  if (!imagePath) return true;
  const clean = (imagePath.split('?')[0] || imagePath)
    .replace(/^\/+/, '')
    .toLowerCase();
  if (!clean) return true;
  if (clean.includes('tgground')) return true;
  if (clean.includes('mini-logo-placeholder')) return true;
  // parser / bot: copy of default logo → …_default.jpg
  if (/_default\.jpe?g$/i.test(clean)) return true;
  return false;
}

export function buildListingImageUrl(imagePath: string | null | undefined): string {
  if (!imagePath) return '';
  if (isSyntheticListingImage(imagePath)) return '';

  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    return imagePath;
  }
  const cleanPath = (imagePath.split('?')[0] || imagePath).replace(/^\/+/, '');
  if (!cleanPath) return '';

  if (cleanPath.includes('parsed_photos')) {
    const match = cleanPath.match(/(?:^|\/)parsed_photos\/(.+)$/);
    return match?.[1] ? `/api/parsed-images/${match[1]}` : '';
  }

  if (cleanPath.startsWith('api/images/')) {
    return `/${cleanPath}`;
  }

  // Public static (напр. /images/…) — лише якщо це не заглушка (вже відфільтровано вище)
  if (cleanPath.startsWith('images/')) {
    return `/${cleanPath}`;
  }

  return `/api/images/${cleanPath}`;
}

/** Перше реальне фото зі списку (пропускає tgground / _default.jpg). */
export function firstRealListingImage(
  listing: {
    image?: string | null;
    images?: string[] | null;
  }
): string {
  const candidates: string[] = [];
  if (listing.images && listing.images.length > 0) {
    for (const img of listing.images) {
      if (img) candidates.push(img);
    }
  } else if (listing.image) {
    candidates.push(listing.image);
  }
  for (const raw of candidates) {
    const built = buildListingImageUrl(raw);
    if (built) return built;
  }
  return '';
}

/** URL реального фото картки; порожньо → UI малює ListingAutoCover. */
export function resolveListingCardImageUrl(listing: {
  image?: string | null;
  images?: string[] | null;
  category?: string | null;
}): string {
  return firstRealListingImage(listing);
}

/** Галерея detail: лише реальні фото (без статичної заглушки / _default). */
export function resolveListingGalleryImages(listing: {
  image?: string | null;
  images?: string[] | null;
  category?: string | null;
}): string[] {
  const fromList =
    listing.images && listing.images.length > 0
      ? listing.images.filter(Boolean)
      : listing.image
        ? [listing.image]
        : [];
  return fromList.filter((path) => Boolean(buildListingImageUrl(path)));
}
