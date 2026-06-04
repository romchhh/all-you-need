import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { basename, extname, join, resolve } from 'path';
import { existsSync } from 'fs';

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
    
    // Безпека: перевіряємо, що шлях не виходить за межі public
    if (!imagePath || imagePath.includes('..') || imagePath.startsWith('/')) {
      return new NextResponse('Not Found', { status: 404 });
    }

    const fullPath = findReadableListingImage(imagePath);
    
    if (!fullPath) {
      return new NextResponse('Not Found', { status: 404 });
    }

    // Читаємо файл
    const fileBuffer = await readFile(fullPath);
    
    // Визначаємо content type
    const ext = fullPath.split('.').pop()?.toLowerCase();
    const contentType = 
      ext === 'webp' ? 'image/webp' :
      ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' :
      ext === 'png' ? 'image/png' :
      ext === 'gif' ? 'image/gif' :
      'application/octet-stream';

    // Повертаємо зображення з headers, що дозволяють кешування
    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable', // Кешуємо на 1 рік
        'ETag': `"${imagePath}-${fileBuffer.length}"`, // Додаємо ETag для перевірки змін
      },
    });
  } catch (error) {
    console.error('Error serving image:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

