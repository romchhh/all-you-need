import { prisma, ensurePromotionPurchaseTable } from '@/lib/prisma';
import { nowSQLite } from './dateHelpers';
import { createTransaction } from './dbHelpers';
import { 
  PACKAGE_PRICES, 
  PROMOTION_PRICES, 
  isValidPackageType,
  isValidPromotionType
} from './paymentConstants';
import type { 
  PackageType, 
  PromotionType, 
  PaymentMethod
} from './paymentConstants';

// Re-export for backward compatibility
export { 
  PACKAGE_PRICES, 
  PROMOTION_PRICES, 
  isValidPackageType,
  isValidPromotionType
};

export type {
  PackageType,
  PromotionType,
  PaymentMethod
};

/**
 * Обробляє оплату пакету оголошень з балансу
 */
export async function processPackagePurchaseFromBalance(
  userId: number,
  currentBalance: number,
  currentPackagesBalance: number,
  packageType: PackageType
): Promise<{ newBalance: number; newPackagesBalance: number }> {
  const packageInfo = PACKAGE_PRICES[packageType];

  if (currentBalance < packageInfo.price) {
    throw new Error('Insufficient balance');
  }

  const nowStr = nowSQLite();
  const newBalance = currentBalance - packageInfo.price;
  const newPackagesBalance = currentPackagesBalance + packageInfo.count;

  // Оновлюємо баланс користувача
  await prisma.$executeRawUnsafe(
    `UPDATE User 
     SET balance = ?, 
         listingPackagesBalance = ?, 
         updatedAt = ?
     WHERE id = ?`,
    newBalance,
    newPackagesBalance,
    nowStr,
    userId
  );

  // Створюємо транзакцію
  await createTransaction({
    userId,
    type: 'payment',
    amount: packageInfo.price,
    currency: 'EUR',
    status: 'completed',
    description: `Покупка пакету: ${packageInfo.count} оголошень`,
  });

  return { newBalance, newPackagesBalance };
}

/**
 * Оновлює Listing після запису рядка в PromotionPurchase (оплата або адмін-нарахування).
 */
