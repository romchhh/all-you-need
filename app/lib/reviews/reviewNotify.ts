import { sendTelegramMessage } from '@/lib/telegram/telegramNotifications';
import { getUserLanguage } from '@/utils/userHelpers';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Сповіщення власнику бізнесу про новий відгук. */
export async function notifyBusinessOwnerNewReview(params: {
  ownerTelegramId: string | number | bigint;
  businessName: string;
  authorName: string;
  rating: number;
  sellerTelegramId: string;
}): Promise<void> {
  const webappUrl = process.env.WEBAPP_URL || 'https://tradeground.app';
  const lang = await getUserLanguage(params.ownerTelegramId);
  const profileUrl = `${webappUrl}/${lang}/bazaar?user=${encodeURIComponent(
    params.sellerTelegramId
  )}&tab=reviews&telegramId=${params.ownerTelegramId}`;

  const stars = '★'.repeat(Math.min(5, Math.max(1, params.rating)));
  const name = escapeHtml(params.businessName || 'Business');
  const author = escapeHtml(params.authorName || (lang === 'ru' ? 'Пользователь' : 'Користувач'));

  const message =
    lang === 'ru'
      ? `⭐ <b>Новый отзыв о ${name}</b>\n${author} поставила вам ${params.rating} ${stars}`
      : `⭐ <b>Новий відгук про ${name}</b>\n${author} поставила вам ${params.rating} ${stars}`;

  const btn = lang === 'ru' ? 'Посмотреть отзыв →' : 'Подивитися відгук →';

  await sendTelegramMessage(String(params.ownerTelegramId), message, {
    disable_web_page_preview: true,
    reply_markup: {
      inline_keyboard: [[{ text: btn, web_app: { url: profileUrl } }]],
    },
  }).catch((err) => console.error('[notifyBusinessOwnerNewReview]', err));
}

/** Запрошення користувачу залишити відгук через 3 дні після контакту. */
export async function notifyUserReviewInvite(params: {
  viewerTelegramId: string | number | bigint;
  businessName: string;
  sellerTelegramId: string;
  inviteId: number;
}): Promise<boolean> {
  const webappUrl = process.env.WEBAPP_URL || 'https://tradeground.app';
  const lang = await getUserLanguage(params.viewerTelegramId);
  const reviewUrl = `${webappUrl}/${lang}/bazaar?user=${encodeURIComponent(
    params.sellerTelegramId
  )}&tab=reviews&telegramId=${params.viewerTelegramId}`;

  const name = escapeHtml(params.businessName || 'Business');
  const message =
    lang === 'ru'
      ? `Обращались в <b>${name}</b>?\nПоделитесь своим опытом — это поможет другим пользователям.`
      : `Зверталися до <b>${name}</b>?\nПоділіться досвідом — це допоможе іншим користувачам.`;

  const leaveBtn = lang === 'ru' ? 'Оставить отзыв' : 'Залишити відгук';
  const skipBtn = lang === 'ru' ? 'Не пользовался услугами' : 'Не користувався послугами';

  return sendTelegramMessage(String(params.viewerTelegramId), message, {
    disable_web_page_preview: true,
    reply_markup: {
      inline_keyboard: [
        [{ text: leaveBtn, web_app: { url: reviewUrl } }],
        [{ text: skipBtn, callback_data: `review_invite_skip:${params.inviteId}` }],
      ],
    },
  });
}
