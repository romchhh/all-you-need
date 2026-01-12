/**
 * Утиліта для відправки повідомлень через Telegram Bot API
 */

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
  const listingUrl = `${webappUrl}/uk/bazaar?listing=${listingId}`;
  const expiresDate = expiresAt.toLocaleDateString('uk-UA', {
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
  }
): Promise<boolean> {
  // Формуємо інформацію про повернення коштів
  const refundParts = [];
  if (refundInfo.refundedPackage) {
    refundParts.push('• Повернено 1 пакет оголошення');
  }
  if (refundInfo.refundedPromotions) {
    refundParts.push('• Повернено кошти за рекламу');
  }

  const refundText =
    refundParts.length > 0
      ? refundParts.join('\n')
      : '• Не було списано коштів (перше безкоштовне оголошення)';

  const message = `❌ <b>Оголошення відхилено</b>

Ваше оголошення "<b>${listingTitle}</b>" не пройшло модерацію та було видалено.

📝 <b>Причина відхилення:</b>
${reason}

💰 <b>Повернення коштів:</b>
${refundText}

Ви можете створити нове оголошення з урахуванням зауважень модератора.`;

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
