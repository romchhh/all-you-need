import { readSafePublicFile } from '@/lib/server/safePublicFs';
import { resolveListingImageAbsolutePath } from '@/lib/server/listingImagePath';
import { readFileBuffer } from '@/lib/server/nodeFs';

/** URL або /listings/... → відносний шлях під public. */
export function imageUrlToPublicPath(imageUrl: string): string | null {
  if (!imageUrl) return null;

  if (imageUrl.startsWith('/')) {
    return imageUrl.split('?')[0];
  }

  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    try {
      let pathname = new URL(imageUrl).pathname;
      if (pathname.startsWith('/api/images/')) {
        pathname = pathname.slice('/api/images'.length);
      }
      return pathname.split('?')[0] || null;
    } catch {
      const match = imageUrl.match(/\/listings\/[^\s?#]+/);
      return match ? match[0] : null;
    }
  }

  const clean = imageUrl.split('?')[0].replace(/^\/+/, '');
  if (clean.startsWith('listings/')) {
    return `/${clean}`;
  }

  return null;
}

/** Завантажує буфер зображення для модерації (диск → fallback HTTP у викликача). */
export async function loadModerationImageBuffer(imageUrl: string): Promise<Buffer | null> {
  const publicPath = imageUrlToPublicPath(imageUrl);
  if (publicPath) {
    const fromSafe = await readSafePublicFile(publicPath);
    if (fromSafe) return fromSafe;

    const rel = publicPath.replace(/^\/+/, '');
    const abs = await resolveListingImageAbsolutePath(rel);
    if (abs) {
      try {
        return await readFileBuffer(abs);
      } catch {
        /* try HTTP below */
      }
    }
  }

  return null;
}
