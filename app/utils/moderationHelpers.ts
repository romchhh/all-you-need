import { prisma } from '@/lib/prisma';
import { sendListingApprovedNotification, sendListingRejectedNotification } from './telegramNotifications';
import { getSystemSetting, createTransaction } from './dbHelpers';
import { toSQLiteDate, addDays, nowSQLite } from './dateHelpers';
import { unlink } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

interface ListingWithUser {
  id: number;
  userId: number;
  title: string;
  telegramId: string;
  hasUsedFreeAd: boolean;
  listingPackagesBalance: number;
  balance: number;
  [key: string]: any;
}

/**
 * Отримує оголошення з інформацією про користувача
 */
export async function getListingWithUser(listingId: number): Promise<ListingWithUser | null> {
  const result = await prisma.$queryRawUnsafe(
    `SELECT l.*, 
            CAST(u.telegramId AS TEXT) as telegramId, 
            u.hasUsedFreeAd, 
            u.listingPackagesBalance, 
            u.balance
     FROM Listing l
     JOIN User u ON l.userId = u.id
     WHERE l.id = ?`,
    listingId
  ) as any[];

  if (result.length === 0) {
    return null;
  }

  return result[0];
}

/**
 * Схвалює оголошення
 */
export async function approveListing(listing: ListingWithUser): Promise<void> {
  const expiresAt = addDays(new Date(), 30);
  const expiresAtStr = toSQLiteDate(expiresAt);
  const nowStr = nowSQLite();
  
  // Оновлюємо оголошення - встановлюємо статус 'active'
  await prisma.$executeRawUnsafe(
    `UPDATE Listing 
     SET status = 'active',
         moderationStatus = NULL,
         publishedAt = ?,
         moderatedAt = ?,
         expiresAt = ?,
         updatedAt = ?
     WHERE id = ?`,
    nowStr,
    nowStr,
    expiresAtStr,
    nowStr,
    listing.id
  );

  // Активуємо куплену рекламу (перевіряємо статус 'pending' або 'paid')
  const promotionResult = await prisma.$queryRawUnsafe(
    `SELECT id, promotionType, duration FROM PromotionPurchase 
     WHERE listingId = ? AND status IN ('pending', 'paid')
     ORDER BY id DESC LIMIT 1`,
    listing.id
  ) as Array<{ id: number; promotionType: string; duration: number }>;

  if (promotionResult.length > 0) {
    const promo = promotionResult[0];
    
    // Розраховуємо дату закінчення промо
    const promoEndsAt = new Date();
    promoEndsAt.setDate(promoEndsAt.getDate() + promo.duration);
    const promoEndsAtStr = toSQLiteDate(promoEndsAt);
    
    // Активуємо промо
    await prisma.$executeRawUnsafe(
      `UPDATE PromotionPurchase 
       SET status = 'active',
           startsAt = ?,
           endsAt = ?
       WHERE id = ?`,
      nowStr,
      promoEndsAtStr,
      promo.id
    );
    
    // Оновлюємо Listing з promotionType та promotionEnds
    await prisma.$executeRawUnsafe(
      `UPDATE Listing 
       SET promotionType = ?, 
           promotionEnds = ?, 
           updatedAt = ? 
       WHERE id = ?`,
      promo.promotionType,
      promoEndsAtStr,
      nowStr,
      listing.id
    );
    
    console.log(`[approveListing] Promotion activated: ${promo.promotionType} for listing ${listing.id}`);
  }

  // Надсилаємо повідомлення
  await sendListingApprovedNotification(
    listing.telegramId,
    listing.title,
    listing.id,
    expiresAt
  ).catch(err => {
    console.error('[approveListing] Failed to send Telegram notification:', err);
  });
}

/**
 * Повертає пакет оголошення користувачу
 */
async function refundListingPackage(
  userId: number, 
  listingId: number, 
  title: string, 
  reason: string
): Promise<void> {
  const nowStr = nowSQLite();
  
  await prisma.$executeRawUnsafe(
    `UPDATE User 
     SET listingPackagesBalance = listingPackagesBalance + 1,
         updatedAt = ?
     WHERE id = ?`,
    nowStr,
    userId
  );

  await createTransaction({
    userId,
    type: 'refund',
    amount: 0,
    currency: 'EUR',
    status: 'completed',
    description: `Повернення пакету: оголошення "${title}" відхилено модератором`,
    metadata: { listingId, reason },
  });
}

