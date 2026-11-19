import { prisma } from '@/lib/prisma';
import { ensureSearchSubscriptionTable } from '@/lib/prisma';
import { listingMatchesSearchQuery } from '@/lib/listings/searchVariants';
import { sendTelegramMessage, sendTelegramPhoto } from '@/lib/telegram/telegramNotifications';
import { getUserLanguage } from '@/utils/userHelpers';
import { buildListingImageUrl } from '@/lib/listings/imageUrl';

function parseImageList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function absoluteListingPhoto(path: string): string {
  const built = buildListingImageUrl(path);
  if (!built) return '';
  if (built.startsWith('http://') || built.startsWith('https://')) return built;
  const base = (process.env.WEBAPP_URL || process.env.NEXT_PUBLIC_BASE_URL || '').replace(/\/$/, '');
  if (!base) return '';
  return `${base}${built.startsWith('/') ? built : `/${built}`}`;
}

async function firstListingPhotoUrl(listingId: number): Promise<string> {
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT images, optimizedImages FROM Listing WHERE id = ?`,
    listingId
  )) as Array<{ images: string | null; optimizedImages: string | null }>;
  const row = rows[0];
  if (!row) return '';
  const candidates = [...parseImageList(row.optimizedImages), ...parseImageList(row.images)];
  for (const path of candidates) {
    const url = absoluteListingPhoto(path);
    if (url) return url;
  }
  return '';
}

function escapeHtmlTelegram(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Сповіщає підписників пошукового запиту (entityMode=listings) про нове активне оголошення.
 */
export async function notifySearchSubscribersOfNewMarketplaceListing(params: {
  listingId: number;
  userId: number;
  title: string;
  description: string;
  location: string;
}): Promise<void> {
  await ensureSearchSubscriptionTable();

  const subs = (await prisma.$queryRawUnsafe(
    `SELECT ss.userId, ss.queryKey, ss.queryText, CAST(u.telegramId AS TEXT) AS telegramId
     FROM SearchSubscription ss
     JOIN User u ON ss.userId = u.id
     WHERE ss.entityMode = 'listings'
       AND ss.userId != ?
       AND u.isActive = 1`,
    params.userId
  )) as Array<{
    userId: number;
    queryKey: string;
    queryText: string;
    telegramId: number | bigint | string;
  }>;

  const listing = {
    title: params.title,
    description: params.description,
    location: params.location,
  };

  const matched = subs.filter((s) => listingMatchesSearchQuery(listing, s.queryText));

  console.log(
    `[SearchSubscription] listing=${params.listingId} candidates=${subs.length} matched=${matched.length}`
  );

  if (matched.length === 0) {
    return;
  }

  const photoUrl = await firstListingPhotoUrl(params.listingId);
  const webappUrl = process.env.WEBAPP_URL || 'http://localhost:3000';
  const safeTitle = escapeHtmlTelegram(params.title);

  for (const sub of matched) {
    const rawTid = sub.telegramId;
    const tid =
      typeof rawTid === 'bigint'
        ? Number(rawTid)
        : typeof rawTid === 'string'
          ? parseInt(rawTid, 10)
          : Number(rawTid);
    if (!tid || !Number.isFinite(tid)) continue;

    const lang = await getUserLanguage(tid);
    const listingUrl = `${webappUrl}/${lang}/bazaar?listing=${params.listingId}&telegramId=${tid}`;
    const safeQuery = escapeHtmlTelegram(sub.queryText);

    const message =
      lang === 'ru'
        ? `🔎 <b>Новое объявление по запросу «${safeQuery}»</b>\n\n«${safeTitle}»\n\nОткройте витрину, чтобы посмотреть детали.`
        : `🔎 <b>Нове оголошення за запитом «${safeQuery}»</b>\n\n«${safeTitle}»\n\nВідкрийте вітрину, щоб переглянути деталі.`;

    const replyMarkup = {
      inline_keyboard: [
        [
          {
            text: lang === 'ru' ? '🔗 Открыть' : '🔗 Відкрити',
            web_app: { url: listingUrl },
          },
        ],
      ],
    };

    try {
      const ok = photoUrl
        ? (await sendTelegramPhoto(tid, photoUrl, message, { reply_markup: replyMarkup })) ||
          (await sendTelegramMessage(tid, message, {
            disable_web_page_preview: true,
            reply_markup: replyMarkup,
          }))
        : await sendTelegramMessage(tid, message, {
            disable_web_page_preview: true,
            reply_markup: replyMarkup,
          });
      if (!ok) {
        console.error('[SearchSubscription] sendTelegramMessage returned false for', tid);
      }
    } catch (e) {
      console.error('[SearchSubscription] send failed for', tid, e);
    }

    await new Promise((r) => setTimeout(r, 45));
  }
}

/** Завантажує оголошення з БД і розсилає сповіщення (шлях cron / бота). */
export async function notifySearchSubscribersForListingId(listingId: number): Promise<{
  ok: boolean;
  reason?: string;
  matched?: number;
}> {
  await ensureSearchSubscriptionTable();

  const rows = (await prisma.$queryRawUnsafe(
    `SELECT l.id, l.userId, l.title, l.description, l.location, l.status
     FROM Listing l
     WHERE l.id = ?`,
    listingId
  )) as Array<{
    id: number;
    userId: number;
    title: string;
    description: string;
    location: string;
    status: string;
  }>;

  const listing = rows[0];
  if (!listing) {
    return { ok: false, reason: 'not_found' };
  }
  if (listing.status !== 'active') {
    return { ok: false, reason: 'not_active' };
  }

  const subs = (await prisma.$queryRawUnsafe(
    `SELECT ss.queryText FROM SearchSubscription ss WHERE ss.entityMode = 'listings' AND ss.userId != ?`,
    listing.userId
  )) as Array<{ queryText: string }>;

  const matchCount = subs.filter((s) =>
    listingMatchesSearchQuery(
      {
        title: listing.title,
        description: listing.description,
        location: listing.location,
      },
      s.queryText
    )
  ).length;

  await notifySearchSubscribersOfNewMarketplaceListing({
    listingId: listing.id,
    userId: listing.userId,
    title: listing.title,
    description: listing.description,
    location: listing.location || '',
  });

  return { ok: true, matched: matchCount };
}
