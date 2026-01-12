import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  findUserByTelegramIdForListing,
  deductListingPackage,
  processAndUploadImages,
  parseExistingImages,
  updateListingToDraft,
  updateListingData,
  needsReactivation,
} from '@/utils/listingHelpers';

interface Listing {
  userId: number;
  images: string;
  status: string;
  moderationStatus: string;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const listingId = parseInt(id);
    const formData = await request.formData();

    // Отримуємо дані з форми
    const telegramId = formData.get('telegramId') as string;
    const title = formData.get('title') as string;
    const description = formData.get('description') as string;
    const price = formData.get('price') as string;
    const currency = (formData.get('currency') as 'UAH' | 'EUR' | 'USD') || 'UAH';
    const isFree = formData.get('isFree') === 'true';
    const category = formData.get('category') as string;
    const subcategory = formData.get('subcategory') as string | null;
    const condition = formData.get('condition') as string | null;
    const location = formData.get('location') as string;
    const requestedStatus = formData.get('status') as string | null;

    // Знаходимо користувача
    const user = await findUserByTelegramIdForListing(telegramId);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Отримуємо оголошення
    const listings = await prisma.$queryRawUnsafe(
      `SELECT userId, images, status, moderationStatus FROM Listing WHERE id = ?`,
      listingId
    ) as Listing[];

    if (listings.length === 0) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
    }

    const listing = listings[0];

    // Перевіряємо власника
    if (listing.userId !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Обробляємо зображення
    const imageFiles = formData.getAll('images') as File[];
    const existingImages = parseExistingImages(listing.images);
    const imageUrls = await processAndUploadImages(imageFiles, existingImages);

    const listingData = {
      title,
      description,
      price,
      currency,
      isFree,
      category,
      subcategory,
      condition,
      location,
    };

    // Перевіряємо чи потрібна реактивація (зміна статусу на 'active' з будь-якого іншого статусу)
    if (needsReactivation(listing.status, requestedStatus || '')) {
      console.log('[Update Listing] Reactivating listing from status:', listing.status, 'to:', requestedStatus);

      // Списуємо пакет
      const hasPackage = await deductListingPackage(user);
      if (!hasPackage) {
        return NextResponse.json(
          { error: 'No available listings. Please purchase a package.', needsPackage: true },
          { status: 400 }
        );
      }

      // Оновлюємо дані оголошення, але НЕ змінюємо статус - залишаємо поточний статус
      // Статус буде змінено тільки після вибору реклами (або пропуску) на pending_moderation
      const now = new Date();
      const nowStr = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 19).replace('T', ' ');
      const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const expiresAtStr = new Date(expiresAt.getTime() - expiresAt.getTimezoneOffset() * 60000).toISOString().slice(0, 19).replace('T', ' ');
      
      await prisma.$executeRawUnsafe(
        `UPDATE Listing SET
          title = ?, description = ?, price = ?, currency = ?, isFree = ?,
          category = ?, subcategory = ?, condition = ?, location = ?,
          images = ?, expiresAt = ?, updatedAt = ?, rejectionReason = NULL
        WHERE id = ?`,
        listingData.title,
        listingData.description,
        listingData.price,
        listingData.currency,
        listingData.isFree ? 1 : 0,
        listingData.category,
        listingData.subcategory || null,
        listingData.condition || null,
        listingData.location,
        JSON.stringify(imageUrls),
        expiresAtStr,
        nowStr,
        listingId
      );

      return NextResponse.json({
        success: true,
        needsPromotionSelection: true,
        listingId,
        message: 'Listing updated, ready for promotion selection',
      });
    }

    // Звичайне оновлення без реактивації (не змінюємо статус на 'active')
    await updateListingData(listingId, listingData, imageUrls, requestedStatus || undefined);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Update Listing] Error:', error);
    return NextResponse.json(
      { error: 'Failed to update listing' },
      { status: 500 }
    );
  }
}
