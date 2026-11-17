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

export function marketplaceLinkLabel(lang: 'uk' | 'ru'): string {
  return lang === 'ru'
    ? 'Объявление TradeGround Marketplace'
    : 'Оголошення TradeGround Marketplace';
}

/** Одна посилання: підпис + URL картки в маркетплейсі. */
export function marketplaceLinkBlock(listingId: number, lang: 'uk' | 'ru'): string {
  return `🔗 ${marketplaceLinkLabel(lang)}\n${getListingMiniAppLink(listingId)}`;
}

export function withoutMarketplaceLink(text: string, listingId: number, lang: 'uk' | 'ru'): string {
  const url = getListingMiniAppLink(listingId);
  const share = getListingShareLink(listingId);
  const label = marketplaceLinkLabel(lang);
  return text
    .split(marketplaceLinkBlock(listingId, lang)).join('')
    .split(url).join('')
    .split(share).join('')
    .split(`🔗 ${label}`).join('')
    .replace(/\n*🔗\s*(?:Витрина|Вітрина):\s*/g, '')
    .replace(/\n*📎\s*(?:Ссылка для чата|Посилання для чату):\s*/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function withMarketplaceLink(text: string, listingId: number, lang: 'uk' | 'ru'): string {
  const body = withoutMarketplaceLink(text, listingId, lang);
  const block = marketplaceLinkBlock(listingId, lang);
  return body ? `${body}\n\n${block}` : block;
}

export function buildDefaultChatListingText(
  listing: ChatListingDraftInput,
  lang: 'uk' | 'ru',
  options?: { includeLink?: boolean }
): string {
  const priceLine = listing.isFree
    ? listing.freeLabel
    : listing.price === listing.negotiableLabel ||
        listing.price === 'Договірна' ||
        listing.price === 'Договорная'
      ? listing.negotiableLabel
      : `${listing.price}${getCurrencySymbol((listing.currency as 'EUR' | 'USD' | 'UAH' | undefined) || 'EUR')}`;

  const desc = trimDescription(listing.description);
  const locationFallback = lang === 'ru' ? 'Германия' : 'Німеччина';
  const body = [
    `📦 ${listing.title.trim()}`,
    `💶 ${priceLine}`,
    `📍 ${listing.location.trim() || locationFallback}`,
    desc ? `\n${desc}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  if (options?.includeLink === false) return body;
  return withMarketplaceLink(body, listing.id, lang);
}