/**
 * Видаляє фотографії оголошення з диска
 */
async function deleteListingImages(images: string | string[]): Promise<void> {
  try {
    const imageArray = typeof images === 'string' ? JSON.parse(images) : images;
    
    if (!Array.isArray(imageArray)) {
      return;
    }

    const uploadsDir = join(process.cwd(), 'public');

    for (const imagePath of imageArray) {
      try {
        // Видаляємо початковий слеш якщо є
        const cleanPath = imagePath.startsWith('/') ? imagePath.slice(1) : imagePath;
        const fullPath = join(uploadsDir, cleanPath);

        if (existsSync(fullPath)) {
          await unlink(fullPath);
          console.log(`[deleteListingImages] Deleted image: ${fullPath}`);
        }
      } catch (err) {
        console.error(`[deleteListingImages] Failed to delete image ${imagePath}:`, err);
      }
    }
  } catch (err) {
    console.error('[deleteListingImages] Error parsing images:', err);
  }
}

/**
 * Повертає кошти за рекламу
 */
async function refundPromotions(listingId: number, userId: number, reason: string): Promise<boolean> {
  // Шукаємо промоції, які ще не були повернуті (pending, paid, active)
  // Виключаємо вже повернуті (refunded) та скасовані (cancelled)
  const promotions = await prisma.$queryRawUnsafe(
    `SELECT id, price, promotionType FROM PromotionPurchase
     WHERE listingId = ? AND status IN ('pending', 'paid', 'active')`,
    listingId
  ) as Array<{ id: number; price: number; promotionType: string }>;

  if (promotions.length === 0) {
    return false;
  }

  const nowStr = nowSQLite();

  for (const promo of promotions) {
    // Повертаємо кошти
    await prisma.$executeRawUnsafe(
      `UPDATE User 
       SET balance = balance + ?,
           updatedAt = ?
       WHERE id = ?`,
      promo.price,
      nowStr,
      userId
    );

    // Створюємо транзакцію
    await createTransaction({
      userId,
      type: 'refund',
      amount: promo.price,
      currency: 'EUR',
      status: 'completed',
      description: 'Повернення коштів за рекламу (оголошення відхилено)',
      metadata: { listingId, promotionType: promo.promotionType, reason },
    });

    // Оновлюємо статус реклами
    await prisma.$executeRawUnsafe(
      `UPDATE PromotionPurchase 
       SET status = 'refunded'
       WHERE id = ?`,
      promo.id
    );
  }

  return true;
}

/**
 * Відхиляє оголошення, повертає кошти та встановлює статус 'rejected'
 * Оголошення залишається в системі для можливості редагування
 */
export async function rejectListing(
  listing: ListingWithUser, 
  reason: string,
  moderatedBy?: number
): Promise<{ refundedPackage: boolean; refundedPromotions: boolean }> {
  const nowStr = nowSQLite();
  
  // Перевіряємо чи платні оголошення увімкнені
  const paidListingsEnabled = await getSystemSetting('paidListingsEnabled', false);

  let refundedPackage = false;
  let refundedPromotions = false;

  // Повертаємо пакет якщо це було платне оголошення
  if (paidListingsEnabled && listing.hasUsedFreeAd) {
    await refundListingPackage(listing.userId, listing.id, listing.title, reason);
    refundedPackage = true;
  }

  // Повертаємо кошти за рекламу
  refundedPromotions = await refundPromotions(listing.id, listing.userId, reason);

  // Оновлюємо статус оголошення на 'rejected' замість видалення
  // Це дозволяє користувачу редагувати оголошення та повторно подати на модерацію
  await prisma.$executeRawUnsafe(
    `UPDATE Listing 
     SET status = 'rejected',
         moderationStatus = 'rejected',
         rejectionReason = ?,
         moderatedAt = ?,
         moderatedBy = ?,
         updatedAt = ?
     WHERE id = ?`,
    reason,
    nowStr,
    moderatedBy || null,
    nowStr,
    listing.id
  );

  // Надсилаємо повідомлення користувачу
  await sendListingRejectedNotification(
    listing.telegramId,
    listing.title,
    reason,
    { refundedPackage, refundedPromotions }
  ).catch(err => {
    console.error('[rejectListing] Failed to send Telegram notification:', err);
  });

  console.log(`[rejectListing] Listing ${listing.id} rejected (status set to 'rejected'). User can edit and resubmit.`);

  return { refundedPackage, refundedPromotions };
}
