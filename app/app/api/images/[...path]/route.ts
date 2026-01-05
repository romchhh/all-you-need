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
    
    console.log('GET /api/images - requested path:', imagePath);
    
    // Безпека: перевіряємо, що шлях не виходить за межі public
    if (!imagePath || imagePath.includes('..') || imagePath.startsWith('/')) {
      console.log('GET /api/images - invalid path:', imagePath);
      return new NextResponse('Not Found', { status: 404 });
    }

    const fullPath = join(process.cwd(), 'public', imagePath);
    console.log('GET /api/images - full path:', fullPath);
    
    // Перевіряємо, що файл існує
    if (!existsSync(fullPath)) {
      console.log('GET /api/images - file not found:', fullPath);
      return new NextResponse('Not Found', { status: 404 });
    }
    
    console.log('GET /api/images - file found, reading:', fullPath);

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

    // Повертаємо зображення з headers, що забороняють кешування
    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });
  } catch (error) {
    console.error('Error serving image:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

