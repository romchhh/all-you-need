import { prisma } from '@/lib/prisma';
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

  // Якщо є listingId, оновлюємо оголошення (promotionType, promotionEnds, і відправляємо на модерацію)
  if (listingId) {
    // Перевіряємо поточний статус оголошення
    const listing = await prisma.$queryRawUnsafe(
      `SELECT status FROM Listing WHERE id = ?`,
      listingId
    ) as Array<{ status: string }>;
    
    const currentStatus = listing[0]?.status;
    
    // Якщо оголошення НЕ в статусі active або pending_moderation, відправляємо на модерацію
    // (це означає, що воно було реактивовано і потребує модерації)
    if (currentStatus !== 'active' && currentStatus !== 'pending_moderation') {
      await prisma.$executeRawUnsafe(
        `UPDATE Listing SET 
          promotionType = ?, 
          promotionEnds = ?, 
          status = 'pending_moderation',
          moderationStatus = 'pending',
          updatedAt = ? 
        WHERE id = ?`,
        promotionType,
        endsAt.toISOString(),
        nowStr,
        listingId
      );
    } else {
      // Якщо вже active або pending_moderation, просто оновлюємо рекламу
      await prisma.$executeRawUnsafe(
        `UPDATE Listing SET promotionType = ?, promotionEnds = ?, updatedAt = ? WHERE id = ?`,
        promotionType,
        endsAt.toISOString(),
        nowStr,
        listingId
      );
    }
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
