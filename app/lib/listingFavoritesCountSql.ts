/**
 * Відображувана кількість «лайків» = COUNT(Favorite) + Listing.favoriteBoost (накрутка в боті).
 * У raw SQL: `, ${LISTING_FAVORITES_COUNT_SQL} as favoritesCount`
 * Після `ensureListingApiRawColumns()` (колонка favoriteBoost).
 */
export const LISTING_FAVORITES_COUNT_SQL = `(COALESCE((SELECT COUNT(*) FROM Favorite WHERE listingId = l.id), 0) + COALESCE(l.favoriteBoost, 0))`;
