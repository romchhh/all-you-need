/**
 * Сповіщення користувачів з обраного про зміну ціни оголошення.
 */
import { prisma, executeWithRetry } from '@/lib/prisma';
import { sendTelegramMessage } from '@/lib/telegram/telegramNotifications';
import { getListingMiniAppLink } from '@/utils/botLinks';
import { getCurrencySymbol } from '@/utils/currency';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatPriceLabel(price: string, currency?: string | null): string {
  const raw = String(price || '').trim();
  if (!raw) return '—';
  const lower = raw.toLowerCase();
  if (lower === 'free' || raw === 'Безкоштовно' || raw === 'Бесплатно') {
    return '🆓';
  }
  if (
    raw === 'Договірна' ||
    raw === 'Договорная' ||
    lower === 'negotiable'
  ) {
    return raw;
  }
  const symbol = getCurrencySymbol((currency as 'UAH' | 'EUR' | 'USD') || 'EUR');
  return `${raw}${symbol}`;
}

export async function notifyFavoritesPriceChanged(params: {
  listingId: number;
  title: string;
  oldPrice: string;
  newPrice: string;
  currency?: string | null;
  sellerUserId: number;
}): Promise<void> {
  const { listingId, title, oldPrice, newPrice, currency, sellerUserId } = params;

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

  if (!rows.length) {
    console.log('[notifyFavoritesPriceChanged] no recipients for listing', listingId);
    return;
  }

  const safeTitle = escapeHtml(title || '—');
  const safeOld = escapeHtml(formatPriceLabel(oldPrice, currency));
  const safeNew = escapeHtml(formatPriceLabel(newPrice, currency));
  const openUrl = getListingMiniAppLink(listingId);

  console.log(
    '[notifyFavoritesPriceChanged] listing',
    listingId,
    'recipients',
    rows.length,
    `${safeOld} → ${safeNew}`
  );

  for (const row of rows) {
    const lang = (row.language || 'uk').startsWith('ru') ? 'ru' : 'uk';
    const text =
      lang === 'ru'
        ? `💰 <b>Цена изменена</b>\n\n«<b>${safeTitle}</b>»\n${safeOld} → <b>${safeNew}</b>`
        : `💰 <b>Ціну змінено</b>\n\n«<b>${safeTitle}</b>»\n${safeOld} → <b>${safeNew}</b>`;
    const btn = lang === 'ru' ? '🔗 Открыть объявление' : '🔗 Відкрити оголошення';
    try {
      await sendTelegramMessage(row.telegramId, text, {
        disable_web_page_preview: true,
        reply_markup: {
          inline_keyboard: [[{ text: btn, url: openUrl }]],
        },
      });
    } catch (err) {
      console.error('[notifyFavoritesPriceChanged] send failed', row.telegramId, err);
    }
    await new Promise((r) => setTimeout(r, 40));
  }
}
