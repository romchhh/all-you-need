import { getListingMiniAppLink } from '@/utils/botLinks';
import type { TelegramWebApp } from '@/types/telegram';

export type SellerContactLang = 'ru' | 'uk';

export function resolveSellerContactLang(lang: string | undefined): SellerContactLang {
  return lang === 'uk' ? 'uk' : 'ru';
}

/** Класична заготовка «Написати продавцю» — як було з початку. */
export function buildSellerContactMessage(
  listingTitle: string,
  listingUrl: string,
  lang: SellerContactLang = 'ru',
): string {
  const title = listingTitle.trim() || (lang === 'uk' ? 'Оголошення' : 'Объявление');
  const link = listingUrl.trim();

  if (lang === 'uk') {
    return [
      '👋 Вітаю!',
      'Знайшов(ла) ваше оголошення:',
      '',
      `📌 ${title}`,
      `🔗 ${link}`,
      '',
      'Пропозиція ще актуальна?',
    ].join('\n');
  }

  return [
    '👋 Здравствуйте!',
    'Нашёл(а) ваше объявление:',
    '',
    `📌 ${title}`,
    `🔗 ${link}`,
    '',
    'Предложение ещё актуально?',
  ].join('\n');
}

export function buildSellerProfileContactMessage(
  profileUrl: string,
  lang: SellerContactLang = 'ru',
): string {
  const link = profileUrl.trim();
  if (lang === 'uk') {
    return ['👋 Вітаю!', 'Цікавлять ваші оголошення на Trade Ground.', '', `🔗 ${link}`].join('\n');
  }
  return ['👋 Здравствуйте!', 'Интересуют ваши объявления на Trade Ground.', '', `🔗 ${link}`].join('\n');
}

export function buildSellerTelegramLink(username: string, message: string): string {
  const clean = username.replace(/^@/, '').trim();
  return `https://t.me/${clean}?text=${encodeURIComponent(message)}`;
}

export function getListingContactUrl(listingId: number): string {
  return getListingMiniAppLink(listingId);
}

/**
 * Відкрити чат з продавцем із заготовленим текстом.
 * На iOS `openTelegramLink` часто відкриває чат БЕЗ ?text= (баг клієнта) —
 * тому для лінків з текстом використовуємо location.href.
 */
export function openSellerTelegramChat(
  username: string,
  message: string,
  tg?: TelegramWebApp,
): void {
  const link = buildSellerTelegramLink(username, message);
  tg?.HapticFeedback?.impactOccurred('medium');
  if (typeof window !== 'undefined') {
    window.location.href = link;
  }
}

/** Вибір чату з готовим текстом (коли немає @username продавця). */
export function openSellerContactViaTelegramShare(
  listingUrl: string,
  message: string,
  tg?: TelegramWebApp,
): void {
  const url = listingUrl.trim();
  const text = message.trim();
  // Як у ShareModal: text у query; url окремо для превʼю
  const shareUrl = url
    ? `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`
    : `https://t.me/share/url?text=${encodeURIComponent(text)}`;
  openTelegramDeepLink(shareUrl, tg);
}

export function openTelegramDeepLink(link: string, tg?: TelegramWebApp): void {
  if (tg?.openTelegramLink) {
    tg.openTelegramLink(link);
    tg.HapticFeedback?.impactOccurred('medium');
  } else if (typeof window !== 'undefined') {
    window.location.href = link;
  }
}
