import { prisma, executeWithRetry } from '@/lib/prisma';
import { foldCityKey } from '@/lib/city/cityNormalization';
import { ensureShareChatTables } from '@/lib/share/shareChatTables';
import { sqlBooleanIsTrue } from '@/lib/dbSql';

export type ShareChatItem = {
  id: number;
  title: string;
  subtitle: string | null;
  avatarUrl: string | null;
  cityKey: string | null;
  categorySlug: string | null;
  language: string;
  memberCount: number;
  postingAllowed: boolean;
  inviteLink: string | null;
  isSaved: boolean;
  isCustom: boolean;
  relevance: number;
};

export async function listShareChatsForListing(params: {
  userId: number;
  listingCityFold: string;
  listingCategory: string;
  languageFilter: string | null;
  categoryFilter: string | null;
  cityFilter: string | null;
}): Promise<ShareChatItem[]> {
  await ensureShareChatTables();

  const catalog = (await executeWithRetry(() =>
    prisma.$queryRawUnsafe(
      `SELECT c.id, c.title, c.subtitle, c.avatarUrl, c.cityKey, c.categorySlug,
              c.language, c.memberCount, c.postingAllowed, c.inviteLink, c.sortOrder,
              CASE WHEN usc.id IS NOT NULL THEN 1 ELSE 0 END AS isSaved
       FROM ShareChatCatalog c
       LEFT JOIN UserShareChat usc
         ON usc.catalogChatId = c.id AND usc.userId = ? AND usc.isSaved = 1
       WHERE ${sqlBooleanIsTrue('c.isActive')}
       ORDER BY c.sortOrder ASC, c.memberCount DESC`,
      params.userId
    )
  )) as Array<Record<string, unknown>>;

  const custom = (await executeWithRetry(() =>
    prisma.$queryRawUnsafe(
      `SELECT id, title, subtitle, inviteLink, language, memberCount
       FROM UserShareChat
       WHERE userId = ? AND source = 'custom' AND isSaved = 1
       ORDER BY id DESC`,
      params.userId
    )
  )) as Array<Record<string, unknown>>;

  const langWant = params.languageFilter && params.languageFilter !== 'all' ? params.languageFilter : null;
  const catWant = params.categoryFilter && params.categoryFilter !== 'all' ? params.categoryFilter : null;
  const cityWant = params.cityFilter ? foldCityKey(params.cityFilter) : params.listingCityFold;

  const items: ShareChatItem[] = [];

  for (const row of catalog) {
    const cityKey = row.cityKey ? String(row.cityKey) : null;
    const categorySlug = row.categorySlug ? String(row.categorySlug) : null;
    const language = String(row.language || 'ru');

    if (langWant && language !== langWant) continue;
    if (catWant && categorySlug && categorySlug !== catWant) continue;
    if (cityWant && cityKey && foldCityKey(cityKey) !== cityWant) {
      continue;
    }

    let relevance = Number(row.sortOrder) || 0;
    if (cityKey && params.listingCityFold && foldCityKey(cityKey) === params.listingCityFold) {
      relevance += 100;
    }
    if (
      categorySlug &&
      params.listingCategory &&
      categorySlug === params.listingCategory
    ) {
      relevance += 50;
    }
    if (!cityKey) relevance += 10;

    items.push({
      id: Number(row.id),
      title: String(row.title),
      subtitle: row.subtitle ? String(row.subtitle) : null,
      avatarUrl: row.avatarUrl ? String(row.avatarUrl) : null,
      cityKey,
      categorySlug,
      language,
      memberCount: Number(row.memberCount) || 0,
      postingAllowed: row.postingAllowed === 1 || row.postingAllowed === true,
      inviteLink: row.inviteLink ? String(row.inviteLink) : null,
      isSaved: row.isSaved === 1 || row.isSaved === true,
      isCustom: false,
      relevance,
    });
  }

  for (const row of custom) {
    items.push({
      id: Number(row.id),
      title: String(row.title),
      subtitle: row.subtitle ? String(row.subtitle) : null,
      avatarUrl: null,
      cityKey: null,
      categorySlug: null,
      language: String(row.language || 'ru'),
      memberCount: Number(row.memberCount) || 0,
      postingAllowed: true,
      inviteLink: row.inviteLink ? String(row.inviteLink) : null,
      isSaved: true,
      isCustom: true,
      relevance: 5,
    });
  }

  items.sort((a, b) => b.relevance - a.relevance || b.memberCount - a.memberCount);
  return items;
}
