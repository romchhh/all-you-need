import { readFile, unlink } from 'fs/promises';
import { join, normalize, sep } from 'path';

const PUBLIC_ROOT = join(process.cwd(), 'public');

const ALLOWED_PUBLIC_PREFIXES = ['listings/', 'avatars/'] as const;

/**
 * Безпечний абсолютний шлях лише під public/listings|avatars (без existsSync на dynamic public/*).
 */
export function resolveSafePublicPath(urlOrPath: string): string | null {
  const clean = urlOrPath.split('?')[0].trim().replace(/^\/+/, '');
  if (!clean || clean.includes('..')) {
    return null;
  }

  const allowed = ALLOWED_PUBLIC_PREFIXES.some((prefix) => clean.startsWith(prefix));
  if (!allowed) {
    return null;
  }

  const abs = normalize(join(PUBLIC_ROOT, clean));
  const rootWithSep = PUBLIC_ROOT.endsWith(sep) ? PUBLIC_ROOT : `${PUBLIC_ROOT}${sep}`;
  if (!abs.startsWith(rootWithSep)) {
    return null;
  }

  return abs;
}

export async function readSafePublicFile(urlOrPath: string): Promise<Buffer | null> {
  const abs = resolveSafePublicPath(urlOrPath);
  if (!abs) {
    return null;
  }

  try {
    return await readFile(abs);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function deleteSafePublicFile(urlOrPath: string): Promise<boolean> {
  const abs = resolveSafePublicPath(urlOrPath);
  if (!abs) {
    return false;
  }

  try {
    await unlink(abs);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}
