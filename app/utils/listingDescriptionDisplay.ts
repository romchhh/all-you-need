/**
 * Опис з парсера: @username автора або посилання на оригінальний пост.
 * У блоці «Продавець» для спарсених оголошень — акаунт маркетплейсу (агрегатор),
 * тому автора/лінк з опису не прибираємо.
 */

const AUTHOR_LINE_RE =
  /(?:^|\n)\s*👤\s*(?:Автор|Author):\s*@[\w\d_]+\s*/gi;

function normalizeUsername(username?: string | null): string {
  return (username || '').trim().replace(/^@/, '');
}

const STATIC_AGGREGATOR_USERNAMES = [
  'parser_bot',
  'tradeground',
  'tradeground_seller',
  'tradeground_seller2',
  'tradeground_seller3',
] as const;

function buildAggregatorUsernames(): Set<string> {
  const names = new Set<string>(STATIC_AGGREGATOR_USERNAMES);
  const extra = process.env.NEXT_PUBLIC_PARSER_AGGREGATOR_USERNAMES || '';
  for (const part of extra.split(',')) {
    const u = normalizeUsername(part).toLowerCase();
    if (u) names.add(u);
  }
  for (const key of [
    'NEXT_PUBLIC_PARSER_ACCOUNT_1_USERNAME',
    'NEXT_PUBLIC_PARSER_ACCOUNT_2_USERNAME',
    'NEXT_PUBLIC_PARSER_ACCOUNT_3_USERNAME',
  ]) {
    const u = normalizeUsername(process.env[key]).toLowerCase();
    if (u) names.add(u);
  }
  return names;
}

let cachedAggregatorUsernames: Set<string> | null = null;

/** Usernames акаунтів-агрегаторів парсера (не реальний продавець). */
function aggregatorSellerUsernames(): Set<string> {
  if (!cachedAggregatorUsernames) {
    cachedAggregatorUsernames = buildAggregatorUsernames();
  }
  return cachedAggregatorUsernames;
}

function buildAggregatorTelegramIds(): Set<string> {
  const ids = new Set<string>(['8590825131', '5587484547']);
  for (const key of [
    'NEXT_PUBLIC_PARSER_BOT_TELEGRAM_ID',
    'NEXT_PUBLIC_PARSER_SERVICES_BOT_TELEGRAM_ID',
    'NEXT_PUBLIC_PARSER_FALLBACK_BOT_TELEGRAM_ID',
    'PARSER_BOT_TELEGRAM_ID',
    'PARSER_SERVICES_BOT_TELEGRAM_ID',
    'PARSER_FALLBACK_BOT_TELEGRAM_ID',
  ]) {
    const raw = (process.env[key] || '').trim();
    if (raw && /^\d+$/.test(raw)) ids.add(raw);
  }
  return ids;
}

let cachedAggregatorTelegramIds: Set<string> | null = null;

/** Telegram ID акаунтів, під якими публікує парсер. */
function aggregatorTelegramIds(): Set<string> {
  if (!cachedAggregatorTelegramIds) {
    cachedAggregatorTelegramIds = buildAggregatorTelegramIds();
  }
  return cachedAggregatorTelegramIds;
}

export function isAggregatorSellerUsername(username?: string | null): boolean {
  const u = normalizeUsername(username).toLowerCase();
  return Boolean(u) && aggregatorSellerUsernames().has(u);
}

export function isParserAggregatorListing(
  sellerUsername?: string | null,
  sellerTelegramId?: string | number | null
): boolean {
  if (isAggregatorSellerUsername(sellerUsername)) return true;
  if (sellerTelegramId == null || sellerTelegramId === '') return false;
  return aggregatorTelegramIds().has(String(sellerTelegramId));
}

function hasAuthorUsernameInDescription(text: string): boolean {
  return /👤\s*(?:Автор|Author):\s*@[\w\d_]+/i.test(text);
}

function extractAuthorUsername(text: string): string | null {
  const m = text.match(/👤\s*(?:Автор|Author):\s*@([\w\d_]+)/i);
  return m?.[1] || null;
}

export function extractAuthorUsernameFromDescription(text: string): string | null {
  return extractAuthorUsername(text);
}

const ORIGINAL_POST_URL_RE =
  /🔗\s*(?:Оригінальне оголошення|Оригинальное объявление|Original(?:\s+(?:post|listing|ad))?)\s*:?\s*(https?:\/\/[^\s\n]+)/iu;

export function extractOriginalPostUrlFromDescription(text: string): string | null {
  const m = (text || '').match(ORIGINAL_POST_URL_RE);
  return m?.[1]?.trim() || null;
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