export async function applyPromotionPurchaseToListing(
  listingId: number,
  promotionType: PromotionType,
  endsAt: Date,
  nowStr: string
): Promise<void> {
  await ensurePromotionPurchaseTable();
  const listing = await prisma.$queryRawUnsafe(
    `SELECT status FROM Listing WHERE id = ?`,
    listingId
  ) as Array<{ status: string }>;

  const currentStatus = listing[0]?.status;

  if (currentStatus !== 'active' && currentStatus !== 'pending_moderation') {
    const activePromos = await prisma.$queryRawUnsafe(
      `SELECT promotionType FROM PromotionPurchase 
       WHERE listingId = ? 
         AND status IN ('active', 'paid', 'completed')
         AND (endsAt IS NULL OR datetime(endsAt) > datetime('now'))`,
      listingId
    ) as Array<{ promotionType: string }>;

    const activeTypes = activePromos.map(p => p.promotionType);
    let combinedType: string = promotionType;

    if ((promotionType === 'highlighted' && activeTypes.includes('top_category')) ||
        (promotionType === 'top_category' && activeTypes.includes('highlighted'))) {
      combinedType = 'highlighted,top_category';
    }

    if (currentStatus === 'rejected') {
      await prisma.$executeRawUnsafe(
        `UPDATE Listing SET 
          promotionType = ?, 
          promotionEnds = ?, 
          status = 'pending_moderation',
          moderationStatus = 'pending',
          rejectionReason = NULL,
          updatedAt = ? 
        WHERE id = ?`,
        combinedType,
        endsAt.toISOString(),
        nowStr,
        listingId
      );
    } else {
      await prisma.$executeRawUnsafe(
        `UPDATE Listing SET 
          promotionType = ?, 
          promotionEnds = ?, 
          status = 'pending_moderation',
          moderationStatus = 'pending',
          updatedAt = ? 
        WHERE id = ?`,
        combinedType,
        endsAt.toISOString(),
        nowStr,
        listingId
      );
    }

    try {
      const { submitListingToModeration } = await import('./listingHelpers');
      await submitListingToModeration(listingId, currentStatus === 'rejected');
    } catch (error) {
      console.error('[applyPromotionPurchaseToListing] Error sending listing to moderation:', error);
    }
  } else {
    const activePromos = await prisma.$queryRawUnsafe(
      `SELECT promotionType FROM PromotionPurchase 
       WHERE listingId = ? 
         AND status IN ('active', 'paid', 'completed')
         AND (endsAt IS NULL OR datetime(endsAt) > datetime('now'))`,
      listingId
    ) as Array<{ promotionType: string }>;

    const activeTypes = activePromos.map(p => p.promotionType);

    if ((promotionType === 'highlighted' && activeTypes.includes('top_category')) ||
        (promotionType === 'top_category' && activeTypes.includes('highlighted'))) {
      const combinedType = activeTypes.includes('highlighted') && activeTypes.includes('top_category')
        ? 'highlighted,top_category'
        : (activeTypes.includes('highlighted') ? 'highlighted' : 'top_category');

      const allEndsAt = await prisma.$queryRawUnsafe(
        `SELECT endsAt FROM PromotionPurchase 
         WHERE listingId = ? 
           AND status IN ('active', 'paid', 'completed')
           AND (endsAt IS NULL OR datetime(endsAt) > datetime('now'))
         ORDER BY endsAt DESC LIMIT 1`,
        listingId
      ) as Array<{ endsAt: string | null }>;

      const latestEndsAt = allEndsAt.length > 0 && allEndsAt[0].endsAt
        ? allEndsAt[0].endsAt
        : endsAt.toISOString();

      await prisma.$executeRawUnsafe(
        `UPDATE Listing SET promotionType = ?, promotionEnds = ?, updatedAt = ? WHERE id = ?`,
        combinedType,
        latestEndsAt,
        nowStr,
        listingId
      );
    } else {
      await prisma.$executeRawUnsafe(
        `UPDATE Listing SET promotionType = ?, promotionEnds = ?, updatedAt = ? WHERE id = ?`,
        promotionType,
        endsAt.toISOString(),
        nowStr,
        listingId
      );
    }
  }
}

/**
 * Безкоштовне нарахування реклами з адмін-панелі (без списання балансу).
 */
export async function grantAdminPromotionForListing(
  listingUserId: number,
  listingId: number,
  promotionType: PromotionType,
  durationDays?: number
): Promise<{ promotionEnds: Date; durationDays: number }> {
  const promotionInfo = PROMOTION_PRICES[promotionType];
  const days =
    durationDays !== undefined
      ? Math.min(90, Math.max(1, Math.floor(durationDays)))
      : promotionInfo.duration;
  const nowStr = nowSQLite();
  const endsAt = new Date();
  endsAt.setDate(endsAt.getDate() + days);
  const startsIso = new Date().toISOString();
  const endsIso = endsAt.toISOString();

  await prisma.$executeRawUnsafe(
    `INSERT INTO PromotionPurchase (userId, listingId, promotionType, price, duration, paymentMethod, status, startsAt, endsAt, createdAt)
     VALUES (?, ?, ?, 0, ?, 'admin', 'completed', ?, ?, CURRENT_TIMESTAMP)`,
    listingUserId,
    listingId,
    promotionType,
    days,
    startsIso,
    endsIso
  );

  await applyPromotionPurchaseToListing(listingId, promotionType, endsAt, nowStr);
  return { promotionEnds: endsAt, durationDays: days };
}

/**
 * Обробляє оплату реклами з балансу
 */
