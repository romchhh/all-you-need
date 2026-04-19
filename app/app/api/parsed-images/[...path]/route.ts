import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { extname, join, resolve } from 'path';
import { NextRequest, NextResponse } from 'next/server';

const parsedPhotosBaseDir = resolve(process.cwd(), '..', 'database', 'parsed_photos');

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

    const normalizedPath = imagePath
      .replace(/^database\/parsed_photos\//, '')
      .replace(/^parsed_photos\//, '');
    const fullPath = resolve(join(parsedPhotosBaseDir, normalizedPath));

    if (!fullPath.startsWith(parsedPhotosBaseDir) || !existsSync(fullPath)) {
      return new NextResponse('Not Found', { status: 404 });
    }

    const fileBuffer = await readFile(fullPath);
    const ext = extname(fullPath);
    const contentType = mimeByExt(ext);

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        ETag: `"parsed-${normalizedPath}-${fileBuffer.length}"`,
      },
    });
  } catch (error) {
    console.error('[parsed-images] serve failed', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

