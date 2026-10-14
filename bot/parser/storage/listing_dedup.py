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
    listing_title_price_duplicate_sql,
    location_filter_clause,
    published_parsed_dedup_sql,
)

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


def active_listing_duplicate(
    dedup_key: Optional[str],
    title: str,
    description: str,
    *,
    price: str | None = None,
    is_free: bool = False,
) -> bool:
    """Чи є вже опубліковане оголошення з тим самим ключем або заголовком і ціною."""
    del description  # відбиток опису сидить у dedup_key, збереженому на етапі parse
    window = f"-{PARSER_DEDUP_DAYS} days"
    conn = get_connection()
    cursor = conn.cursor()
    key = (dedup_key or "").strip()
    if key:
        cursor.execute(published_parsed_dedup_sql(), (key, window))
        if cursor.fetchone():
            conn.close()
            logger.info("Marketplace dedup hit by parsed dedup_key")
            return True

    norm_title = _match_title(title)
    raw_title = (title or "").strip().lower()[:220]
    price_part = _match_price(price, is_free)
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
