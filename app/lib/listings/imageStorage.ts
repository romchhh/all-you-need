import { basename } from 'path';
import { isSyntheticListingImage } from '@/lib/listings/imageUrl';

/** Канонічний шлях з БД для клієнта (без перевірки existsSync — її робить /api/images). */
function canonicalStoredListingImagePath(imagePath: string): string {
  const clean = imagePath.split('?')[0].replace(/^\/+/, '');
  if (!clean) return '';

  if (clean.includes('parsed_photos')) {
    const match = clean.match(/(?:^|\/)parsed_photos\/(.+)$/);
    const filename = match?.[1] ?? basename(clean);
    if (!filename || filename.includes('..')) return '';
    return `database/parsed_photos/${filename}`;
  }

  if (clean.startsWith('listings/')) {
    return `/${clean}`;
  }

  if (clean.startsWith('api/images/')) {
    return `/${clean}`;
  }

  if (clean.startsWith('images/')) {
    return `/${clean}`;
  }

  return '';
}

/**
 * Нормалізує шлях з Listing.images для API (не відкидає парсерські фото, якщо файл тимчасово недоступний app-процесу).
 */
export function resolveStoredListingImagePath(imagePath: string | null | undefined): string {
  if (!imagePath?.trim()) return '';

  const trimmed = imagePath.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }

  const canonical = canonicalStoredListingImagePath(trimmed);
  if (!canonical || isSyntheticListingImage(canonical)) return '';
  return canonical;
}

export function resolveStoredListingImages(images: string[] | null | undefined): string[] {
  if (!images?.length) return [];
  const out: string[] = [];
  for (const img of images) {
    const resolved = resolveStoredListingImagePath(img);
    if (resolved) out.push(resolved);
  }
  return out;
}
