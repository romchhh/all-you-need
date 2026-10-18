"""Дедуплікація парсера проти активних оголошень маркетплейсу."""

from __future__ import annotations

import logging
import re
from typing import Any, Optional

from database_functions.db_connection import adapt_sql
from parser.config.settings import PARSER_DEDUP_DAYS
from parser.storage.connection import get_connection
from parser.storage.listing_sql import (
    active_listings_context_sql,
    author_title_price_parsed_duplicate_sql,
    listing_title_price_duplicate_sql,
    location_filter_clause,
    pending_or_published_dedup_sql,
    published_parsed_dedup_sql,
)
from parser.storage.parsed_items import fingerprint_title_desc

logger = logging.getLogger(__name__)


def _norm_token(s: str) -> str:
    s = (s or "").lower()
    s = re.sub(r"[^\w\s\u0400-\u04FF]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def _row_dict(row: Any) -> dict[str, Any]:
    if isinstance(row, dict):
        return row
    if hasattr(row, "keys"):
        return {k: row[k] for k in row.keys()}
    return dict(row)


def _match_title(title: str) -> str:
    return re.sub(r"\s+", " ", (title or "").strip().lower())[:220]


def _match_price(price: str | None, is_free: bool) -> str:
    if is_free:
        return "free"
    return re.sub(r"\s+", "", str(price or "").lower())[:40]


def resolve_stable_dedup_key(
    item: dict | None,
    *,
    title: str = "",
    description: str = "",
    price: str | None = None,
    is_free: bool = False,
) -> str:
    """Збережений ключ з parsed_items; перерахунок лише якщо поля немає."""
    stored = ""
    if item:
        stored = str(item.get("dedup_key") or "").strip()
        if stored:
            return stored
        if price is None:
            price = None if item.get("price") is None else str(item.get("price") or "")
        if not title:
            title = str(item.get("title") or "")
        if not description:
            description = str(item.get("description") or "")
        if not is_free:
            is_free = bool(item.get("is_free"))
    return fingerprint_title_desc(
        title,
        description,
        price=None if price is None else str(price),
        is_free=bool(is_free),
    )


def active_listing_duplicate(
    dedup_key: Optional[str],
    title: str,
    description: str,
    *,
    price: str | None = None,
    is_free: bool = False,
    author_id: int | None = None,
    exclude_parsed_id: int = 0,
) -> bool:
    """
    Чи вже є те саме оголошення (крос-канал):
    - опублікований parsed_items.dedup_key;
    - раніше вставлений pending/approved з тим самим ключем;
    - активний Listing з тим самим title+price;
    - той самий author_id + title + price.
    """
    del description  # відбиток опису сидить у dedup_key
    window = f"-{PARSER_DEDUP_DAYS} days"
    conn = get_connection()
    cursor = conn.cursor()
    key = (dedup_key or "").strip()
    exclude_id = int(exclude_parsed_id or 0)

    if key:
        cursor.execute(published_parsed_dedup_sql(), (key, window))
        if cursor.fetchone():
            conn.close()
            logger.info("Marketplace dedup hit by parsed dedup_key")
            return True
        cursor.execute(pending_or_published_dedup_sql(), (key, exclude_id, window))
        if cursor.fetchone():
            conn.close()
            logger.info("Marketplace dedup hit by pending/earlier dedup_key")
            return True

    norm_title = _match_title(title)
    raw_title = (title or "").strip().lower()[:220]
    price_part = _match_price(price, is_free)

    try:
        author = int(author_id) if author_id is not None else 0
    except (TypeError, ValueError):
        author = 0

    if author > 0 and len(norm_title) >= 4 and price_part:
        cursor.execute(
            author_title_price_parsed_duplicate_sql(),
            (author, exclude_id, window, norm_title, raw_title, price_part, price_part),
        )
        if cursor.fetchone():
            conn.close()
            logger.info(
                "Marketplace dedup hit by author+title+price author=%s %r",
                author,
                norm_title[:50],
            )
            return True

    if len(norm_title) < 4 or not price_part:
        conn.close()
        return False
    cursor.execute(
        listing_title_price_duplicate_sql(),
        (window, norm_title, raw_title, price_part, price_part),
    )
    row = cursor.fetchone()
    conn.close()
    if row:
        logger.info("Marketplace dedup hit by title+price %r", norm_title[:50])
        return True
    return False


def recent_listings_for_ai_context(
    *,
    title: str = "",
    location: str = "",
    limit_active: int = 15,
    limit_pending: int = 12,
) -> dict:
    """Контекст для AI: активні listings + pending parsed_items."""
    conn = get_connection()
    cursor = conn.cursor()

    loc = (location or "").strip()
    loc_clause = ""
    params_active: list = [f"-{PARSER_DEDUP_DAYS} days"]
    if loc and loc.lower() not in ("germany", "deutschland"):
        loc_clause = location_filter_clause()
        params_active.append(f"%{loc}%")
    params_active.append(limit_active)

    cursor.execute(
        active_listings_context_sql(loc_clause),
        params_active,
    )
    active = [_row_dict(r) for r in cursor.fetchall()]

    title_token = _norm_token(title).split()[:3]
    like = f"%{title_token[0]}%" if title_token else "%"
    cursor.execute(
        adapt_sql(
            """
        SELECT title FROM parsed_items
        WHERE status = 'pending'
          AND datetime(created_at) >= datetime('now', '-7 days')
          AND title LIKE ?
        ORDER BY id DESC
        LIMIT ?
        """
        ),
        (like, limit_pending),
    )
    pending = [str(_row_dict(r).get("title") or "") for r in cursor.fetchall() if r]
    conn.close()

    return {"active_listings": active, "pending_titles": pending}
