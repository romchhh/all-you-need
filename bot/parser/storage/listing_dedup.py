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
    active_listings_dedup_sql,
    location_filter_clause,
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


def active_listing_duplicate(dedup_key: Optional[str], title: str, description: str) -> bool:
    """Чи є активне оголошення з тим самим dedup_key."""
    if not dedup_key:
        return False
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        active_listings_dedup_sql(),
        (f"-{PARSER_DEDUP_DAYS} days",),
    )
    rows = cursor.fetchall()
    conn.close()
    for row in rows:
        data = _row_dict(row)
        row_free = data.get("isFree") in (1, True, "1")
        existing = fingerprint_title_desc(
            str(data.get("title") or ""),
            str(data.get("description") or ""),
            price=str(data.get("price") or ""),
            is_free=row_free,
        )
        if existing and existing == dedup_key:
            logger.info(
                "Marketplace dedup hit: listing #%s title=%r",
                data.get("id"),
                (data.get("title") or "")[:50],
            )
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
