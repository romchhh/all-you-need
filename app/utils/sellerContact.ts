import { getListingMiniAppLink } from '@/utils/botLinks';
import type { TelegramWebApp } from '@/types/telegram';

export type SellerContactLang = 'ru' | 'uk';

export function resolveSellerContactLang(lang: string | undefined): SellerContactLang {
  return lang === 'uk' ? 'uk' : 'ru';
}

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

export function openSellerTelegramChat(
  username: string,
  message: string,
  tg?: TelegramWebApp,
): void {
  const link = buildSellerTelegramLink(username, message);
  if (tg?.openTelegramLink) {
    tg.openTelegramLink(link);
    tg.HapticFeedback?.impactOccurred('medium');
  } else if (typeof window !== 'undefined') {
    window.location.href = link;
  }
}
