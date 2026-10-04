import { prisma } from '@/lib/prisma';
import {
  normalizeTelegramIdForDb,
  normalizePgBoolean,
  sqlUserTelegramIdWhere,
  usersLegacyTelegramIdWhere,
} from '@/lib/dbSql';
import { executeWithRetry, ensureUserApiRawColumns } from '@/lib/prisma';

export interface UserBalance {
  balance: number;
  listingPackagesBalance: number;
  hasUsedFreeAd: boolean;
}

export interface UserData {
  id: number;
  /** Full Telegram id as string (safe for large ids). */
  telegramId: string;
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

function mapUserRow(user: Record<string, unknown>): UserData {
  return {
    id: Number(user.id),
    telegramId: String(user.telegramId ?? ''),
    username: (user.username as string | null) ?? null,
    firstName: (user.firstName as string | null) ?? null,
    lastName: (user.lastName as string | null) ?? null,
    avatar: (user.avatar as string | null) ?? null,
    balance: Number(user.balance) || 0,
    rating: Number(user.rating) || 0,
    reviewsCount: Number(user.reviewsCount) || 0,
    listingPackagesBalance: Number(user.listingPackagesBalance) || 0,
    hasUsedFreeAd: Boolean(user.hasUsedFreeAd),
  };
}

/**
 * Знаходить користувача за telegramId (рядок або число; у БД порівняння через TEXT).
 */
export async function findUserByTelegramId(
  telegramId: string | number | bigint
): Promise<UserData | null> {
  const key = normalizeTelegramIdForDb(telegramId);
  if (!key) return null;

  await ensureUserApiRawColumns();
  const users = (await prisma.$queryRawUnsafe(
    `SELECT 
      id,
      CAST(telegramId AS TEXT) as telegramId,
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
    WHERE ${sqlUserTelegramIdWhere('?')}`,
    key
  )) as Record<string, unknown>[];

  if (users.length === 0) {
    return null;
  }

  return mapUserRow(users[0]);
}

/**
 * Отримує баланс користувача
 */
export async function getUserBalance(
  telegramId: string | number | bigint
): Promise<UserBalance | null> {
  const key = normalizeTelegramIdForDb(telegramId);
  if (!key) return null;

  await ensureUserApiRawColumns();
  const users = (await prisma.$queryRawUnsafe(
    `SELECT balance, listingPackagesBalance, hasUsedFreeAd 
     FROM User 
     WHERE ${sqlUserTelegramIdWhere('?')}`,
    key
  )) as Array<{ balance: number; listingPackagesBalance: number; hasUsedFreeAd: number }>;

  if (users.length === 0) {
    return null;
  }

  return {
    balance: Number(users[0].balance) || 0,
    listingPackagesBalance: Number(users[0].listingPackagesBalance) || 0,
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
  const users = (await prisma.$queryRawUnsafe(
    `SELECT balance FROM User WHERE id = ?`,
    userId
  )) as Array<{ balance: number }>;

  if (users.length === 0) {
    throw new Error('User not found');
  }

  const currentBalance = users[0].balance;

  if (type === 'deduct' && currentBalance < amount) {
    throw new Error('Insufficient balance');
  }

  const newBalance = type === 'deduct' ? currentBalance - amount : currentBalance + amount;

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
  const users = (await prisma.$queryRawUnsafe(
    `SELECT listingPackagesBalance FROM User WHERE id = ?`,
    userId
  )) as Array<{ listingPackagesBalance: number }>;

  if (users.length === 0) {
    throw new Error('User not found');
  }

  const currentBalance = users[0].listingPackagesBalance;

  if (type === 'deduct' && currentBalance < count) {
    throw new Error('Insufficient listing packages');
  }

  const newBalance = type === 'deduct' ? currentBalance - count : currentBalance + count;

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
export async function getUserLanguage(telegramId: string | number | bigint): Promise<'uk' | 'ru'> {
  const key = normalizeTelegramIdForDb(telegramId);
  if (!key) return 'uk';

  try {
    const legacy = (await prisma.$queryRawUnsafe(
      `SELECT language FROM users_legacy WHERE ${usersLegacyTelegramIdWhere('?')}`,
      key
    )) as Array<{ language: string | null }>;
    if (legacy.length > 0 && (legacy[0].language === 'uk' || legacy[0].language === 'ru')) {
      return legacy[0].language as 'uk' | 'ru';
    }
  } catch {
    // legacy table may not exist
  }
  try {
    const users = (await prisma.$queryRawUnsafe(
      `SELECT language FROM User WHERE ${sqlUserTelegramIdWhere('?')}`,
      key
    )) as Array<{ language: string | null }>;
    if (users.length > 0 && (users[0].language === 'uk' || users[0].language === 'ru')) {
      return users[0].language as 'uk' | 'ru';
    }
  } catch {
    // language column may not exist
  }
  return 'uk';
}

/**
 * Парсить telegramId для JS (може втратити точність для id > 2^53).
 * Для запитів до БД використовуйте normalizeTelegramIdForDb / findUserByTelegramId(string).
 */
export function parseTelegramId(telegramId: string | number | bigint): number {
  const key = normalizeTelegramIdForDb(telegramId);
  if (!key) {
    throw new Error('Invalid telegramId format');
  }
  const parsed = Number(key);
  if (!Number.isFinite(parsed)) {
    throw new Error('Invalid telegramId format');
  }
  return parsed;
}

/**
 * Повертає userId та isActive за telegramId. null якщо користувача немає.
 */
export async function getUserIdAndActive(
  telegramId: string | number | bigint
): Promise<{ userId: number; isActive: boolean } | null> {
  const key = normalizeTelegramIdForDb(telegramId);
  if (!key) return null;

  const rows = (await prisma.$queryRawUnsafe(
    `SELECT id, isActive FROM User WHERE ${sqlUserTelegramIdWhere('?')}`,
    key
  )) as Array<{ id: number; isActive: number | boolean }>;

  if (rows.length === 0) return null;
  return {
    userId: rows[0].id,
    isActive: normalizePgBoolean(rows[0].isActive),
  };
}
