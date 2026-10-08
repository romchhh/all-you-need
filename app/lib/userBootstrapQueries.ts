import { prisma } from '@/lib/prisma';
import { normalizeTelegramIdForDb, usersLegacyTelegramIdWhere } from '@/lib/dbSql';

export type UserListingStatsPayload = {
  totalListings: number;
  totalViews: number;
  soldListings: number;
  activeListings: number;
  createdAt: string;
};

/** Мова інтерфейсу: users_legacy (Prisma User не має колонки language). */
export async function getUserLanguageForTelegramId(telegramId: string): Promise<'uk' | 'ru'> {
  const key = normalizeTelegramIdForDb(telegramId);
  if (!key) return 'uk';

  try {
    const legacyUsers = (await prisma.$queryRawUnsafe(
      `SELECT language FROM users_legacy WHERE ${usersLegacyTelegramIdWhere('?')}`,
      key
    )) as Array<{ language: string | null }>;

    if (legacyUsers.length > 0 && legacyUsers[0].language) {
      const l = legacyUsers[0].language;
      if (l === 'uk' || l === 'ru') return l;
    }
  } catch {
    // ignore
  }

  return 'uk';
}

/** Читає число з raw-рядка (PG може віддати camelCase або lowercase аліас). */
function readStatNumber(row: Record<string, unknown> | undefined, key: string): number {
  if (!row) return 0;
  const raw = row[key] ?? row[key.toLowerCase()];
  if (raw == null) return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

/** Та сама агрегація, що GET /api/user/stats. */
export async function getUserListingStatsForUserId(
  userId: number,
  createdAt: string
): Promise<UserListingStatsPayload> {
  const stats = (await prisma.$queryRawUnsafe(
    `SELECT 
        COUNT(*) as totalListings,
        COALESCE(SUM(views), 0) as totalViews,
        COALESCE(SUM(CASE WHEN status = 'sold' THEN 1 ELSE 0 END), 0) as soldListings,
        COALESCE(SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END), 0) as activeListings
      FROM Listing
      WHERE userId = ?`,
    userId
  )) as Array<Record<string, unknown>>;

  const stat = stats[0];

  return {
    totalListings: readStatNumber(stat, 'totalListings'),
    totalViews: readStatNumber(stat, 'totalViews'),
    soldListings: readStatNumber(stat, 'soldListings'),
    activeListings: readStatNumber(stat, 'activeListings'),
    createdAt,
  };
}
