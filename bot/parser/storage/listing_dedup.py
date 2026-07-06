"""Дедуплікація парсера проти активних оголошень маркетплейсу."""

from __future__ import annotations

import logging
import re
from typing import Optional

from parser.config.settings import PARSER_DEDUP_DAYS
from parser.storage.connection import get_connection
from parser.storage.parsed_items import fingerprint_title_desc

logger = logging.getLogger(__name__)


def _norm_token(s: str) -> str:
    s = (s or "").lower()
    s = re.sub(r"[^\w\s\u0400-\u04FF]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def active_listing_duplicate(dedup_key: Optional[str], title: str, description: str) -> bool:
    """Чи є активне оголошення з тим самим dedup_key."""
    if not dedup_key:
        return False
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT id, title, description
        FROM Listing
        WHERE status = 'active'
          AND (expiresAt IS NULL OR datetime(expiresAt) > datetime('now'))
          AND datetime(createdAt) >= datetime('now', ?)
        ORDER BY id DESC
        LIMIT 800
        """,
        (f"-{PARSER_DEDUP_DAYS} days",),
    )
    rows = cursor.fetchall()
    conn.close()
    for row in rows:
        data = dict(row)
        existing = fingerprint_title_desc(
            str(data.get("title") or ""),
            str(data.get("description") or ""),
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
        loc_clause = " AND (location LIKE ? OR location IS NULL OR location = '')"
        params_active.append(f"%{loc}%")
    params_active.append(limit_active)

    cursor.execute(
        f"""
        SELECT id, title, location, price
        FROM Listing
        WHERE status = 'active'
          AND (expiresAt IS NULL OR datetime(expiresAt) > datetime('now'))
          AND datetime(createdAt) >= datetime('now', ?)
          {loc_clause}
        ORDER BY id DESC
        LIMIT ?
        """,
        params_active,
    )
    active = [dict(r) for r in cursor.fetchall()]

    title_token = _norm_token(title).split()[:3]
    like = f"%{title_token[0]}%" if title_token else "%"
    cursor.execute(
        """
        SELECT title FROM parsed_items
        WHERE status = 'pending'
          AND datetime(created_at) >= datetime('now', '-7 days')
          AND title LIKE ?
        ORDER BY id DESC
        LIMIT ?
        """,
        (like, limit_pending),
    )
    pending = [str(dict(r).get("title") or "") for r in cursor.fetchall() if r]
    conn.close()

    return {"active_listings": active, "pending_titles": pending}
