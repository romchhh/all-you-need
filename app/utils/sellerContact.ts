import { getListingMiniAppLink } from '@/utils/botLinks';
import type { TelegramWebApp } from '@/types/telegram';

export type SellerContactLang = 'ru' | 'uk';

export function resolveSellerContactLang(lang: string | undefined): SellerContactLang {
  return lang === 'uk' ? 'uk' : 'ru';
}

export type BuildSellerContactMessageOptions = {
  /** Абсолютний HTTPS URL фото — має бути першим лінком у тексті для превʼю. */
  imageUrl?: string | null;
};

/** Класична заготовка «Написати продавцю». */
export function buildSellerContactMessage(
  listingTitle: string,
  listingUrl: string,
  lang: SellerContactLang = 'ru',
  options?: BuildSellerContactMessageOptions,
): string {
  const title = listingTitle.trim() || (lang === 'uk' ? 'Оголошення' : 'Объявление');
  const link = listingUrl.trim();
  const imageUrl = (options?.imageUrl || '').trim();
  const openInMarketplace =
    lang === 'uk' ? 'Відкрити в маркетплейсі' : 'Открыть в маркетплейс';

  // Порядок лінків важливий: перший URL = превʼю в Telegram → спочатку фото.
  const lines: string[] =
    lang === 'uk'
      ? ['Вітаю!', 'Знайшов(ла) ваше оголошення:', title]
      : ['Здравствуйте!', 'Нашел(а) ваше объявление:', title];

  if (imageUrl) {
    lines.push(imageUrl);
  }

  lines.push(openInMarketplace);
  if (link) {
    lines.push(link);
  }

  lines.push(lang === 'uk' ? 'Пропозиція ще актуальна?' : 'Предложение ещё актуально?');

  return lines.join('\n');
}

export function buildSellerProfileContactMessage(
  profileUrl: string,
  lang: SellerContactLang = 'ru',
): string {
  const link = profileUrl.trim();
  const openInMarketplace =
    lang === 'uk' ? 'Відкрити в маркетплейсі' : 'Открыть в маркетплейс';
  if (lang === 'uk') {
    return ['Вітаю!', 'Цікавлять ваші оголошення на Trade Ground.', openInMarketplace, link]
      .filter(Boolean)
      .join('\n');
  }
  return [
    'Здравствуйте!',
    'Интересуют ваши объявления на Trade Ground.',
    openInMarketplace,
    link,
  ]
    .filter(Boolean)
    .join('\n');
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

/**
 * Вибір чату з готовим текстом (коли немає @username продавця).
 * `previewUrl` — що Telegram покаже знизу (краще абсолютний URL фото оголошення).
 */
export function openSellerContactViaTelegramShare(
  previewUrl: string,
  message: string,
  tg?: TelegramWebApp,
): void {
  const url = previewUrl.trim();
  const text = message.trim();
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
