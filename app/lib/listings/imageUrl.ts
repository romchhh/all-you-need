/**
 * URL для відображення фото оголошення у веб-додатку.
 */

/** Fallback для послуг без фото (як у каналі / боті). */
export const DEFAULT_SERVICES_LISTING_IMAGE = '/images/tgground.jpg';

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

  // Public static (напр. /images/tgground.jpg)
  if (cleanPath.startsWith('images/')) {
    return `/${cleanPath}`;
  }

  return `/api/images/${cleanPath}`;
}

function isServicesWork(category?: string | null): boolean {
  return (category || '').trim().toLowerCase() === 'services_work';
}

/** URL обкладинки картки: thumbUrl → image → images[0]; services без фото — tgground. */
export function resolveListingCardImageUrl(listing: {
  thumbUrl?: string | null;
  image?: string | null;
  images?: string[] | null;
  category?: string | null;
}): string {
  const raw = listing.thumbUrl || listing.image || listing.images?.[0] || '';
  const built = buildListingImageUrl(raw);
  if (built) return built;
  if (isServicesWork(listing.category)) return DEFAULT_SERVICES_LISTING_IMAGE;
  return '';
}

/** Галерея detail: порожній список для послуг → tgground. */
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
  if (fromList.length > 0) return fromList;
  if (isServicesWork(listing.category)) return [DEFAULT_SERVICES_LISTING_IMAGE];
  return [];
}
