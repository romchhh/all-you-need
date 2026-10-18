/**
 * URL для відображення фото оголошення у веб-додатку.
 */

export function buildListingImageUrl(imagePath: string | null | undefined): string {
  if (!imagePath) return '';
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

  // Public static (напр. /images/…)
  if (cleanPath.startsWith('images/')) {
    return `/${cleanPath}`;
  }

  // Застарілий fallback tgground — більше не підставляємо як «фото»
  if (cleanPath === 'images/tgground.jpg' || cleanPath.endsWith('/tgground.jpg')) {
    return '';
  }

  return `/api/images/${cleanPath}`;
}

/** URL реального фото картки; порожньо → UI малює ListingAutoCover. */
export function resolveListingCardImageUrl(listing: {
  image?: string | null;
  images?: string[] | null;
  category?: string | null;
}): string {
  const raw = listing.image || listing.images?.[0] || '';
  return buildListingImageUrl(raw);
}

/** Галерея detail: лише реальні фото (без статичної заглушки). */
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
  return fromList.filter((path) => {
    const built = buildListingImageUrl(path);
    return Boolean(built);
  });
}
