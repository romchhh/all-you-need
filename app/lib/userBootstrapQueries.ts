import { prisma } from '@/lib/prisma';

export type UserListingStatsPayload = {
  totalListings: number;
  totalViews: number;
  soldListings: number;
  activeListings: number;
  createdAt: string;
};

/** Та сама логіка, що GET /api/user/language (legacy User, потім колонка User.language). */
export async function getUserLanguageForTelegramId(telegramId: string): Promise<'uk' | 'ru'> {
  const telegramIdNum = parseInt(telegramId, 10);
  if (Number.isNaN(telegramIdNum)) return 'uk';

  try {
    const legacyUsers = (await prisma.$queryRawUnsafe(
      `SELECT language FROM users_legacy WHERE user_id = ?`,
      telegramId
    )) as Array<{ language: string | null }>;

    if (legacyUsers.length > 0 && legacyUsers[0].language) {
      const l = legacyUsers[0].language;
      if (l === 'uk' || l === 'ru') return l;
    }
  } catch {
    // ignore
  }

  try {
    const users = (await prisma.$queryRawUnsafe(
      `SELECT language FROM User WHERE CAST(telegramId AS INTEGER) = ?`,
      telegramIdNum
    )) as Array<{ language: string | null }>;

    if (users.length > 0 && users[0].language) {
      const l = users[0].language;
      if (l === 'uk' || l === 'ru') return l;
    }
  } catch {
    // ignore
  }

  return 'uk';
}

/** Та сама агрегація, що GET /api/user/stats. */
export async function getUserListingStatsForUserId(
  userId: number,
  createdAt: string
): Promise<UserListingStatsPayload> {
  const stats = (await prisma.$queryRawUnsafe(
    `SELECT 
        COUNT(*) as totalListings,
        SUM(views) as totalViews,
        SUM(CASE WHEN status = 'sold' THEN 1 ELSE 0 END) as soldListings,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as activeListings
      FROM Listing
      WHERE userId = ?`,
    userId
  )) as Array<{
    totalListings: bigint;
    totalViews: bigint;
    soldListings: bigint;
    activeListings: bigint;
  }>;

  const stat = stats[0] || {
    totalListings: BigInt(0),
    totalViews: BigInt(0),
    soldListings: BigInt(0),
    activeListings: BigInt(0),
  };

  return {
    totalListings: Number(stat.totalListings),
    totalViews: Number(stat.totalViews),
    soldListings: Number(stat.soldListings),
    activeListings: Number(stat.activeListings),
    createdAt,
  };
}
