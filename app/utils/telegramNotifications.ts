/**
 * Утиліта для відправки повідомлень через Telegram Bot API
 */

import type { PromotionType } from '@/utils/paymentConstants';

function escapeHtmlTelegram(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatPromotionEndsUtc(endsAt: Date): string {
  const d = endsAt.getUTCDate().toString().padStart(2, '0');
  const m = (endsAt.getUTCMonth() + 1).toString().padStart(2, '0');
  const y = endsAt.getUTCFullYear();
  const h = endsAt.getUTCHours().toString().padStart(2, '0');
  const min = endsAt.getUTCMinutes().toString().padStart(2, '0');
  return `${d}.${m}.${y} ${h}:${min} UTC`;
}

function daysWordUk(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} день`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${n} дні`;
  return `${n} днів`;
}

function daysWordRu(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} день`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${n} дня`;
  return `${n} дней`;
}

interface InlineKeyboardButton {
  text: string;
  url?: string;
  callback_data?: string;
  web_app?: { url: string };
}

interface TelegramMessageOptions {
  chat_id: number | string;
  text: string;
  parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2';
  disable_web_page_preview?: boolean;
  disable_notification?: boolean;
  reply_markup?: {
    inline_keyboard?: InlineKeyboardButton[][];
  };
}

/**
 * Відправити повідомлення через Telegram Bot API
 */
export async function sendTelegramMessage(
  chatId: number | string,
  text: string,
  options: Partial<TelegramMessageOptions> = {}
): Promise<boolean> {
  try {
    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    
    if (!BOT_TOKEN) {
      console.error('TELEGRAM_BOT_TOKEN is not set');
      return false;
    }

    const payload: any = {
      chat_id: chatId,
      text: text,
      parse_mode: options.parse_mode || 'HTML',
      disable_web_page_preview: options.disable_web_page_preview ?? false,
      disable_notification: options.disable_notification ?? false,
    };

    // Додаємо inline кнопки якщо є
    if (options.reply_markup) {
      payload.reply_markup = options.reply_markup;
    }

    const response = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      console.error('Telegram API error:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error sending Telegram message:', error);
    return false;
  }
}

/**
 * Повідомлення про схвалення оголошення
 */
export async function sendListingApprovedNotification(
  telegramId: number | string,
  listingTitle: string,
  listingId: number,
  expiresAt: Date
): Promise<boolean> {
  const webappUrl = process.env.WEBAPP_URL || 'http://localhost:3000';
  const { getUserLanguage } = await import('@/utils/userHelpers');
  const lang = await getUserLanguage(telegramId);
  const listingUrl = `${webappUrl}/${lang}/bazaar?listing=${listingId}&telegramId=${telegramId}`;
  const locale = lang === 'ru' ? 'ru-RU' : 'uk-UA';
  const expiresDate = expiresAt.toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const message = `✅ <b>Оголошення схвалено!</b>

Ваше оголошення "<b>${listingTitle}</b>" пройшло модерацію та опубліковано.

📅 Термін дії: до ${expiresDate}

Ваше оголошення буде активним протягом 30 днів. Після закінчення терміну, ви зможете продовжити його за додаткову оплату.`;

  return await sendTelegramMessage(telegramId, message, {
    disable_web_page_preview: true,
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: '🔗 Переглянути оголошення',
            web_app: { url: listingUrl }
          }
        ]
      ]
    }
  });
}

/**
 * Повідомлення про відхилення оголошення
 */
export async function sendListingRejectedNotification(
  telegramId: number | string,
  listingTitle: string,
  reason: string,
  refundInfo: {
    refundedPackage: boolean;
    refundedPromotions: boolean;
    promotionRefundAmount?: number;
  }
): Promise<boolean> {
  // Формуємо інформацію про повернення коштів
  const refundParts = [];
  if (refundInfo.refundedPackage) {
    refundParts.push('• Повернено 1 пакет оголошення');
  }
  if (refundInfo.refundedPromotions && refundInfo.promotionRefundAmount && refundInfo.promotionRefundAmount > 0) {
    refundParts.push(`• Повернено кошти за рекламу: <b>${refundInfo.promotionRefundAmount.toFixed(2)} EUR</b> на баланс`);
  }

  const refundText =
    refundParts.length > 0
      ? refundParts.join('\n')
      : '• Не було списано коштів (перше безкоштовне оголошення)';

  const message = `❌ <b>Оголошення відхилено</b>

Ваше оголошення "<b>${listingTitle}</b>" не пройшло модерацію.

📝 <b>Причина відхилення:</b>
${reason}

💰 <b>Повернення коштів:</b>
${refundText}

✏️ Ви можете <b>відредагувати</b> це оголошення з урахуванням зауважень модератора та подати його на модерацію знову.`;

  return await sendTelegramMessage(telegramId, message);
}

/**
 * Повідомлення про закінчення терміну дії оголошення
 */
export async function sendListingExpiredNotification(
  telegramId: number | string,
  listingTitle: string,
  listingId: number
): Promise<boolean> {
  const message = `⏰ <b>Термін дії оголошення закінчився</b>

Ваше оголошення "<b>${listingTitle}</b>" більше не активне.

Щоб поновити оголошення:
1. Перейдіть у розділ "Мої оголошення"
2. Натисніть "Активувати знову"
3. Оплатіть поновлення

Оголошення буде активним ще 30 днів після реактивації.`;

  return await sendTelegramMessage(telegramId, message);
}

