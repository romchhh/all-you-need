"""Спільна логіка AI-фільтра та дедупу для парсерів."""

from __future__ import annotations

import logging
from typing import Any, Optional

from parser.ai.screen import ai_screen_parsed_listing, apply_screen_enrichment
from parser.core.dedup import check_parser_duplicates
from parser.core.quality import is_junk_for_marketplace
from parser.core.text import format_listing_description, polish_listing_description
from parser.marketplace_categories import (
    clean_title,
    force_services_marketplace_categories,
    should_treat_as_service,
)
from parser.storage.listing_dedup import active_listing_duplicate

logger = logging.getLogger(__name__)


def _finalize_fields(
    *,
    title: str,
    description: str,
    raw_text: str,
    category: str,
    subcategory: Optional[str],
    price: Any,
    currency: Any,
    is_free: Any,
    condition: Any,
    location: Any,
    force_service: bool = False,
) -> dict[str, Any]:
    title = clean_title(title or "", raw_text)
    description = polish_listing_description(
        description or raw_text or "",
        raw_text=raw_text,
        title=title,
        price=str(price) if price is not None else None,
    )

    blob = f"{title}\n{description}\n{raw_text}"
    if force_service or should_treat_as_service(
        blob, force_service_channel=force_service, category=category
    ):
        locked = force_services_marketplace_categories(
            {
                "title": title,
                "description": description,
                "raw_text": raw_text,
                "subcategory": subcategory,
            }
        )
        category = locked["category"]
        subcategory = locked.get("subcategory")
        condition = "new"

    if not price or str(price).strip().lower() in ("", "0", "none", "null"):
        price = "Договорная"
        currency = None
        is_free = False

    return {
        "title": title,
        "description": description,
        "category": category,
        "subcategory": subcategory,
        "price": price,
        "currency": currency,
        "is_free": bool(is_free),
        "condition": condition,
        "location": location,
    }


def finalize_listing_item_for_publish(
    item: dict,
    *,
    force_service: bool = False,
) -> dict[str, Any]:
    """
    Фінальна нормалізація перед Listing / каналом послуг:
    title без ціни/міста, опис відформатований, категорія/стан/ціна для послуг.
    """
    from parser.core.location import resolve_parsed_location
    from parser.marketplace_categories import apply_marketplace_categories_to_item

    out = dict(item)
    raw = str(out.get("raw_text") or "")
    fields = _finalize_fields(
        title=str(out.get("title") or ""),
        description=str(out.get("description") or ""),
        raw_text=raw,
        category=str(out.get("category") or ""),
        subcategory=out.get("subcategory"),
        price=out.get("price"),
        currency=out.get("currency"),
        is_free=out.get("is_free"),
        condition=out.get("condition"),
        location=out.get("location"),
        force_service=force_service,
    )
    out.update(fields)

    if force_service or (out.get("category") or "").strip().lower() == "services_work":
        out = force_services_marketplace_categories(out)
        out["condition"] = "new"
    else:
        out = apply_marketplace_categories_to_item(out)

    out["location"] = resolve_parsed_location(
        channel_city=str(out.get("source_city") or ""),
        source_channel=str(out.get("source_channel") or "") or None,
        suggested=str(out.get("location") or ""),
        text=f"{out.get('title') or ''}\n{out.get('description') or ''}\n{raw}",
    )
    return out


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
    force_service: bool = False,
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

    if screen.enrichment:
        enriched = apply_screen_enrichment(candidate, screen.enrichment)
        fields = _finalize_fields(
            title=str(enriched.get("title") or title),
            description=str(enriched.get("description") or description),
            raw_text=raw_text,
            category=str(enriched.get("category") or category),
            subcategory=enriched.get("subcategory") or subcategory,
            price=enriched.get("price", price),
            currency=enriched.get("currency", currency),
            is_free=enriched.get("is_free", is_free),
            condition=enriched.get("condition", condition),
            location=enriched.get("location"),
            force_service=force_service,
        )
    else:
        fields = _finalize_fields(
            title=title,
            description=description,
            raw_text=raw_text,
            category=category,
            subcategory=subcategory,
            price=price,
            currency=currency,
            is_free=is_free,
            condition=condition,
            location=source_city,
            force_service=force_service,
        )

    check_title = str(fields.get("title") or "").strip()
    if not check_title or len(check_title) < 4 or check_title.lower() in {
        "объявление",
        "оголошення",
        "listing",
    }:
        return False, "поганий заголовок", None, {}

    junk, junk_reason = is_junk_for_marketplace(
        check_title,
        str(fields.get("description") or description),
        raw_text,
        str(fields.get("category") or category),
        fields.get("subcategory") or subcategory,
    )
    if junk:
        return False, f"{junk_reason} (ai)", None, {}

    fields["title"] = check_title
    logger.info(
        "AI screen OK %s/%s: %s → %s/%s",
        source_channel,
        message_id,
        check_title[:40],
        fields.get("category"),
        fields.get("subcategory"),
    )
    return True, "", embedding_json, fields
