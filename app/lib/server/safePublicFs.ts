import { join, sep } from 'path';
import { deleteUserAvatarFiles } from '@/lib/server/avatarFiles';
import { readFileBuffer, unlinkFile } from '@/lib/server/nodeFs';

const PUBLIC_ROOT = join(process.cwd(), 'public');
const SAFE_SEGMENT = /^[a-zA-Z0-9._-]+$/;

/**
 * Безпечний абсолютний шлях лише під public/listings|avatars.
 */
export function resolveSafePublicPath(urlOrPath: string): string | null {
  const clean = urlOrPath.split('?')[0].trim().replace(/^\/+/, '');
  if (!clean || clean.includes('..')) {
    return null;
  }

  const parts = clean.split('/').filter(Boolean);
  if (parts.length < 2) {
    return null;
  }

  const root = parts[0];
  if (root !== 'listings' && root !== 'avatars') {
    return null;
  }

  if (!parts.every((p) => SAFE_SEGMENT.test(p))) {
    return null;
  }

  const abs = join(PUBLIC_ROOT, ...parts);
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
    return await readFileBuffer(abs);
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
    await unlinkFile(abs);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}
