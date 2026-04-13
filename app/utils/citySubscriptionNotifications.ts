import { prisma } from '@/lib/prisma';
import { ensureCitySubscriptionTable } from '@/lib/prisma';
import { listingCityKeyFromLocation } from '@/utils/cityNormalization';
import { sendTelegramMessage } from '@/utils/telegramNotifications';
import { getUserLanguage } from '@/utils/userHelpers';

function escapeHtmlTelegram(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Сповіщає підписників міста (крім автора) про нове активне оголошення в маркетплейсі.
 * Викликати без await після схвалення модерацією, щоб не блокувати відповідь адмінці.
 */
export async function notifyCitySubscribersOfNewMarketplaceListing(params: {
  listingId: number;
  userId: number;
  title: string;
  location: string;
}): Promise<void> {
  await ensureCitySubscriptionTable();

  const cityKey = listingCityKeyFromLocation(params.location);
  if (!cityKey) {
    return;
  }

  const rows = (await prisma.$queryRawUnsafe(
    `SELECT CAST(u.telegramId AS INTEGER) as telegramId
     FROM CitySubscription cs
     JOIN User u ON cs.userId = u.id
     WHERE cs.cityKey = ? AND cs.userId != ? AND u.isActive = 1`,
    cityKey,
    params.userId
  )) as Array<{ telegramId: number }>;

  if (rows.length === 0) {
    return;
  }

  const webappUrl = process.env.WEBAPP_URL || 'http://localhost:3000';
  const safeTitle = escapeHtmlTelegram(params.title);
  const safeCity = escapeHtmlTelegram(cityKey);

  for (const row of rows) {
    const tid = row.telegramId;
    if (!tid) continue;

    const lang = await getUserLanguage(tid);
    const listingUrl = `${webappUrl}/${lang}/bazaar?listing=${params.listingId}&telegramId=${tid}`;

    const message =
      lang === 'ru'
        ? `🔔 <b>Новое объявление в ${safeCity}</b>\n\n«${safeTitle}»\n\nОткройте витрину, чтобы посмотреть детали.`
        : `🔔 <b>Нове оголошення у ${safeCity}</b>\n\n«${safeTitle}»\n\nВідкрийте вітрину, щоб переглянути деталі.`;

    try {
      await sendTelegramMessage(tid, message, {
        disable_web_page_preview: true,
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: lang === 'ru' ? '🔗 Открыть' : '🔗 Відкрити',
                web_app: { url: listingUrl },
              },
            ],
          ],
        },
      });
    } catch (e) {
      console.error('[notifyCitySubscribers] send failed for', tid, e);
    }

    await new Promise((r) => setTimeout(r, 45));
  }
}
