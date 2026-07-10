/**
 * Спільні фільтри каталогу для /api/listings та /api/listings/feed.
 */

export type CatalogFilterParams = {
  category: string | null;
  subcategory: string | null;
  isFree: boolean;
  cities: string[];
  search: string | null;
  sortBy: string;
  minPrice: number | null;
  maxPrice: number | null;
  condition: 'new' | 'used' | null;
  currency: string | null;
  currencyColumnExists: boolean;
};

const PRICE_NUM_SQL = `CAST(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(l.price, ''), ' ', ''), '₴', ''), '€', ''), '$', ''), ',', '.') AS REAL)`;

export function parseOptionalInt(raw: string | null): number | null {
  if (raw == null || raw.trim() === '') return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

export function parseConditionParam(raw: string | null): 'new' | 'used' | null {
  if (!raw) return null;
  const c = raw.trim().toLowerCase();
  if (c === 'new' || c === 'used') return c;
  return null;
}

/**
 * Додає category/sub/isFree/cities/price/condition/currency/search/expires до WHERE.
 * Мутує params і повертає оновлений whereClause.
 */
export function appendCatalogFiltersToWhere(
  whereClause: string,
  params: unknown[],
  filters: CatalogFilterParams
): string {
  let where = whereClause;

  if (filters.category) {
    where += ' AND l.category = ?';
    params.push(filters.category);
  }
  if (filters.subcategory) {
    where += ' AND l.subcategory = ?';
    params.push(filters.subcategory);
  }
  if (filters.isFree) {
    where += ' AND l.isFree = 1';
  }
  if (filters.cities.length > 0) {
    const placeholders = filters.cities.map(() => 'l.location LIKE ?').join(' OR ');
    where += ` AND (${placeholders})`;
    filters.cities.forEach((city) => params.push(`%${city}%`));
  }

  if (filters.condition) {
    where += ' AND l.condition = ?';
    params.push(filters.condition);
  }

  if (filters.currency && filters.currencyColumnExists) {
    where += ' AND l.currency = ?';
    params.push(filters.currency);
  }

  // Ціна: дзеркалимо клієнтську логіку (Free проходить лише якщо minPrice null/0)
  if (filters.minPrice != null && filters.minPrice > 0) {
    where += ` AND l.isFree = 0 AND ${PRICE_NUM_SQL} >= ?`;
    params.push(filters.minPrice);
  }
  if (filters.maxPrice != null) {
    where += ` AND (l.isFree = 1 OR (${PRICE_NUM_SQL} IS NOT NULL AND ${PRICE_NUM_SQL} <= ?))`;
    params.push(filters.maxPrice);
  }

  return where;
}

export function catalogOrderByClause(sortBy: string): string {
  let orderByClause = 'ORDER BY';
  orderByClause +=
    " CASE WHEN l.promotionType = 'vip' AND (l.promotionEnds IS NULL OR datetime(l.promotionEnds) > datetime('now')) THEN 0";
  orderByClause +=
    " WHEN l.promotionType = 'top' AND (l.promotionEnds IS NULL OR datetime(l.promotionEnds) > datetime('now')) THEN 1";
  orderByClause += ' ELSE 2 END,';

  switch (sortBy) {
    case 'price_low':
      orderByClause += ' l.isFree DESC, l.createdAt DESC';
      break;
    case 'price_high':
      orderByClause += ' l.isFree ASC, l.createdAt DESC';
      break;
    case 'popular':
      orderByClause += ' l.views DESC, l.createdAt DESC';
      break;
    default:
      orderByClause += ' l.createdAt DESC';
  }
  return orderByClause;
}
