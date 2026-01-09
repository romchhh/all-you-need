import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await params;
    const imagePath = Array.isArray(path) ? path.join('/') : path;
    
    // Безпека: перевіряємо, що шлях не виходить за межі public
    if (!imagePath || imagePath.includes('..') || imagePath.startsWith('/')) {
      return new NextResponse('Not Found', { status: 404 });
    }

    const fullPath = join(process.cwd(), 'public', imagePath);
    
    // Перевіряємо, що файл існує
    if (!existsSync(fullPath)) {
      return new NextResponse('Not Found', { status: 404 });
    }

    // Читаємо файл
    const fileBuffer = await readFile(fullPath);
    
    // Визначаємо content type
    const ext = imagePath.split('.').pop()?.toLowerCase();
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

