import { normalizeCityInput } from '@/lib/city/cityNormalization';

/** LIKE patterns for catalog / business filters (canonical + raw input). */
export function cityFilterPatterns(rawCity: string): string[] {
  const normalized = normalizeCityInput(rawCity);
  const trimmed = rawCity.trim();
  return [...new Set([normalized, trimmed].filter(Boolean))].map((p) => `%${p}%`);
}

/**
 * One city OR-group for Listing alias `l`. Pushes 2 params per pattern (location + parsed_items.source_city).
 */
export function listingCityOrGroupSql(patterns: string[], params: unknown[]): string {
  if (patterns.length === 0) return '1=0';
  const matchParts = patterns.map(
    () =>
      `(l.location LIKE ? OR EXISTS (
        SELECT 1 FROM parsed_items pi
        WHERE pi.marketplace_listing_id = l.id
          AND COALESCE(pi.source_city, '') LIKE ?
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
  const bpParts = patterns.map(() => 'bp.city LIKE ?');
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
