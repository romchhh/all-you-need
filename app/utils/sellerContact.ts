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
 * Відкрити t.me / share з заготовленим текстом.
 * `openTelegramLink` на iOS часто відкриває чат БЕЗ ?text= —
 * тому клікаємо <a target=_blank> / location.href, не openTelegramLink.
 */
export function openTelegramUrlWithPrefill(link: string, tg?: TelegramWebApp): void {
  tg?.HapticFeedback?.impactOccurred('medium');
  if (typeof window === 'undefined') return;

  try {
    const a = document.createElement('a');
    a.href = link;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    return;
  } catch {
    // fall through
  }
  window.location.href = link;
}

/**
 * Відкрити чат з продавцем із заготовленим текстом.
 */
export function openSellerTelegramChat(
  username: string,
  message: string,
  tg?: TelegramWebApp,
): void {
  openTelegramUrlWithPrefill(buildSellerTelegramLink(username, message), tg);
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
  openTelegramUrlWithPrefill(shareUrl, tg);
}

export function openTelegramDeepLink(link: string, tg?: TelegramWebApp): void {
  // Без prefill — можна openTelegramLink; із text=/share — через location.href
  const hasPrefill = /[?&]text=/.test(link) || /\/share\/url/i.test(link);
  if (hasPrefill) {
    openTelegramUrlWithPrefill(link, tg);
    return;
  }
  if (tg?.openTelegramLink) {
    tg.openTelegramLink(link);
    tg.HapticFeedback?.impactOccurred('medium');
  } else if (typeof window !== 'undefined') {
    window.location.href = link;
  }
}
