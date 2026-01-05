import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import sharp from 'sharp';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const telegramId = formData.get('telegramId') as string;
    const title = formData.get('title') as string;
    const description = formData.get('description') as string;
    const price = formData.get('price') as string;
    const currency = (formData.get('currency') as 'UAH' | 'EUR' | 'USD') || 'UAH';
    const isFree = formData.get('isFree') === 'true';
    const category = formData.get('category') as string;
    const subcategory = formData.get('subcategory') as string | null;
    const location = formData.get('location') as string;
    const condition = formData.get('condition') as string;
    const images = formData.getAll('images') as File[];

    if (!telegramId || !title || !description || !location || !category) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (images.length === 0) {
      return NextResponse.json(
        { error: 'At least one image is required' },
        { status: 400 }
      );
    }

    // Знаходимо користувача
    const telegramIdNum = parseInt(telegramId);
    const users = await prisma.$queryRawUnsafe(
      `SELECT id FROM User WHERE CAST(telegramId AS INTEGER) = ?`,
      telegramIdNum
    ) as Array<{ id: number }>;

    if (!users[0]) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const userId = users[0].id;

    // Завантажуємо зображення
    const uploadsDir = join(process.cwd(), 'public', 'listings');
    if (!existsSync(uploadsDir)) {
      await mkdir(uploadsDir, { recursive: true });
    }

    const imageUrls: string[] = [];
    for (const image of images) {
      const bytes = await image.arrayBuffer();
      const buffer = Buffer.from(bytes);
      
      // Конвертуємо в WebP з оптимізацією та виправленням орієнтації
      const optimizedBuffer = await sharp(buffer)
        .rotate() // Автоматично виправляє орієнтацію на основі EXIF даних
        .resize(1200, 1200, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: 85, effort: 4 })
        .toBuffer();
      
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(7);
      const filename = `listing_${timestamp}_${random}.webp`;
      const filepath = join(uploadsDir, filename);
      
      await writeFile(filepath, optimizedBuffer);
      // Зберігаємо шлях без query параметрів, API route сам обробить кешування
      imageUrls.push(`/listings/${filename}`);
    }

    // Створюємо оголошення
    const createTime = new Date().toISOString().replace('T', ' ').substring(0, 19);
    
    await prisma.$executeRawUnsafe(
      `INSERT INTO Listing (
        userId, title, description, price, currency, isFree, category, subcategory,
        condition, location, images, status, createdAt, updatedAt, publishedAt
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
      userId,
      title,
      description,
      price,
      currency,
      isFree ? 1 : 0,
      category,
      subcategory || null,
      condition || null,
      location,
      JSON.stringify(imageUrls),
      createTime,
      createTime,
      createTime
    );

    return NextResponse.json({
      success: true,
      message: 'Listing created successfully'
    });
  } catch (error) {
    console.error('Error creating listing:', error);
    return NextResponse.json(
      { error: 'Failed to create listing', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