/**
 * Попередження про закінчення терміну дії
 */
export async function sendListingExpiringWarning(
  telegramId: number | string,
  listingTitle: string,
  daysLeft: number
): Promise<boolean> {
  const dayWord =
    daysLeft === 1 ? 'день' : daysLeft <= 4 ? 'дні' : 'днів';

  const message = `⚠️ <b>Оголошення скоро закінчується</b>

Ваше оголошення "<b>${listingTitle}</b>" закінчується через ${daysLeft} ${dayWord}.

Після закінчення терміну оголошення стане неактивним. Ви зможете поновити його за додаткову оплату.`;

  return await sendTelegramMessage(telegramId, message, {
    disable_notification: true, // Не шумимо
  });
}

/**
 * Повідомлення про безкоштовне нарахування реклами з адмін-панелі (аналогічно bot/scripts/grant_top_latest_listings.py).
 */
export async function sendAdminPromotionGrantedNotification(
  telegramId: number | string,
  listingId: number,
  listingTitle: string,
  promotionType: PromotionType,
  durationDays: number,
  promotionEnds: Date
): Promise<boolean> {
  const { getUserLanguage } = await import('@/utils/userHelpers');
  const lang = await getUserLanguage(telegramId);
  const endsStr = escapeHtmlTelegram(formatPromotionEndsUtc(promotionEnds));
  const safeTitle = escapeHtmlTelegram(listingTitle || '—');
  const line = `• «<b>${safeTitle}</b>» (№${listingId})`;
  const dwUk = daysWordUk(durationDays);
  const dwRu = daysWordRu(durationDays);

  let message: string;
  if (lang === 'ru') {
    if (promotionType === 'top_category') {
      message =
        '📌 <b>Активировано TOP-размещение</b>\n\n' +
        `Начислено <b>TOP в категории на ${dwRu}</b> ` +
        `до <b>${endsStr}</b> для объявления:\n\n` +
        `${line}\n\n` +
        'Оно будет выше в своей категории в каталоге TradeGround.';
    } else if (promotionType === 'highlighted') {
      message =
        '📌 <b>Активировано выделение объявления</b>\n\n' +
        `Начислено <b>выделение на ${dwRu}</b> ` +
        `до <b>${endsStr}</b> для объявления:\n\n` +
        `${line}\n\n` +
        'Оно будет заметнее в каталоге TradeGround.';
    } else {
      message =
        '📌 <b>Активировано VIP-размещение</b>\n\n' +
        `Начислено <b>VIP на ${dwRu}</b> ` +
        `до <b>${endsStr}</b> для объявления:\n\n` +
        `${line}\n\n` +
        'Объявление получит максимальную видимость в каталоге TradeGround.';
    }
  } else {
    if (promotionType === 'top_category') {
      message =
        '📌 <b>Активовано TOP-розміщення</b>\n\n' +
        `Нараховано <b>TOP у категорії на ${dwUk}</b> ` +
        `до <b>${endsStr}</b> для оголошення:\n\n` +
        `${line}\n\n` +
        'Воно буде вище у своїй категорії в каталозі TradeGround.';
    } else if (promotionType === 'highlighted') {
      message =
        '📌 <b>Активовано виділення оголошення</b>\n\n' +
        `Нараховано <b>виділення на ${dwUk}</b> ` +
        `до <b>${endsStr}</b> для оголошення:\n\n` +
        `${line}\n\n` +
        'Воно буде помітніше в каталозі TradeGround.';
    } else {
      message =
        '📌 <b>Активовано VIP-розміщення</b>\n\n' +
        `Нараховано <b>VIP на ${dwUk}</b> ` +
        `до <b>${endsStr}</b> для оголошення:\n\n` +
        `${line}\n\n` +
        'Воно отримає максимальну видимість у каталозі TradeGround.';
    }
  }

  const webappUrl = process.env.WEBAPP_URL || 'http://localhost:3000';
  const tid =
    typeof telegramId === 'string' ? telegramId : String(telegramId);
  const listingUrl = `${webappUrl}/${lang}/bazaar?listing=${listingId}&telegramId=${tid}`;

  return await sendTelegramMessage(telegramId, message, {
    disable_web_page_preview: true,
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: lang === 'ru' ? '🔗 Открыть в приложении' : '🔗 Відкрити в застосунку',
            web_app: { url: listingUrl },
          },
        ],
      ],
    },
  });
}

/**
 * Повідомлення про нарахування коштів на баланс (з адмін-панелі) — українською та російською.
 */
export async function sendBalanceCreditedNotification(
  telegramId: number | string,
  amount: number,
  newBalance: number
): Promise<boolean> {
  const amountStr = amount.toFixed(2);
  const balanceStr = newBalance.toFixed(2);

  const message =
    `💰 <b>На ваш баланс нараховано кошти</b>\n\n` +
    `Вам нараховано <b>${amountStr} EUR</b>.\n` +
    `Поточний баланс: <b>${balanceStr} EUR</b>\n\n` +
    `Кошти можна використовувати для платного просування оголошень.\n\n` +
    `———\n\n` +
    `💰 <b>На ваш баланс зачислены средства</b>\n\n` +
    `Вам начислено <b>${amountStr} EUR</b>.\n` +
    `Текущий баланс: <b>${balanceStr} EUR</b>\n\n` +
    `Средства можно использовать для продвижения объявлений.`;

  return await sendTelegramMessage(telegramId, message);
}
