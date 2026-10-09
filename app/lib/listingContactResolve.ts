import type { BusinessSeller, Listing } from '@/types';
import {
  extractAuthorUsernameFromDescription,
  extractOriginalPostUrlFromDescription,
  isAggregatorSellerUsername,
  isParserAggregatorListing,
} from '@/utils/listingDescriptionDisplay';

function normalizeUsername(username?: string | null): string {
  return (username || '').trim().replace(/^@/, '');
}

/** Реальний @ для «Написати» (не акаунт-агрегатор парсера). */
export function resolveListingContactUsername(
  sellerUsername?: string | null,
  sellerTelegramId?: string | number | null,
  description?: string | null,
  businessSeller?: BusinessSeller | null,
  parserAuthorUsername?: string | null
): string | null {
  const parserAuthor = normalizeUsername(parserAuthorUsername);
  if (parserAuthor) return parserAuthor;

  const descAuthor = extractAuthorUsernameFromDescription(description || '');
  if (descAuthor) return descAuthor;

  const seller = normalizeUsername(sellerUsername);
  const aggregator = isParserAggregatorListing(sellerUsername, sellerTelegramId);
  if (seller && !aggregator && !isAggregatorSellerUsername(seller)) {
    return seller;
  }

  const businessUser = normalizeUsername(businessSeller?.sellerUsername);
  if (businessUser) return businessUser;

  const businessTelegram = normalizeUsername(businessSeller?.telegram);
  if (businessTelegram && !businessTelegram.includes('/')) {
    return businessTelegram;
  }

  return null;
}

export function resolveListingOriginalPostUrl(
  description?: string | null,
  msgLink?: string | null
): string | null {
  const fromDesc = extractOriginalPostUrlFromDescription(description || '');
  if (fromDesc) return fromDesc;
  const link = (msgLink || '').trim();
  return link.startsWith('http') ? link : null;
}

export type ListingContactAction =
  | { kind: 'telegram_dm'; username: string }
  | { kind: 'share_listing' }
  | { kind: 'open_url'; url: string }
  | { kind: 'phone'; phone: string };

export function resolveListingContactAction(
  listing: Pick<Listing, 'description' | 'seller' | 'businessSeller' | 'fromParser'> & {
    originalPostUrl?: string | null;
    parserAuthorUsername?: string | null;
  }
): ListingContactAction {
  const username = resolveListingContactUsername(
    listing.seller.username,
    listing.seller.telegramId,
    listing.description,
    listing.businessSeller,
    listing.parserAuthorUsername
  );
  if (username) {
    return { kind: 'telegram_dm', username };
  }

  const originalUrl = resolveListingOriginalPostUrl(
    listing.description,
    listing.originalPostUrl
  );
  if (
    originalUrl &&
    (listing.fromParser ||
      isParserAggregatorListing(listing.seller.username, listing.seller.telegramId))
  ) {
    return { kind: 'open_url', url: originalUrl };
  }

  return { kind: 'share_listing' };
}
