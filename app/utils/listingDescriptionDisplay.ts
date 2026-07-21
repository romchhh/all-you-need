/**
 * Опис з парсера: @username автора або посилання на оригінальний пост.
 * У блоці «Продавець» для спарсених оголошень — акаунт маркетплейсу (агрегатор),
 * тому автора/лінк з опису не прибираємо.
 */

const AUTHOR_LINE_RE =
  /(?:^|\n)\s*👤\s*(?:Автор|Author):\s*@[\w\d_]+\s*/gi;

/** Usernames акаунтів-агрегаторів парсера (не реальний продавець). */
const AGGREGATOR_SELLER_USERNAMES = new Set([
  'parser_bot',
  'tradeground_seller',
  'tradeground_seller2',
]);

/** Telegram ID акаунтів, під якими публікує парсер. */
const AGGREGATOR_TELEGRAM_IDS = new Set(['8590825131', '5587484547']);

function normalizeUsername(username?: string | null): string {
  return (username || '').trim().replace(/^@/, '');
}

export function isAggregatorSellerUsername(username?: string | null): boolean {
  const u = normalizeUsername(username).toLowerCase();
  return Boolean(u) && AGGREGATOR_SELLER_USERNAMES.has(u);
}

export function isParserAggregatorListing(
  sellerUsername?: string | null,
  sellerTelegramId?: string | number | null
): boolean {
  if (isAggregatorSellerUsername(sellerUsername)) return true;
  if (sellerTelegramId == null || sellerTelegramId === '') return false;
  return AGGREGATOR_TELEGRAM_IDS.has(String(sellerTelegramId));
}

function hasAuthorUsernameInDescription(text: string): boolean {
  return /👤\s*(?:Автор|Author):\s*@[\w\d_]+/i.test(text);
}

function extractAuthorUsername(text: string): string | null {
  const m = text.match(/👤\s*(?:Автор|Author):\s*@([\w\d_]+)/i);
  return m?.[1] || null;
}

function hasOriginalPostLink(text: string): boolean {
  return /🔗\s*(?:Оригінальне|Оригинальное|Original)/iu.test(text);
}

/** Чи показувати в описі посилання на оригінальний пост (немає @ автора). */
export function shouldShowOriginalPostInDescription(
  description: string,
  sellerUsername?: string | null,
  sellerTelegramId?: string | number | null
): boolean {
  if (hasAuthorUsernameInDescription(description)) return false;
  if (!hasOriginalPostLink(description)) return false;

  if (isParserAggregatorListing(sellerUsername, sellerTelegramId)) return true;

  const seller = normalizeUsername(sellerUsername);
  if (seller) return false;
  return true;
}

/**
 * Текст опису для UI:
 * - парсер/агрегатор: залишаємо «👤 Автор» і «🔗 оригінал»
 * - звичайний продавець: прибираємо дубль автора, якщо @ збігається з продавцем
 */
export function formatListingDescriptionForDisplay(
  description: string,
  sellerUsername?: string | null,
  sellerTelegramId?: string | number | null
): string {
  let text = (description || '').trim();
  if (!text) return '';

  const seller = normalizeUsername(sellerUsername);
  const aggregator = isParserAggregatorListing(sellerUsername, sellerTelegramId);
  const authorInDesc = extractAuthorUsername(description);

  const authorDuplicatesSeller =
    Boolean(seller) &&
    !aggregator &&
    Boolean(authorInDesc) &&
    authorInDesc!.toLowerCase() === seller.toLowerCase();

  if (authorDuplicatesSeller) {
    text = text.replace(AUTHOR_LINE_RE, '\n');
  }

  // Рядок 🔗 додає лише парсер — не приховуємо (раніше ховали через username продавця-агрегатора)

  return text.replace(/\n{3,}/g, '\n\n').trim();
}
