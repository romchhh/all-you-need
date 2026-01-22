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

  const listing = result[0];
  // Конвертуємо hasUsedFreeAd з INTEGER (0/1) в boolean
  listing.hasUsedFreeAd = Boolean(listing.hasUsedFreeAd);
  
  return listing;
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
    const nowISO = new Date().toISOString();
    await prisma.$executeRawUnsafe(
      `UPDATE PromotionPurchase 
       SET status = 'active',
           startsAt = ?,
           endsAt = ?
       WHERE id = ?`,
      nowISO,
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
async function refundPromotions(listingId: number, userId: number, reason: string): Promise<{ refunded: boolean; totalAmount: number }> {
  // Спочатку перевіряємо всі промоції для цього оголошення (для діагностики)
  const allPromotions = await prisma.$queryRawUnsafe(
    `SELECT id, price, promotionType, paymentMethod, status FROM PromotionPurchase
     WHERE listingId = ?`,
    listingId
  ) as Array<{ id: number; price: number; promotionType: string; paymentMethod: string; status: string }>;
  
  console.log(`[refundPromotions] All promotions for listing ${listingId}:`, allPromotions);
  
  // Шукаємо промоції, які ще не були повернуті (pending, paid, active, completed)
  // Виключаємо вже повернуті (refunded) та скасовані (cancelled)
  // 'completed' - статус для оплати з балансу
  const promotions = await prisma.$queryRawUnsafe(
    `SELECT id, price, promotionType, paymentMethod FROM PromotionPurchase
     WHERE listingId = ? AND status IN ('pending', 'paid', 'active', 'completed')`,
    listingId
  ) as Array<{ id: number; price: number; promotionType: string; paymentMethod: string }>;

  console.log(`[refundPromotions] Promotions to refund for listing ${listingId}:`, promotions.length, promotions);

  if (promotions.length === 0) {
    console.log(`[refundPromotions] No promotions to refund for listing ${listingId}. All promotions:`, allPromotions.map(p => ({ id: p.id, status: p.status, paymentMethod: p.paymentMethod })));
    return { refunded: false, totalAmount: 0 };
  }

  const nowStr = nowSQLite();
  let refundedAny = false;
  let totalRefunded = 0;

  for (const promo of promotions) {
    // Повертаємо кошти тільки якщо оплата була з балансу
    // Якщо оплата була через direct (Monobank), кошти не повертаємо на баланс
    if (promo.paymentMethod === 'balance') {
      // Повертаємо кошти на баланс
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

      totalRefunded += promo.price;
      console.log(`[refundPromotions] Refunded ${promo.price} EUR to balance for promotion ${promo.id} (listing ${listingId})`);
      refundedAny = true;
    } else {
      console.log(`[refundPromotions] Promotion ${promo.id} paid via ${promo.paymentMethod}, no balance refund needed`);
    }

    // Оновлюємо статус реклами на 'refunded' незалежно від способу оплати
    await prisma.$executeRawUnsafe(
      `UPDATE PromotionPurchase 
       SET status = 'refunded'
       WHERE id = ?`,
      promo.id
    );
  }

  return { refunded: refundedAny, totalAmount: totalRefunded };
}

/**
 * Відхиляє оголошення, повертає кошти та встановлює статус 'rejected'
 * Оголошення залишається в системі для можливості редагування
 */
export async function rejectListing(
  listing: ListingWithUser, 
  reason: string,
  moderatedBy?: number
): Promise<{ refundedPackage: boolean; refundedPromotions: boolean; promotionRefundAmount: number }> {
  const nowStr = nowSQLite();
  
  // Перевіряємо чи платні оголошення увімкнені
  const paidListingsEnabled = await getSystemSetting('paidListingsEnabled', false);

  let refundedPackage = false;
  let refundedPromotions = false;
  let promotionRefundAmount = 0;

  // Повертаємо пакет якщо це було платне оголошення
  // Якщо hasUsedFreeAd = true, значить користувач вже використав безкоштовне оголошення
  // і це оголошення створене через платний пакет
  // Конвертуємо hasUsedFreeAd в boolean на випадок якщо прийшло як число
  const hasUsedFreeAd = Boolean(listing.hasUsedFreeAd);
  
  if (paidListingsEnabled && hasUsedFreeAd) {
    await refundListingPackage(listing.userId, listing.id, listing.title, reason);
    refundedPackage = true;
    console.log(`[rejectListing] Package refunded for listing ${listing.id}, user ${listing.userId}, hasUsedFreeAd: ${hasUsedFreeAd}`);
  } else if (!paidListingsEnabled) {
    console.log(`[rejectListing] Paid listings disabled, no package refund needed for listing ${listing.id}`);
  } else if (!hasUsedFreeAd) {
    console.log(`[rejectListing] First free listing (hasUsedFreeAd: ${hasUsedFreeAd}), no package refund needed for listing ${listing.id}`);
  }

  // Повертаємо кошти за рекламу (тільки якщо оплачено з балансу)
  console.log(`[rejectListing] Starting refund promotions for listing ${listing.id}, user ${listing.userId}`);
  const promotionRefund = await refundPromotions(listing.id, listing.userId, reason);
  refundedPromotions = promotionRefund.refunded;
  promotionRefundAmount = promotionRefund.totalAmount;
  console.log(`[rejectListing] Promotion refund result:`, { refunded: refundedPromotions, amount: promotionRefundAmount });

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
    { 
      refundedPackage, 
      refundedPromotions, 
      promotionRefundAmount: promotionRefundAmount || 0
    }
  ).catch(err => {
    console.error('[rejectListing] Failed to send Telegram notification:', err);
  });

  console.log(`[rejectListing] Listing ${listing.id} rejected (status set to 'rejected'). User can edit and resubmit.`);

  return { refundedPackage, refundedPromotions, promotionRefundAmount };
}
