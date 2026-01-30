import { prisma } from '@/lib/prisma';
import { executeWithRetry } from '@/lib/prisma';

export interface UserBalance {
  balance: number;
  listingPackagesBalance: number;
  hasUsedFreeAd: boolean;
}

export interface UserData {
  id: number;
  telegramId: number;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  avatar: string | null;
  balance: number;
  rating: number;
  reviewsCount: number;
  listingPackagesBalance?: number;
  hasUsedFreeAd?: boolean;
}

/**
 * Знаходить користувача за telegramId
 */
export async function findUserByTelegramId(telegramId: number): Promise<UserData | null> {
  const users = await prisma.$queryRawUnsafe(
    `SELECT 
      id,
      CAST(telegramId AS INTEGER) as telegramId,
      username,
      firstName,
      lastName,
      avatar,
      balance,
      rating,
      reviewsCount,
      listingPackagesBalance,
      hasUsedFreeAd
    FROM User
    WHERE CAST(telegramId AS INTEGER) = ?`,
    telegramId
  ) as any[];

  if (users.length === 0) {
    return null;
  }

  const user = users[0];
  return {
    ...user,
    hasUsedFreeAd: Boolean(user.hasUsedFreeAd),
  };
}

/**
 * Отримує баланс користувача
 */
export async function getUserBalance(telegramId: number): Promise<UserBalance | null> {
  const users = await prisma.$queryRawUnsafe(
    `SELECT balance, listingPackagesBalance, hasUsedFreeAd 
     FROM User 
     WHERE CAST(telegramId AS INTEGER) = ?`,
    telegramId
  ) as Array<{ balance: number; listingPackagesBalance: number; hasUsedFreeAd: number }>;

  if (users.length === 0) {
    return null;
  }

  return {
    balance: users[0].balance,
    listingPackagesBalance: users[0].listingPackagesBalance,
    hasUsedFreeAd: Boolean(users[0].hasUsedFreeAd),
  };
}

/**
 * Оновлює баланс користувача
 */
export async function updateUserBalance(
  userId: number,
  amount: number,
  type: 'add' | 'deduct'
): Promise<number> {
  const users = await prisma.$queryRawUnsafe(
    `SELECT balance FROM User WHERE id = ?`,
    userId
  ) as Array<{ balance: number }>;

  if (users.length === 0) {
    throw new Error('User not found');
  }

  const currentBalance = users[0].balance;

  if (type === 'deduct' && currentBalance < amount) {
    throw new Error('Insufficient balance');
  }

  const newBalance = type === 'deduct' 
    ? currentBalance - amount 
    : currentBalance + amount;

  await prisma.$executeRawUnsafe(
    `UPDATE User SET balance = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
    newBalance,
    userId
  );

  return newBalance;
}

/**
 * Оновлює баланс пакетів оголошень
 */
export async function updateListingPackagesBalance(
  userId: number,
  count: number,
  type: 'add' | 'deduct'
): Promise<number> {
  const users = await prisma.$queryRawUnsafe(
    `SELECT listingPackagesBalance FROM User WHERE id = ?`,
    userId
  ) as Array<{ listingPackagesBalance: number }>;

  if (users.length === 0) {
    throw new Error('User not found');
  }

  const currentBalance = users[0].listingPackagesBalance;

  if (type === 'deduct' && currentBalance < count) {
    throw new Error('Insufficient listing packages');
  }

  const newBalance = type === 'deduct' 
    ? currentBalance - count 
    : currentBalance + count;

  await prisma.$executeRawUnsafe(
    `UPDATE User SET listingPackagesBalance = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
    newBalance,
    userId
  );

  return newBalance;
}

/**
 * Отримує мову користувача (uk | ru) за telegramId
 */
export async function getUserLanguage(telegramId: string | number): Promise<'uk' | 'ru'> {
  const id = typeof telegramId === 'string' ? parseInt(telegramId, 10) : telegramId;
  if (isNaN(id)) return 'uk';
  try {
    const legacy = await prisma.$queryRawUnsafe(
      `SELECT language FROM users_legacy WHERE user_id = ?`,
      telegramId.toString()
    ) as Array<{ language: string | null }>;
    if (legacy.length > 0 && (legacy[0].language === 'uk' || legacy[0].language === 'ru')) {
      return legacy[0].language as 'uk' | 'ru';
    }
  } catch {
    // legacy table may not exist
  }
  try {
    const users = await prisma.$queryRawUnsafe(
      `SELECT language FROM User WHERE CAST(telegramId AS INTEGER) = ?`,
      id
    ) as Array<{ language: string | null }>;
    if (users.length > 0 && (users[0].language === 'uk' || users[0].language === 'ru')) {
      return users[0].language as 'uk' | 'ru';
    }
  } catch {
    // language column may not exist
  }
  return 'uk';
}

/**
 * Парсить telegramId з різних форматів
 */
export function parseTelegramId(telegramId: string | number): number {
  const parsed = typeof telegramId === 'string' ? parseInt(telegramId, 10) : telegramId;
  if (isNaN(parsed)) {
    throw new Error('Invalid telegramId format');
  }
  return parsed;
}
