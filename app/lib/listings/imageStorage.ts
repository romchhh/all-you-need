import { existsSync } from 'fs';
import { basename, extname, join } from 'path';

function publicFile(relPath: string): string {
  return join(process.cwd(), 'public', relPath.replace(/^\/+/, ''));
}

function parsedPhotoFile(filename: string): string {
  return join(process.cwd(), '..', 'database', 'parsed_photos', filename);
}

function optimizedCandidates(originalRel: string): string[] {
  const base = basename(originalRel);
  const stem = base.replace(/\.[^.]+$/, '');
  const ext = extname(base);
  return [
    `listings/optimized/${stem}.webp`,
    `listings/optimized/${base}`,
    `listings/optimized/${stem}${ext}`,
    `listings/${base}`,
  ];
}

/**
 * Повертає шлях з БД, якщо файл реально є на диску; інакше '' (без 404 у клієнті).
 */
export function resolveStoredListingImagePath(imagePath: string | null | undefined): string {
  if (!imagePath?.trim()) return '';

  const trimmed = imagePath.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }

  const clean = trimmed.split('?')[0].replace(/^\/+/, '');
  if (!clean) return '';

  if (clean.includes('database/') || clean.includes('parsed_photos')) {
    const match = clean.match(/(?:^|\/)parsed_photos\/(.+)$/);
    const filename = match?.[1] ?? basename(clean);
    return existsSync(parsedPhotoFile(filename)) ? `database/parsed_photos/${filename}` : '';
  }

  if (existsSync(publicFile(clean))) {
    return clean.startsWith('listings/') ? `/${clean}` : `/${clean}`;
  }

  if (clean.startsWith('listings/originals/')) {
    for (const candidate of optimizedCandidates(clean)) {
      if (existsSync(publicFile(candidate))) {
        return `/${candidate}`;
      }
    }
    const filename = basename(clean);
    if (existsSync(parsedPhotoFile(filename))) {
      return `database/parsed_photos/${filename}`;
    }
  }

  return '';
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
