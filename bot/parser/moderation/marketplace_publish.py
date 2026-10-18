"""Публікація parsed_item лише на маркетплейс (без Telegram-каналів)."""

from __future__ import annotations

import logging

from parser.core.account_pool import list_parser_accounts
from parser.moderation.formatting import (
    build_final_marketplace_description,
    is_effectively_empty_marketplace_description,
    preserve_parsed_source_fields,
)
from parser.storage.listing_dedup import active_listing_duplicate, resolve_stable_dedup_key
from parser.storage.marketplace import (
    copy_parser_images_to_public,
    create_marketplace_listing,
    get_or_create_bot_user,
)
from parser.storage.parsed_items import (
    parsed_item_image_refs,
    set_marketplace_listing_id,
)

logger = logging.getLogger(__name__)


class MarketplacePublishError(Exception):
    """Не вдалося створити Listing (дублікат або помилка БД)."""


def parser_seller_user_id(*, is_service: bool) -> int:
    pool = list_parser_accounts()
    seller = pool[0] if pool else None
    if is_service and len(pool) > 1:
        seller = pool[1]
    if seller and seller.telegram_id:
        return get_or_create_bot_user(
            seller.telegram_id,
            seller.username or "parser_bot",
            "TradeGround Seller" if is_service else "Parser Bot",
        )
    return get_or_create_bot_user(8590825131, "parser_bot", "Parser Bot")


def publish_parsed_item_marketplace(
    item_id: int,
    listing_item: dict,
    source: dict,
    *,
    moderated_by: int | None = None,
    skip_duplicate_check: bool = False,
) -> tuple[int, str, list[str]]:
    """
    Створює Listing на маркетплейсі.
    Повертає (listing_id, description, images_web).
    """
    existing = source.get("marketplace_listing_id")
    if existing:
        raise MarketplacePublishError("already_listed")

    is_service = (listing_item.get("category") or "").strip().lower() == "services_work"
    images = parsed_item_image_refs(source)
    images_web = copy_parser_images_to_public(images, prefix=f"pi{item_id}")
    publish_ctx = preserve_parsed_source_fields(dict(listing_item), source)
    description = build_final_marketplace_description(publish_ctx)
    if is_effectively_empty_marketplace_description(
        description, publish_ctx.get("title")
    ):
        logger.error(
            "parsed_item %s: порожній опис після збірки (title=%r)",
            item_id,
            publish_ctx.get("title"),
        )
        raise MarketplacePublishError("empty_description")

    dedup_key = resolve_stable_dedup_key(
        source,
        title=str(listing_item.get("title") or ""),
        description=str(listing_item.get("description") or ""),
        price=str(listing_item.get("price") or ""),
        is_free=bool(listing_item.get("is_free")),
    )
    author_id = None
    try:
        if source.get("author_id") not in (None, "", 0, "0"):
            author_id = int(source.get("author_id"))
    except (TypeError, ValueError):
        author_id = None
    exclude_id = 0
    try:
        exclude_id = int(source.get("id") or item_id or 0)
    except (TypeError, ValueError):
        exclude_id = int(item_id or 0)
    if not skip_duplicate_check and active_listing_duplicate(
        dedup_key,
        str(listing_item.get("title") or ""),
        description,
        price=str(listing_item.get("price") or ""),
        is_free=bool(listing_item.get("is_free")),
        author_id=author_id,
        exclude_parsed_id=exclude_id,
    ):
        raise MarketplacePublishError("duplicate")

    try:
        listing_id = create_marketplace_listing(
            user_id=parser_seller_user_id(is_service=is_service),
            title=listing_item["title"],
            description=description,
            price=listing_item.get("price"),
            currency=listing_item.get("currency"),
            is_free=bool(listing_item.get("is_free")),
            category=listing_item.get("category", "other"),
            subcategory=listing_item.get("subcategory"),
            condition=listing_item.get("condition"),
            location=listing_item.get("location", "Germany"),
            images=images_web,
        )
    except Exception as e:
        logger.error(
            "Помилка створення Listing для parsed_item %s: %s",
            item_id,
            e,
            exc_info=True,
        )
        raise MarketplacePublishError("create_failed") from e

    set_marketplace_listing_id(item_id, listing_id, moderated_by=moderated_by)
    if listing_id is None:
        raise MarketplacePublishError("create_failed")
    return int(listing_id), description, images_web
