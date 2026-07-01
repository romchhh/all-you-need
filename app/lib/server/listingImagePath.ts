import { join, sep } from 'path';
import { pathExists, statFile } from '@/lib/server/nodeFs';

const PUBLIC_ROOT = join(process.cwd(), 'public');
const SAFE_SEGMENT = /^[a-zA-Z0-9._-]+$/;

function validateRelativeParts(parts: string[]): boolean {
  if (!parts.length || parts.includes('..')) return false;
  return parts.every((p) => SAFE_SEGMENT.test(p));
}

function absoluteFromParts(parts: string[]): string | null {
  if (!validateRelativeParts(parts)) return null;
  const abs = join(PUBLIC_ROOT, ...parts);
  const rootWithSep = PUBLIC_ROOT.endsWith(sep) ? PUBLIC_ROOT : `${PUBLIC_ROOT}${sep}`;
  if (!abs.startsWith(rootWithSep)) return null;
  return abs;
}

async function tryRelativePath(rel: string): Promise<string | null> {
  const parts = rel.replace(/^\/+/, '').split('/').filter(Boolean);
  const abs = absoluteFromParts(parts);
  if (!abs) return null;
  try {
    await statFile(abs);
    return abs;
  } catch {
    return null;
  }
}

/** Безпечний абсолютний шлях до файлу оголошення (public або parsed_photos). */
export async function resolveListingImageAbsolutePath(imagePath: string): Promise<string | null> {
  const normalized = (imagePath || '').split('?')[0].replace(/^\/+/, '');
  if (!normalized || normalized.includes('..')) return null;

  const direct = await tryRelativePath(normalized);
  if (direct) return direct;

  const parts = normalized.split('/').filter(Boolean);
  if (parts[0] === 'listings' && parts[1] === 'originals' && parts[2] && SAFE_SEGMENT.test(parts[2])) {
    const base = parts[2];
    const stem = base.replace(/\.[^.]+$/, '');
    const candidates = [
      `listings/optimized/${stem}.webp`,
      `listings/optimized/${base}`,
      `listings/${base}`,
    ];
    for (const rel of candidates) {
      const found = await tryRelativePath(rel);
      if (found) return found;
    }

    const parsedAbs = join(process.cwd(), '..', 'database', 'parsed_photos', base);
    if (await pathExists(parsedAbs)) return parsedAbs;
  }

  return null;
}
