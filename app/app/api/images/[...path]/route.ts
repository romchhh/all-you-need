import { NextRequest, NextResponse } from 'next/server';
import { basename, extname, join, resolve } from 'path';
import { existsSync } from 'fs';
import { serveListingMediaFile } from '@/lib/media/serveListingMediaFile';

function findReadableListingImage(imagePath: string): string | null {
  const publicDir = join(process.cwd(), 'public');
  const primary = join(publicDir, imagePath);
  if (existsSync(primary)) return primary;

  if (imagePath.startsWith('listings/originals/')) {
    const base = basename(imagePath);
    const stem = base.replace(/\.[^.]+$/, '');
    const ext = extname(base);
    const candidates = [
      join(publicDir, 'listings', 'optimized', `${stem}.webp`),
      join(publicDir, 'listings', 'optimized', base),
      join(publicDir, 'listings', base),
      resolve(join(process.cwd(), '..', 'database', 'parsed_photos', base)),
    ];
    for (const candidate of candidates) {
      if (existsSync(candidate)) return candidate;
    }
    if (ext) {
      const alt = join(publicDir, 'listings', 'optimized', `${stem}${ext}`);
      if (existsSync(alt)) return alt;
    }
  }

  return null;
}

function mimeByExt(ext: string | undefined): string {
  switch (ext?.toLowerCase()) {
    case 'webp':
      return 'image/webp';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'gif':
      return 'image/gif';
    default:
      return 'application/octet-stream';
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await params;
    let imagePath = Array.isArray(path) ? path.join('/') : path;
    if (imagePath.startsWith('api/images/')) {
      imagePath = imagePath.slice('api/images/'.length);
    }

    if (!imagePath || imagePath.includes('..') || imagePath.startsWith('/')) {
      return new NextResponse('Not Found', { status: 404 });
    }

    const fullPath = findReadableListingImage(imagePath);
    if (!fullPath) {
      return new NextResponse('Not Found', { status: 404 });
    }

    const ext = fullPath.split('.').pop();
    return serveListingMediaFile(
      request,
      fullPath,
      `img-${imagePath}`,
      mimeByExt(ext)
    );
  } catch (error) {
    console.error('Error serving image:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
