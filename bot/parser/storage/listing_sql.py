"""SQL для таблиці Listing у парсері — явні варіанти SQLite / PostgreSQL."""

from __future__ import annotations

from database_functions.db_connection import is_postgres


def active_listings_dedup_sql() -> str:
    if is_postgres():
        return """
SELECT id, title, description, price, "isFree"
FROM "Listing"
WHERE status = 'active'
  AND ("expiresAt" IS NULL OR "expiresAt" > NOW())
  AND "createdAt" >= NOW() + CAST(? AS INTERVAL)
ORDER BY id DESC
LIMIT 800
"""
    return """
SELECT id, title, description, price, isFree
FROM Listing
WHERE status = 'active'
  AND (expiresAt IS NULL OR datetime(expiresAt) > datetime('now'))
  AND datetime(createdAt) >= datetime('now', ?)
ORDER BY id DESC
LIMIT 800
"""


def active_listings_context_sql(loc_clause: str = "") -> str:
    if is_postgres():
        return f"""
SELECT id, title, location, price
FROM "Listing"
WHERE status = 'active'
  AND ("expiresAt" IS NULL OR "expiresAt" > NOW())
  AND "createdAt" >= NOW() + CAST(? AS INTERVAL)
{loc_clause}
ORDER BY id DESC
LIMIT ?
"""
    return f"""
SELECT id, title, location, price
FROM Listing
WHERE status = 'active'
  AND (expiresAt IS NULL OR datetime(expiresAt) > datetime('now'))
  AND datetime(createdAt) >= datetime('now', ?)
{loc_clause}
ORDER BY id DESC
LIMIT ?
"""


def location_filter_clause() -> str:
    if is_postgres():
        return " AND (\"location\" LIKE ? OR \"location\" IS NULL OR \"location\" = '')"
    return " AND (location LIKE ? OR location IS NULL OR location = '')"


def mp_dedup_cleanup_select_sql() -> str:
    if is_postgres():
        return """
SELECT id, title, description, price, "isFree", "createdAt"
FROM "Listing"
WHERE status = 'active'
  AND ("expiresAt" IS NULL OR "expiresAt" > NOW())
  AND "createdAt" >= NOW() + CAST(? AS INTERVAL)
ORDER BY id ASC
"""
    return """
SELECT id, title, description, price, isFree, createdAt
FROM Listing
WHERE status = 'active'
  AND (expiresAt IS NULL OR datetime(expiresAt) > datetime('now'))
  AND datetime(createdAt) >= datetime('now', ?)
ORDER BY id ASC
"""


def mp_dedup_hide_sql() -> str:
    if is_postgres():
        return """
UPDATE "Listing"
SET status = 'hidden',
    "updatedAt" = NOW()
WHERE id = ?
  AND status = 'active'
"""
    return """
UPDATE Listing
SET status = 'hidden',
    updatedAt = datetime('now')
WHERE id = ?
  AND status = 'active'
"""


def listing_is_live_sql() -> str:
    if is_postgres():
        return """
SELECT 1 FROM "Listing"
WHERE id = ?
  AND status = 'active'
  AND ("expiresAt" IS NULL OR "expiresAt" > NOW())
LIMIT 1
"""
    return """
SELECT 1 FROM Listing
WHERE id = ?
  AND status = 'active'
  AND (expiresAt IS NULL OR datetime(expiresAt) > datetime('now'))
LIMIT 1
"""


def create_listing_insert_sql() -> str:
    if is_postgres():
        return """
INSERT INTO "Listing" (
    "userId", title, description, price, currency, "isFree",
    category, subcategory, condition, location,
    status, "moderationStatus",
    images, "optimizedImages",
    "createdAt", "updatedAt", "publishedAt", "expiresAt"
) VALUES (
    ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?,
    'active', 'approved',
    ?, NULL,
    NOW(), NOW(), NOW(), NOW() + INTERVAL '30 days'
)
"""
    return """
INSERT INTO Listing (
    userId, title, description, price, currency, isFree,
    category, subcategory, condition, location,
    status, moderationStatus,
    images, optimizedImages,
    createdAt, updatedAt, publishedAt, expiresAt
) VALUES (
    ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?,
    'active', 'approved',
    ?, NULL,
    datetime('now'), datetime('now'), datetime('now'), datetime('now', '+30 days')
)
"""


def listing_live_exists_fragment(listing_id_expr: str) -> str:
    if is_postgres():
        return f"""EXISTS (
            SELECT 1 FROM "Listing" l
            WHERE l.id = {listing_id_expr}
              AND l.status = 'active'
              AND (l."expiresAt" IS NULL OR l."expiresAt" > NOW())
        )"""
    return f"""EXISTS (
        SELECT 1 FROM Listing l
        WHERE l.id = {listing_id_expr}
          AND l.status = 'active'
          AND (l.expiresAt IS NULL OR datetime(l.expiresAt) > datetime('now'))
    )"""


def parsed_item_created_within_fragment(alias: str, placeholder: str = "?") -> str:
    if is_postgres():
        return f"{alias}.created_at >= NOW() + CAST({placeholder} AS INTERVAL)"
    return f"datetime({alias}.created_at) >= datetime('now', {placeholder})"


def parsed_item_blocks_duplicates_sql(alias: str = "pi") -> str:
    created = parsed_item_created_within_fragment(alias)
    return f"""(
        {alias}.marketplace_listing_id IS NOT NULL
        AND {listing_live_exists_fragment(f'{alias}.marketplace_listing_id')}
    )
    OR (
        {alias}.marketplace_listing_id IS NULL
        AND {alias}.status = 'pending'
        AND {created}
    )
    OR (
        {alias}.marketplace_listing_id IS NULL
        AND {alias}.status = 'approved'
        AND COALESCE({alias}.parser_type, 'default') = 'services_channel'
        AND {created}
    )"""


def is_created_at_within_dedup_window_sql() -> str:
    if is_postgres():
        return "SELECT 1 WHERE ?::timestamp >= NOW() + CAST(? AS INTERVAL)"
    return "SELECT 1 WHERE datetime(?) >= datetime('now', ?)"


def listing_images_select_sql() -> str:
    if is_postgres():
        return """
SELECT images FROM "Listing"
WHERE images IS NOT NULL AND TRIM(images) NOT IN ('', '[]')
"""
    return """
SELECT images FROM Listing
WHERE images IS NOT NULL AND TRIM(images) NOT IN ('', '[]')
"""


def bot_user_select_by_telegram_sql() -> str:
    if is_postgres():
        return 'SELECT id FROM "User" WHERE "telegramId" = ?'
    return "SELECT id FROM User WHERE telegramId = ?"


def bot_user_insert_sql() -> str:
    if is_postgres():
        return """
INSERT INTO "User" ("telegramId", username, "firstName", "isActive", "agreementAccepted", "createdAt", "updatedAt")
VALUES (?, ?, ?, ?, ?, NOW(), NOW())
"""
    return """
INSERT INTO User (telegramId, username, firstName, isActive, agreementAccepted, createdAt, updatedAt)
VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
"""

