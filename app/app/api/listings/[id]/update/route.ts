import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import sharp from 'sharp';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const listingId = parseInt(id);
    const formData = await request.formData();

    const title = formData.get('title') as string;
    const description = formData.get('description') as string;
    const price = formData.get('price') as string;
    const isFree = formData.get('isFree') === 'true';
    const category = formData.get('category') as string;
    const subcategory = formData.get('subcategory') as string | null;
    const condition = formData.get('condition') as string | null;
    const location = formData.get('location') as string;
    const status = formData.get('status') as string | null;
    const telegramId = formData.get('telegramId') as string;

    // Перевіряємо чи користувач є власником
    const user = await prisma.$queryRawUnsafe(
      `SELECT id FROM User WHERE CAST(telegramId AS INTEGER) = ?`,
      parseInt(telegramId)
    ) as Array<{ id: number }>;

    if (!user[0]) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
      select: { userId: true, images: true },
    });

    if (!listing) {
      return NextResponse.json(
        { error: 'Listing not found' },
        { status: 404 }
      );
    }

    if (listing.userId !== user[0].id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    // Обробка зображень
    const imageFiles = formData.getAll('images') as File[];
    let imageUrls: string[] = [];

    if (imageFiles.length > 0 && imageFiles[0].size > 0) {
      const uploadsDir = join(process.cwd(), 'public', 'listings');
      if (!existsSync(uploadsDir)) {
        await mkdir(uploadsDir, { recursive: true });
      }

      for (const file of imageFiles) {
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        
        const optimizedBuffer = await sharp(buffer)
          .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
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
    } else {
      // Використовуємо старі зображення
      imageUrls = typeof listing.images === 'string' 
        ? JSON.parse(listing.images) 
        : listing.images || [];
    }

    // Оновлюємо оголошення
    const updateTime = new Date().toISOString();
    
    await prisma.$executeRawUnsafe(
      `UPDATE Listing SET
        title = ?,
        description = ?,
        price = ?,
        isFree = ?,
        category = ?,
        subcategory = ?,
        condition = ?,
        location = ?,
        status = ?,
        images = ?,
        updatedAt = ?
      WHERE id = ?`,
      title,
      description,
      price,
      isFree ? 1 : 0,
      category,
      subcategory || null,
      condition || null,
      location,
      status || 'active',
      JSON.stringify(imageUrls),
      updateTime,
      listingId
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating listing:', error);
    return NextResponse.json(
      { error: 'Failed to update listing' },
      { status: 500 }
    );
  }
}

