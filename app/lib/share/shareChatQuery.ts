import { prisma, executeWithRetry } from '@/lib/prisma';
import { foldCityKey } from '@/lib/city/cityNormalization';
import { ensureShareChatTables } from '@/lib/share/shareChatTables';
import { sqlBooleanIsTrue } from '@/lib/dbSql';
import {
  listParserShareGroupsForListing,
  stableParserChatId,
} from '@/lib/share/parserShareGroups';
import { extractPublicTelegramUsername } from '@/lib/share/openShareGroup';
import { enrichShareChatsWithTelegramMeta } from '@/lib/share/telegramChatMeta';

function normalizeInviteKey(link: string): string {
  return link.trim().replace(/\/+$/, '').toLowerCase();
}

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
  /** Група з реєстру парсера (groups.py) */
  parserKey?: string | null;
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

  const langWant = params.languageFilter && params.languageFilter !== 'all' ? params.languageFilter : null;
  const catWant = params.categoryFilter && params.categoryFilter !== 'all' ? params.categoryFilter : null;
  const cityFilterRaw = (params.cityFilter || '').trim();
  const cityWant =
    !cityFilterRaw || cityFilterRaw === '__all__'
      ? cityFilterRaw === '__all__'
        ? ''
        : params.listingCityFold
          ? foldCityKey(params.listingCityFold)
          : ''
      : foldCityKey(cityFilterRaw);

  const items: ShareChatItem[] = [];
  const seenLinks = new Set<string>();
  const savedInviteLinks = new Set<string>();

  let custom: Array<Record<string, unknown>> = [];
  try {
    custom = (await executeWithRetry(() =>
      prisma.$queryRawUnsafe(
        `SELECT id, title, subtitle, inviteLink, language, memberCount, catalogChatId, source
         FROM UserShareChat
         WHERE userId = ? AND ${sqlBooleanIsTrue('isSaved')}
         ORDER BY id DESC`,
        params.userId
      )
    )) as Array<Record<string, unknown>>;
  } catch (err) {
    console.error('[shareChatQuery] UserShareChat', err);
  }

  for (const row of custom) {
    const invite = row.inviteLink ? String(row.inviteLink) : '';
    if (invite) {
      savedInviteLinks.add(invite.toLowerCase());
      savedInviteLinks.add(normalizeInviteKey(invite));
    }
  }

  const parserRows = listParserShareGroupsForListing({
    listingCityFold: params.listingCityFold,
    listingCategory: params.listingCategory,
    categoryFilter: params.categoryFilter,
    cityFilter: params.cityFilter,
  });

  for (const g of parserRows) {
    const linkRaw = g.inviteLink || '';
    const link = linkRaw.toLowerCase();
    const linkNorm = normalizeInviteKey(linkRaw);
    if (link) seenLinks.add(link);
    if (linkNorm) seenLinks.add(linkNorm);
    const kindLabel = g.kind === 'services' ? 'послуги' : 'товари';
    const username = extractPublicTelegramUsername(g.inviteLink);
    items.push({
      id: stableParserChatId(g.parserKey),
      title: g.title,
      subtitle: g.notes || `${g.city} · ${kindLabel}`,
      avatarUrl: username
        ? `/api/share-chats/photo?u=${encodeURIComponent(username)}`
        : null,
      cityKey: g.city,
      categorySlug: g.categorySlug,
      language: 'ru',
      memberCount: 0,
      postingAllowed: true,
      inviteLink: g.inviteLink,
      isSaved: Boolean(
        (link && savedInviteLinks.has(link)) ||
          (linkNorm && savedInviteLinks.has(linkNorm))
      ),
      isCustom: false,
      parserKey: g.parserKey,
      relevance: g.relevance + 200,
    });
  }

  let catalog: Array<Record<string, unknown>> = [];
  try {
    catalog = (await executeWithRetry(() =>
      prisma.$queryRawUnsafe(
        `SELECT c.id, c.title, c.subtitle, c.avatarUrl, c.cityKey, c.categorySlug,
                c.language, c.memberCount, c.postingAllowed, c.inviteLink, c.sortOrder,
                CASE WHEN usc.id IS NOT NULL THEN 1 ELSE 0 END AS isSaved
         FROM ShareChatCatalog c
         LEFT JOIN UserShareChat usc
           ON usc.catalogChatId = c.id AND usc.userId = ? AND ${sqlBooleanIsTrue('usc.isSaved')}
         WHERE ${sqlBooleanIsTrue('c.isActive')}
         ORDER BY c.sortOrder ASC, c.memberCount DESC`,
        params.userId
      )
    )) as Array<Record<string, unknown>>;
  } catch (err) {
    console.error('[shareChatQuery] ShareChatCatalog', err);
  }

  for (const row of catalog) {
    const cityKey = row.cityKey ? String(row.cityKey) : null;
    const categorySlug = row.categorySlug ? String(row.categorySlug) : null;
    const language = String(row.language || 'ru');
    const inviteLink = row.inviteLink ? String(row.inviteLink) : null;

    if (langWant && language !== langWant) continue;
    if (catWant && categorySlug && categorySlug !== catWant) continue;
    if (cityWant && cityKey && foldCityKey(cityKey) !== cityWant) {
      continue;
    }
    if (inviteLink && seenLinks.has(inviteLink.toLowerCase())) continue;

    let relevance = Number(row.sortOrder) || 0;
    if (cityKey && params.listingCityFold && foldCityKey(cityKey) === foldCityKey(params.listingCityFold)) {
      relevance += 100;
    }
    if (categorySlug && params.listingCategory && categorySlug === params.listingCategory) {
      relevance += 50;
    }
    if (!cityKey) relevance += 10;

    const username = extractPublicTelegramUsername(inviteLink);
    const storedAvatar = row.avatarUrl ? String(row.avatarUrl) : null;

    items.push({
      id: Number(row.id),
      title: String(row.title),
      subtitle: row.subtitle ? String(row.subtitle) : null,
      avatarUrl:
        storedAvatar ||
        (username ? `/api/share-chats/photo?u=${encodeURIComponent(username)}` : null),
      cityKey,
      categorySlug,
      language,
      memberCount: Number(row.memberCount) || 0,
      postingAllowed: row.postingAllowed === 1 || row.postingAllowed === true,
      inviteLink,
      isSaved: row.isSaved === 1 || row.isSaved === true,
      isCustom: false,
      parserKey: null,
      relevance,
    });
  }

  for (const row of custom) {
    const source = String(row.source || 'custom');
    if (source !== 'custom') continue;
    const inviteLink = row.inviteLink ? String(row.inviteLink) : null;
    const inviteKey = inviteLink ? normalizeInviteKey(inviteLink) : '';
    // Не дублювати парсер/каталог з тим самим invite
    if (inviteKey && seenLinks.has(inviteKey)) continue;
    if (inviteKey) {
      seenLinks.add(inviteKey);
      seenLinks.add(inviteLink!.toLowerCase());
    }

    const username = extractPublicTelegramUsername(inviteLink);
    items.push({
      id: Number(row.id),
      title: String(row.title),
      subtitle: row.subtitle ? String(row.subtitle) : null,
      avatarUrl: username
        ? `/api/share-chats/photo?u=${encodeURIComponent(username)}`
        : null,
      cityKey: null,
      categorySlug: null,
      language: String(row.language || 'ru'),
      memberCount: Number(row.memberCount) || 0,
      postingAllowed: true,
      inviteLink,
      isSaved: true,
      isCustom: true,
      parserKey: null,
      relevance: 5,
    });
  }

  items.sort((a, b) => b.relevance - a.relevance || b.memberCount - a.memberCount || a.title.localeCompare(b.title));

  // Підтягнути memberCount з Telegram (аватар уже через /api/share-chats/photo)
  return enrichShareChatsWithTelegramMeta(items);
}
