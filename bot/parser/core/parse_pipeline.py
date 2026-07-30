"""Спільна логіка AI-фільтра та дедупу для парсерів."""

from __future__ import annotations

import logging
from typing import Any, Optional

from parser.ai.screen import ai_screen_parsed_listing, apply_screen_enrichment
from parser.core.dedup import check_parser_duplicates
from parser.core.quality import is_junk_for_marketplace
from parser.storage.listing_dedup import active_listing_duplicate

logger = logging.getLogger(__name__)


async def run_ai_screen_and_dedup(
    *,
    source_channel: str,
    message_id: int,
    content_hash: str,
    dedup_key: Optional[str],
    title: str,
    description: str,
    parser_type: str,
    raw_text: str,
    source_city: str,
    category: str,
    subcategory: Optional[str],
    price: Optional[str],
    currency: Optional[str],
    is_free: bool,
    condition: Optional[str],
) -> tuple[bool, str, Optional[str], dict[str, Any]]:
    """
    Повертає (ok, reason, embedding_json, fields_for_insert).
  fields_for_insert може містити оновлені title/description/category/...
    """
    is_dup, dup_reason, embedding_json = check_parser_duplicates(
        source_channel=source_channel,
        message_id=message_id,
        content_hash=content_hash,
        dedup_key=dedup_key,
        title=title,
        description=description,
        parser_type=parser_type,
    )
    if is_dup:
        return False, dup_reason, None, {}

    if active_listing_duplicate(dedup_key, title, description):
        return False, "дублікат (маркетплейс)", None, {}

    junk, junk_reason = is_junk_for_marketplace(
        title, description, raw_text, category, subcategory
    )
    if junk:
        return False, junk_reason, None, {}

    candidate = {
        "raw_text": raw_text,
        "title": title,
        "description": description,
        "category": category,
        "subcategory": subcategory,
        "price": price,
        "currency": currency,
        "is_free": is_free,
        "condition": condition,
        "source_channel": source_channel,
        "source_city": source_city,
        "location": source_city,
    }

    screen = await ai_screen_parsed_listing(candidate)
    if not screen.accept:
        return False, screen.reason or "ai відхилено", None, {}

    fields: dict[str, Any] = {}
    if screen.enrichment:
        enriched = apply_screen_enrichment(candidate, screen.enrichment)
        fields = {
            "title": enriched["title"],
            "description": enriched["description"],
            "category": enriched["category"],
            "subcategory": enriched.get("subcategory"),
            "price": enriched.get("price"),
            "currency": enriched.get("currency"),
            "is_free": enriched.get("is_free"),
            "condition": enriched.get("condition"),
            "location": enriched.get("location"),
        }
        check_title = str(fields.get("title") or title)
        check_desc = str(fields.get("description") or description)
        junk, junk_reason = is_junk_for_marketplace(
            check_title,
            check_desc,
            raw_text,
            str(fields.get("category") or category),
            fields.get("subcategory") or subcategory,
        )
        if junk:
            return False, f"{junk_reason} (ai)", None, {}
        logger.info(
            "AI screen OK %s/%s: %s → %s/%s",
            source_channel,
            message_id,
            title[:40],
            fields.get("category"),
            fields.get("subcategory"),
        )
    else:
        junk, junk_reason = is_junk_for_marketplace(
            title, description, raw_text, category, subcategory
        )
        if junk:
            return False, junk_reason, None, {}

    return True, "", embedding_json, fields
