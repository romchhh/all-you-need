import { CITY_ALIASES, foldCityKey, normalizeCityInput } from '@/lib/city/cityNormalization';
import { sqlLikeOp } from '@/lib/dbSql';

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/** LIKE patterns for catalog / business filters (canonical, aliases, ASCII без умлаута). */
export function cityFilterPatterns(rawCity: string): string[] {
  const normalized = normalizeCityInput(rawCity);
  const variants = new Set<string>();
  const add = (value: string) => {
    const trimmed = value.trim();
    if (trimmed) variants.add(trimmed);
  };

  add(normalized);
  add(rawCity);
  if (normalized) {
    add(
      normalized
        .replace(/ß/g, 'ss')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
    );
    const target = foldCityKey(normalized);
    for (const [alias, canonical] of Object.entries(CITY_ALIASES)) {
      if (foldCityKey(canonical) === target) add(alias);
    }
  }

  return [...variants].map((p) => `%${escapeLike(p)}%`);
}

/**
 * One city OR-group for Listing alias `l`. Pushes 2 params per pattern (location + parsed_items.source_city).
 */
export function listingCityOrGroupSql(patterns: string[], params: unknown[]): string {
  if (patterns.length === 0) return '1=0';
  const like = sqlLikeOp();
  const matchParts = patterns.map(
    () =>
      `(l.location ${like} ? OR EXISTS (
        SELECT 1 FROM parsed_items pi
        WHERE CAST(pi.marketplace_listing_id AS TEXT) = CAST(l.id AS TEXT)
          AND COALESCE(pi.source_city, '') ${like} ?
      ))`
  );
  patterns.forEach((p) => {
    params.push(p, p);
  });
  return `(${matchParts.join(' OR ')})`;
}

/** One city: business city field OR any active listing in that city. */
export function businessCityOrGroupSql(patterns: string[], params: unknown[]): string {
  if (patterns.length === 0) return '1=0';
  const bpParts = patterns.map(() => `bp.city ${sqlLikeOp()} ?`);
  patterns.forEach((p) => params.push(p));
  const listingGroup = listingCityOrGroupSql(patterns, params);
  return `((${bpParts.join(' OR ')}) OR EXISTS (
    SELECT 1 FROM Listing l
    WHERE l.userId = bp.userId
      AND l.status = 'active'
      AND ${listingGroup}
  ))`;
}

/** @deprecated use businessCityOrGroupSql per city and join with OR */
export function businessCityFilterSql(patterns: string[], params: unknown[]): string {
  return ` AND ${businessCityOrGroupSql(patterns, params)}`;
}
