import { getListingShareLink } from '@/utils/botLinks';
import type { TelegramWebApp } from '@/types/telegram';

export type SellerContactLang = 'ru' | 'uk';

/** Ліміт довжини для t.me/?text= — довші URL Telegram часто відкриває чат без тексту. */
const MAX_DM_TEXT_LEN = 480;

export function resolveSellerContactLang(lang: string | undefined): SellerContactLang {
  return lang === 'uk' ? 'uk' : 'ru';
}

function truncateTitle(title: string, max = 72): string {
  const t = title.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trim()}…`;
}

function clampMessage(message: string, maxLen = MAX_DM_TEXT_LEN): string {
  if (message.length <= maxLen) return message;
  return `${message.slice(0, maxLen - 1).trim()}…`;
}

export function buildSellerContactMessage(
  listingTitle: string,
  listingUrl: string,
  lang: SellerContactLang = 'ru',
  extraLink?: string | null,
): string {
  const title =
    truncateTitle(listingTitle) || (lang === 'uk' ? 'Оголошення' : 'Объявление');
  const link = listingUrl.trim();
  const extra = (extraLink || '').trim();

  const head =
    lang === 'uk'
      ? '👋 Вітаю!\nЗнайшов(ла) ваше оголошення:'
      : '👋 Здравствуйте!\nНашёл(а) ваше объявление:';
  const ask =
    lang === 'uk' ? 'Пропозиція ще актуальна?' : 'Предложение ещё актуально?';
  const links = [
    `📌 ${title}`,
    link ? `🔗 ${link}` : '',
    extra && extra !== link ? `🔗 ${extra}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return clampMessage(`${head}\n\n${links}\n\n${ask}`);
}

export function buildSellerProfileContactMessage(
  profileUrl: string,
  lang: SellerContactLang = 'ru',
): string {
  const link = profileUrl.trim();
  if (lang === 'uk') {
    return clampMessage(
      ['👋 Вітаю!', 'Цікавлять ваші оголошення на Trade Ground.', '', `🔗 ${link}`].join('\n')
    );
  }
  return clampMessage(
    ['👋 Здравствуйте!', 'Интересуют ваши объявления на Trade Ground.', '', `🔗 ${link}`].join('\n')
  );
}

export function buildSellerTelegramLink(username: string, message: string): string {
  const clean = username.replace(/^@/, '').trim();
  const text = clampMessage(message.trim());
  return `https://t.me/${clean}?text=${encodeURIComponent(text)}`;
}

/** Коротший deep-link (?start=) — надійніше потрапляє в ?text= ніж довгий startapp. */
export function getListingContactUrl(listingId: number): string {
  return getListingShareLink(listingId);
}

export function openSellerTelegramChat(
  username: string,
  message: string,
  tg?: TelegramWebApp,
): void {
  const link = buildSellerTelegramLink(username, message);
  openTelegramDeepLink(link, tg);
}

/**
 * Вибір чату з готовим текстом.
 * url — превʼю-лінк; text — привітання (без дубля того ж url, щоб Telegram не зрізав text).
 */
export function openSellerContactViaTelegramShare(
  listingUrl: string,
  message: string,
  tg?: TelegramWebApp,
): void {
  const url = listingUrl.trim();
  let text = clampMessage(message.trim());
  // Прибрати з text той самий url — він уже в параметрі url
  if (url && text.includes(url)) {
    text = text
      .split('\n')
      .filter((line) => !line.includes(url))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
  if (!text) {
    text = '👋';
  }
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
