import { getCurrencySymbol } from '@/utils/currency';
import { getListingMiniAppLink, getListingShareLink } from '@/utils/botLinks';
import { stripListingSearchMeta } from '@/lib/listings/searchVariants';

export type ChatListingDraftInput = {
  id: number;
  title: string;
  description: string;
  price: string;
  currency?: string | null;
  isFree?: boolean;
  location: string;
  /** Локалізовані «Договірна» / Free */
  negotiableLabel: string;
  freeLabel: string;
};

function trimDescription(desc: string, max = 900): string {
  const body = stripListingSearchMeta(desc || '').trim();
  if (body.length <= max) return body;
  return `${body.slice(0, max - 1)}…`;
}

export function buildDefaultChatListingText(
  listing: ChatListingDraftInput,
  lang: 'uk' | 'ru'
): string {
  const priceLine = listing.isFree
    ? listing.freeLabel
    : listing.price === listing.negotiableLabel ||
        listing.price === 'Договірна' ||
        listing.price === 'Договорная'
      ? listing.negotiableLabel
      : `${listing.price}${getCurrencySymbol((listing.currency as 'EUR' | 'USD' | 'UAH' | undefined) || 'EUR')}`;

  const link = getListingShareLink(listing.id);
  const mini = getListingMiniAppLink(listing.id);

  const desc = trimDescription(listing.description);

  if (lang === 'ru') {
    return [
      `📦 ${listing.title.trim()}`,
      `💶 ${priceLine}`,
      `📍 ${listing.location.trim() || 'Германия'}`,
      desc ? `\n${desc}` : '',
      `\n🔗 Витрина: ${mini}`,
      `📎 Ссылка для чата: ${link}`,
    ]
      .filter(Boolean)
      .join('\n');
  }

  return [
    `📦 ${listing.title.trim()}`,
    `💶 ${priceLine}`,
    `📍 ${listing.location.trim() || 'Німеччина'}`,
    desc ? `\n${desc}` : '',
    `\n🔗 Вітрина: ${mini}`,
    `📎 Посилання для чату: ${link}`,
  ]
    .filter(Boolean)
    .join('\n');
}
