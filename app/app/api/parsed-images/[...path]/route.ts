import { extname, join, resolve, sep } from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { pathExists } from '@/lib/server/nodeFs';
import { serveListingMediaFile } from '@/lib/media/serveListingMediaFile';

const PARSED_PHOTOS_BASE = resolve(process.cwd(), '..', 'database', 'parsed_photos');
const SAFE_FILENAME = /^[a-zA-Z0-9._-]+$/;

function mimeByExt(ext: string): string {
  switch (ext.toLowerCase()) {
    case '.webp':
      return 'image/webp';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.gif':
      return 'image/gif';
    default:
      return 'application/octet-stream';
  }
}

function resolveParsedPhotoPath(imagePath: string): string | null {
  const normalizedPath = imagePath
    .replace(/^database\/parsed_photos\//, '')
    .replace(/^parsed_photos\//, '');

  const parts = normalizedPath.split('/').filter(Boolean);
  if (!parts.length || parts.some((p) => !SAFE_FILENAME.test(p))) {
    return null;
  }

  const fullPath = join(PARSED_PHOTOS_BASE, ...parts);
  const baseWithSep = PARSED_PHOTOS_BASE.endsWith(sep)
    ? PARSED_PHOTOS_BASE
    : `${PARSED_PHOTOS_BASE}${sep}`;

  if (!fullPath.startsWith(baseWithSep)) {
    return null;
  }

  return fullPath;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await params;
    const imagePath = Array.isArray(path) ? path.join('/') : path;

    if (!imagePath || imagePath.includes('..') || imagePath.startsWith('/')) {
      return new NextResponse('Not Found', { status: 404 });
    }

    const fullPath = resolveParsedPhotoPath(imagePath);
    if (!fullPath || !(await pathExists(fullPath))) {
      return new NextResponse('Not Found', { status: 404 });
    }

    const ext = extname(fullPath);
    const normalizedPath = imagePath
      .replace(/^database\/parsed_photos\//, '')
      .replace(/^parsed_photos\//, '');

    return serveListingMediaFile(
      request,
      fullPath,
      `parsed-${normalizedPath}`,
      mimeByExt(ext)
    );
  } catch (error) {
    console.error('[parsed-images] serve failed', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
