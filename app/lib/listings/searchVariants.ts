import { normalizeCityInput } from '@/lib/city/cityNormalization';

export function normalizeCyrillicToLower(text: string): string {
  return text.toLowerCase();
}

/** LIKE/ILIKE contains-pattern; strips %/_ so user input cannot widen the match. */
export function sqlLikeContainsPattern(term: string): string {
  return `%${term.trim().replace(/[%_]/g, '')}%`;
}

/**
 * SQL-вираз опису для LIKE-пошуку.
 * Не використовуємо regexp_replace: PostgreSQL не приймає PCRE `(?m)` / `\s` у цьому шаблоні
 * і валить увесь пошук (каталог без search при цьому живий).
 * Рядки «👤 Автор» відсікає listingMatchesSearchQuery після вибірки.
 */
export function sqlListingSearchableDescription(alias = 'l'): string {
  return `COALESCE(${alias}.description, '')`;
}

/** Рядки метаданих парсера — не мають впливати на пошук (інакше @bmw знаходить усі його оголошення). */
const SEARCH_META_LINE_RE =
  /(?:^|\n)\s*(?:👤\s*(?:Автор|Author):\s*@[\w\d_]+|🔗\s*(?:Оригінальне оголошення|Оригинальное объявление|Original)[^\n]*)/gi;

/** Опис без «👤 Автор» / «🔗 оригінал» для матчу пошуку. */
export function stripListingSearchMeta(description: string): string {
  return (description || '')
    .replace(SEARCH_META_LINE_RE, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Чи оголошення реально відповідає запиту (title / location / опис без ніку автора). */
export function listingMatchesSearchQuery(
  listing: { title?: string | null; description?: string | null; location?: string | null },
  search: string
): boolean {
  const trimmed = search.trim();
  if (!trimmed) return true;

  const variants = generateSearchVariantsWithCities(trimmed);
  const title = normalizeCyrillicToLower(listing.title || '');
  const location = normalizeCyrillicToLower(listing.location || '');
  const description = normalizeCyrillicToLower(stripListingSearchMeta(listing.description || ''));

  return variants.some((variant) => {
    const needle = normalizeCyrillicToLower(variant);
    if (!needle) return false;
    return title.includes(needle) || location.includes(needle) || description.includes(needle);
  });
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
  const baseVariants = generateSearchVariants(searchText);
  const trimmed = searchText.trim();
  if (!trimmed) return baseVariants;

  if (/\s/.test(trimmed)) {
    return baseVariants;
  }

  const normalizedCity = normalizeCityInput(trimmed);
  if (normalizedCity === trimmed) {
    return baseVariants;
  }

  const cityVariants = generateSearchVariants(normalizedCity);
  return Array.from(new Set([...baseVariants, ...cityVariants]));
}
