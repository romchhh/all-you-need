/**
 * Сповіщення користувачів з обраного про зміну ціни оголошення.
 */
import { prisma, executeWithRetry } from '@/lib/prisma';
import { sendTelegramMessage } from '@/lib/telegram/telegramNotifications';
import { getListingMiniAppLink } from '@/utils/botLinks';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export async function notifyFavoritesPriceChanged(params: {
  listingId: number;
  title: string;
  oldPrice: string;
  newPrice: string;
  sellerUserId: number;
}): Promise<void> {
  const { listingId, title, oldPrice, newPrice, sellerUserId } = params;

  const rows = (await executeWithRetry(() =>
    prisma.$queryRawUnsafe(
      `SELECT CAST(u.telegramId AS TEXT) as telegramId, u.language
       FROM Favorite f
       JOIN User u ON u.id = f.userId
       WHERE f.listingId = ?
         AND u.id != ?
         AND u.telegramId IS NOT NULL
         AND CAST(u.telegramId AS TEXT) != ''
         AND CAST(u.telegramId AS TEXT) != '0'`,
      listingId,
      sellerUserId
    )
  )) as Array<{ telegramId: string; language: string | null }>;

  if (!rows.length) return;

  const safeTitle = escapeHtml(title || '—');
  const safeOld = escapeHtml(oldPrice || '—');
  const safeNew = escapeHtml(newPrice || '—');
  const openUrl = getListingMiniAppLink(listingId);

  await Promise.allSettled(
    rows.map(async (row) => {
      const lang = (row.language || 'uk').startsWith('ru') ? 'ru' : 'uk';
      const text =
        lang === 'ru'
          ? `💰 <b>Цена изменена</b>\n\n«<b>${safeTitle}</b>»\n${safeOld} → <b>${safeNew}</b>`
          : `💰 <b>Ціну змінено</b>\n\n«<b>${safeTitle}</b>»\n${safeOld} → <b>${safeNew}</b>`;
      const btn = lang === 'ru' ? '🔗 Открыть объявление' : '🔗 Відкрити оголошення';
      await sendTelegramMessage(row.telegramId, text, {
        disable_web_page_preview: true,
        reply_markup: {
          inline_keyboard: [[{ text: btn, url: openUrl }]],
        },
      });
    })
  );
}
