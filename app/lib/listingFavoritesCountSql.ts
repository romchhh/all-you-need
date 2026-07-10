/**
 * Відображувана кількість «лайків» = COUNT(Favorite) + Listing.favoriteBoost.
 *
 * Для каталогу: LEFT JOIN агрегату (без N+1 correlated subquery).
 * Для одиночних SELECT: correlated subquery як раніше.
 */
export const LISTING_FAVORITES_COUNT_SQL = `(COALESCE((SELECT COUNT(*) FROM Favorite WHERE listingId = l.id), 0) + COALESCE(l.favoriteBoost, 0))`;

/** JOIN-фрагмент для каталогу (alias `fav`). */
export const LISTING_FAVORITES_JOIN_SQL = `LEFT JOIN (
  SELECT listingId, COUNT(*) AS cnt
  FROM Favorite
  GROUP BY listingId
) fav ON fav.listingId = l.id`;

/** Вираз favoritesCount при наявності JOIN `fav`. */
export const LISTING_FAVORITES_COUNT_FROM_JOIN_SQL = `(COALESCE(fav.cnt, 0) + COALESCE(l.favoriteBoost, 0))`;
