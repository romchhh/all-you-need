import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSystemSetting } from '@/utils/dbHelpers';
import { toSQLiteDate, addDays, nowSQLite } from '@/utils/dateHelpers';
import { findUserByTelegramIdForListing, deductListingPackage } from '@/lib/listings/helpers';

// Реактивація оголошення - повний флоу як при створенні
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const listingId = parseInt((await params).id);
    const body = await request.json();
    const { telegramId, withPromotion, promotionType } = body;

    if (!telegramId) {
      return NextResponse.json(
        { error: 'Telegram ID is required' },
        { status: 400 }
      );
    }

    const telegramIdNum = parseInt(telegramId);

    console.log('[Reactivate Listing] Request data:', { listingId, telegramId, withPromotion, promotionType });

    // Знаходимо оголошення з користувачем
    const listings = await prisma.$queryRawUnsafe(
      `SELECT l.id,
              l.userId,
              u.telegramId
       FROM Listing l
       JOIN User u ON l.userId = u.id
       WHERE l.id = ?`,
      listingId
    ) as Array<{ id: number; userId: number; telegramId: string | number | bigint }>;

    if (listings.length === 0) {
      return NextResponse.json(
        { error: 'Listing not found' },
        { status: 404 }
      );
    }

    const listing = listings[0];

    if (String(listing.telegramId) !== String(telegramId)) {
      console.error('[Reactivate Listing] Unauthorized owner mismatch:', {
        listingId,
        ownerTelegramId: String(listing.telegramId),
        requestTelegramId: String(telegramId),
      });
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    // Знаходимо користувача для списання пакету
    const user = await findUserByTelegramIdForListing(telegramId);
    if (!user) {
      console.error('[Reactivate Listing] User not found:', telegramId);
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    console.log('[Reactivate Listing] User found:', { 
      userId: user.id, 
      hasUsedFreeAd: user.hasUsedFreeAd, 
      packagesBalance: user.listingPackagesBalance 
    });

    // Перевіряємо та списуємо пакет (якщо потрібно)
    const hasPackage = await deductListingPackage(user);
    if (!hasPackage) {
      console.error('[Reactivate Listing] No available packages:', { userId: user.id });
      return NextResponse.json(
        { error: 'No available listings. Please purchase a package.', needsPackage: true },
        { status: 400 }
      );
    }

    console.log('[Reactivate Listing] Package deducted successfully');

    // Реактивуємо оголошення зі статусом pending_moderation для проходження модерації
    const expiresAt = addDays(new Date(), 30); // 30 днів від реактивації
    const expiresAtStr = toSQLiteDate(expiresAt);
    const nowStr = nowSQLite();

    // Оновлюємо статус на pending_moderation, щоб оголошення пройшло через модерацію
    // Також оновлюємо createdAt, щоб реактивоване оголошення відображалося як нове в топі
    await prisma.$executeRawUnsafe(
      `UPDATE Listing 
       SET status = 'pending_moderation',
           moderationStatus = 'pending',
           createdAt = ?,
           expiresAt = ?,
           updatedAt = ?,
           rejectionReason = NULL
       WHERE id = ?`,
      nowStr,
      expiresAtStr,
      nowStr,
      listingId
    );

    console.log('[Reactivate Listing] Listing reactivated to pending_moderation status for moderation');

    // Форматуємо дату безпечно
    let expiresAtISO: string;
    try {
      expiresAtISO = expiresAt.toISOString();
    } catch (e) {
      console.error('[Reactivate Listing] Error formatting expiresAt:', e);
      // Якщо помилка форматування, використовуємо поточну дату + 30 днів
      const fallbackDate = new Date();
      fallbackDate.setDate(fallbackDate.getDate() + 30);
      expiresAtISO = fallbackDate.toISOString();
    }

    return NextResponse.json({
      success: true,
      message: 'Listing reactivated successfully',
      listingId,
      expiresAt: expiresAtISO,
      needsPromotionSelection: true, // Потрібно обрати промо
    });
  } catch (error) {
    console.error('[Reactivate Listing] Error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to reactivate listing',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