export async function processPromotionPurchaseFromBalance(
  userId: number,
  currentBalance: number,
  promotionType: PromotionType,
  listingId?: number
): Promise<{ newBalance: number; promotionEnds: Date }> {
  const promotionInfo = PROMOTION_PRICES[promotionType];

  if (currentBalance < promotionInfo.price) {
    throw new Error('Insufficient balance');
  }

  const nowStr = nowSQLite();
  const endsAt = new Date();
  endsAt.setDate(endsAt.getDate() + promotionInfo.duration);

  const newBalance = currentBalance - promotionInfo.price;

  // Оновлюємо баланс користувача
  await prisma.$executeRawUnsafe(
    `UPDATE User SET balance = ?, updatedAt = ? WHERE id = ?`,
    newBalance,
    nowStr,
    userId
  );

  // Створюємо транзакцію
  await createTransaction({
    userId,
    type: 'payment',
    amount: promotionInfo.price,
    currency: 'EUR',
    status: 'completed',
    description: `Реклама: ${promotionType}`,
  });

  // Створюємо запис про покупку реклами (для можливості повернення коштів)
  await createPromotionPurchaseRecord(
    userId,
    promotionType,
    'balance',
    listingId || undefined,
    'completed' // Статус 'completed' для оплати з балансу
  );

  if (listingId) {
    await applyPromotionPurchaseToListing(listingId, promotionType, endsAt, nowStr);
  }

  return { newBalance, promotionEnds: endsAt };
}

/**
 * Створює запис про покупку пакету
 */
export async function createPackagePurchaseRecord(
  userId: number,
  packageType: PackageType,
  paymentMethod: PaymentMethod,
  status: 'pending' | 'completed' = 'completed',
  invoiceId?: string
): Promise<void> {
  const packageInfo = PACKAGE_PRICES[packageType];
  const expiresAt = new Date();
  expiresAt.setFullYear(expiresAt.getFullYear() + 1); // Діє 1 рік

  if (invoiceId) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO ListingPackagePurchase (userId, packageType, listingsCount, price, paymentMethod, status, expiresAt, invoiceId, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      userId,
      packageType,
      packageInfo.count,
      packageInfo.price,
      paymentMethod,
      status,
      expiresAt.toISOString().replace('T', ' ').substring(0, 19),
      invoiceId
    );
  } else {
    await prisma.$executeRawUnsafe(
      `INSERT INTO ListingPackagePurchase (userId, packageType, listingsCount, price, paymentMethod, status, expiresAt, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      userId,
      packageType,
      packageInfo.count,
      packageInfo.price,
      paymentMethod,
      status,
      expiresAt.toISOString().replace('T', ' ').substring(0, 19)
    );
  }
}

/**
 * Створює запис про покупку реклами
 */
export async function createPromotionPurchaseRecord(
  userId: number,
  promotionType: PromotionType,
  paymentMethod: PaymentMethod,
  listingId?: number,
  status: 'pending' | 'completed' = 'pending',
  invoiceId?: string
): Promise<void> {
  await ensurePromotionPurchaseTable();
  const promotionInfo = PROMOTION_PRICES[promotionType];
  const now = new Date();
  const endsAt = new Date();
  endsAt.setDate(endsAt.getDate() + promotionInfo.duration);

  // Якщо є invoiceId, додаємо його до запиту
  if (invoiceId) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO PromotionPurchase (userId, listingId, promotionType, price, duration, paymentMethod, status, invoiceId, startsAt, endsAt, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      userId,
      listingId || null,
      promotionType,
      promotionInfo.price,
      promotionInfo.duration,
      paymentMethod,
      status,
      invoiceId,
      now.toISOString(),
      endsAt.toISOString()
    );
  } else {
    await prisma.$executeRawUnsafe(
      `INSERT INTO PromotionPurchase (userId, listingId, promotionType, price, duration, paymentMethod, status, startsAt, endsAt, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      userId,
      listingId || null,
      promotionType,
      promotionInfo.price,
      promotionInfo.duration,
      paymentMethod,
      status,
      now.toISOString(),
      endsAt.toISOString()
    );
  }
}

/**
 * Генерує унікальний ID інвойсу
 */
export function generateInvoiceId(prefix: string, userId: number): string {
  return `${prefix}_${Date.now()}_${userId}`;
}
