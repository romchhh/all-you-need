import { foldCityKey, normalizeCityInput } from '@/lib/city/cityNormalization';
import { isPostgres, sqlLikeOp } from '@/lib/dbSql';

export function normalizeCyrillicToLower(text: string): string {
  return text.toLowerCase();
}

/** LIKE/ILIKE contains-pattern; strips %/_ so user input cannot widen the match. */
export function sqlLikeContainsPattern(term: string): string {
  return `%${term.trim().replace(/[%_]/g, '')}%`;
}

const AUTHOR_MARK = '👤';
const LINK_MARK = '🔗';

/**
 * SQL-вираз опису для LIKE-пошуку.
 * Не використовуємо regexp_replace: PostgreSQL не приймає PCRE `(?m)` / `\s`
 * і валить увесь /api/listings?search= (каталог без search при цьому живий).
 * Ріжемо текст до «👤» / «🔗», щоб рядок автора не займав усю вибірку.
 */
export function sqlListingSearchableDescription(alias = 'l'): string {
  const desc = `COALESCE(${alias}.description, '')`;
  if (isPostgres()) {
    return `(CASE
      WHEN strpos(${desc}, '${AUTHOR_MARK}') > 0 OR strpos(${desc}, '${LINK_MARK}') > 0
      THEN substring(${desc} from 1 for (
        CASE
          WHEN strpos(${desc}, '${AUTHOR_MARK}') = 0 THEN strpos(${desc}, '${LINK_MARK}')
          WHEN strpos(${desc}, '${LINK_MARK}') = 0 THEN strpos(${desc}, '${AUTHOR_MARK}')
          ELSE LEAST(strpos(${desc}, '${AUTHOR_MARK}'), strpos(${desc}, '${LINK_MARK}'))
        END
      ) - 1)
      ELSE ${desc}
    END)`;
  }
  return `(CASE
    WHEN instr(${desc}, '${AUTHOR_MARK}') > 0 OR instr(${desc}, '${LINK_MARK}') > 0
    THEN substr(
      ${desc},
      1,
      min(
        CASE WHEN instr(${desc}, '${AUTHOR_MARK}') = 0 THEN length(${desc}) + 1 ELSE instr(${desc}, '${AUTHOR_MARK}') END,
        CASE WHEN instr(${desc}, '${LINK_MARK}') = 0 THEN length(${desc}) + 1 ELSE instr(${desc}, '${LINK_MARK}') END
      ) - 1
    )
    ELSE ${desc}
  END)`;
}

/** Рядки метаданих парсера — не мають впливати на пошук (інакше @bmw знаходить усі його оголошення). */
const SEARCH_META_LINE_RE =
  /(?:^|\n)\s*(?:👤\s*(?:Автор|Author):\s*@[\w\d_]+|🔗\s*(?:Оригінальне оголошення|Оригинальное объявление|Original)[^\n]*)/gi;

/** Опис без «👤 Автор» / «🔗 оригінал» для матчу пошуку. */
export function stripListingSearchMeta(description: string): string {
  const raw = description || '';
  let cut = raw.length;
  const authorAt = raw.indexOf(AUTHOR_MARK);
  const linkAt = raw.indexOf(LINK_MARK);
  if (authorAt >= 0) cut = Math.min(cut, authorAt);
  if (linkAt >= 0) cut = Math.min(cut, linkAt);
  const sliced = cut < raw.length ? raw.slice(0, cut) : raw;
  return sliced.replace(SEARCH_META_LINE_RE, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Слова запиту (2+ символи). Кілька слів матчаться разом, не лише як суцільна фраза. */
export function searchTokens(search: string): string[] {
  const trimmed = search.trim().replace(/\s+/g, ' ');
  if (trimmed.length < 2) return [];
  if (trimmed.length > 80) return [trimmed.slice(0, 80)];
  const parts = trimmed
    .split(' ')
    .map((token) => token.replace(/[%_]/g, ''))
    .filter((token) => token.length >= 2);
  if (parts.length === 0) return [trimmed.replace(/[%_]/g, '').slice(0, 80)].filter((t) => t.length >= 2);
  return parts.slice(0, 6);
}

function textHasVariant(text: string, variant: string): boolean {
  const needle = normalizeCyrillicToLower(variant).replace(/[%_]/g, '');
  if (needle.length < 2) return false;
  return text.includes(needle);
}

/** Чи оголошення реально відповідає запиту (title / location / опис без ніку автора). */
export function listingMatchesSearchQuery(
  listing: { title?: string | null; description?: string | null; location?: string | null },
  search: string
): boolean {
  const tokens = searchTokens(search);
  if (tokens.length === 0) return search.trim().length < 2;

  const title = normalizeCyrillicToLower(listing.title || '');
  const location = normalizeCyrillicToLower(listing.location || '');
  const description = normalizeCyrillicToLower(stripListingSearchMeta(listing.description || ''));

  return tokens.every((token) => {
    const variants = generateSearchVariantsWithCities(token);
    return variants.some(
      (variant) =>
        textHasVariant(title, variant) ||
        textHasVariant(location, variant) ||
        textHasVariant(description, variant)
    );
  });
}

/**
 * Додає текстовий матч до WHERE.
 * Кожне слово має бути в title, location або описі (без рядка автора).
 */
export function appendListingTextSearch(
  whereClause: string,
  params: unknown[],
  search: string,
  alias = 'l'
): string {
  const tokens = searchTokens(search);
  if (tokens.length === 0) {
    if (search.trim().length >= 2) return `${whereClause} AND 1 = 0`;
    return whereClause;
  }

  const likeOp = sqlLikeOp();
  const searchableDesc = sqlListingSearchableDescription(alias);
  const groups = tokens.map((token) => {
    const variants = generateSearchVariantsWithCities(token);
    const ors = variants
      .map(
        () =>
          `(${alias}.title ${likeOp} ? OR ${searchableDesc} ${likeOp} ? OR ${alias}.location ${likeOp} ?)`
      )
      .join(' OR ');
    for (const variant of variants) {
      const pattern = sqlLikeContainsPattern(variant);
      params.push(pattern, pattern, pattern);
    }
    return `(${ors})`;
  });

  return `${whereClause} AND ${groups.join(' AND ')}`;
}

export function generateSearchVariants(searchText: string): string[] {
  const variants = new Set<string>();
  const normalized = normalizeCyrillicToLower(searchText);

  variants.add(searchText);
  variants.add(normalized);

  if (searchText.length > 0) {
    const firstUpper = normalized.charAt(0).toUpperCase() + normalized.slice(1);
    variants.add(firstUpper);
  }

  variants.add(searchText.toUpperCase());

  return Array.from(variants);
}

export function generateSearchVariantsWithCities(searchText: string): string[] {
  const trimmed = searchText.trim();
  const baseVariants = generateSearchVariants(trimmed || searchText).filter(
    (variant) => variant.replace(/[%_]/g, '').length >= 2
  );
  if (!trimmed || /\s/.test(trimmed)) return baseVariants;

  const extra = new Set(baseVariants);
  const normalizedCity = normalizeCityInput(trimmed);
  if (normalizedCity && normalizedCity !== trimmed) {
    for (const variant of generateSearchVariants(normalizedCity)) extra.add(variant);
  }
  const folded = foldCityKey(normalizedCity || trimmed);
  if (folded && folded.length >= 2 && folded !== trimmed.toLowerCase()) {
    extra.add(folded);
    extra.add(folded.charAt(0).toUpperCase() + folded.slice(1));
  }
  return Array.from(extra).filter((variant) => variant.replace(/[%_]/g, '').length >= 2);
}
