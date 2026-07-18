"""Парсинг груп/каналів послуг: один раз парсимо → дві окремі модерації (маркетплейс + канал)."""

import asyncio
import logging
import re
from contextlib import asynccontextmanager
from dataclasses import dataclass

from parser.category_keywords import detect_category
from parser.config.channels import (
    BEAUTY_SERVICE_CHANNELS,
    PARSER_TYPE_SERVICES_CHANNEL,
    SERVICE_CHANNELS,
    SERVICES_AI_CHANNELS,
    normalize_channel_key,
)
from parser.config.settings import (
    PARSER_SERVICES_FETCH_LIMIT,
    PARSER_SERVICES_IGNORE_CURSOR,
)
from parser.moderation.approve_routing import notify_chat_for_parsed_item
from parser.core.channel_fetch import iter_new_channel_messages
from parser.core.photos import download_photos
from parser.core.quality import (
    has_too_many_emojis,
    is_likely_not_listing,
    is_likely_service_ad,
    is_quality,
)
from parser.core.telegram_meta import (
    get_sender_id,
    message_link,
    resolve_author_username,
    resolve_pyrogram_chat_target,
)
from parser.core.text import (
    clean_channel_post_text,
    detect_condition,
    enrich_description,
    extract_description,
    extract_title,
    parse_price,
    to_plain_str,
)
from parser.core.parse_pipeline import run_ai_screen_and_dedup
from parser.storage.parsed_items import (
    ensure_parsed_items_table,
    fingerprint_parsed_text,
    fingerprint_title_desc,
    insert_parsed_item,
)

logger = logging.getLogger(__name__)


@dataclass
class ServicesParseRunConfig:
    fetch_limit: int | None = None
    ignore_cursor: bool = False


_default_run_config = ServicesParseRunConfig()
_run_config = _default_run_config


@asynccontextmanager
async def services_parse_run(config: ServicesParseRunConfig | None = None):
    """Тимчасові параметри парсингу (ручна команда /parse_services100)."""
    global _run_config
    prev = _run_config
    _run_config = config or _default_run_config
    try:
        yield
    finally:
        _run_config = prev


def _active_fetch_options() -> tuple[int, bool]:
    if _run_config.fetch_limit is not None:
        return max(1, _run_config.fetch_limit), True
    return PARSER_SERVICES_FETCH_LIMIT, PARSER_SERVICES_IGNORE_CURSOR


async def parse_services_ai_channel(app, channel: str, city: str, notify_callback) -> dict:
    """Парсить одне джерело; на SERVICE_CHANNELS усі пости вважаються послугами."""
    ensure_parsed_items_table()

    stats = {"added": 0, "skipped": 0, "reasons": {}}
    processed_groups: set[str] = set()
    channel_key = normalize_channel_key(channel)
    force_service_channel = channel_key in SERVICE_CHANNELS

    logger.info("Парсимо послуги (AI→канал) %s (місто: %s)", channel, city)

    chat_target = await resolve_pyrogram_chat_target(app, channel)

    fetch_limit, ignore_cursor = _active_fetch_options()
    async for msg in iter_new_channel_messages(
        app,
        chat_target,
        source_channel=channel,
        parser_type=PARSER_TYPE_SERVICES_CHANNEL,
        fetch_limit=fetch_limit,
        ignore_cursor=ignore_cursor,
    ):
        if getattr(msg, "media_group_id", None):
            gid = str(msg.media_group_id)
            if gid in processed_groups:
                continue
            processed_groups.add(gid)
            try:
                group = await msg.get_media_group()
            except Exception:
                group = [msg]
            first_with_cap = next((m for m in group if (m.text or m.caption)), group[0])
            text = to_plain_str(first_with_cap.text or first_with_cap.caption or "")
            photos = [m for m in group if m.photo]
            msg_for_link = msg
            effective_message_id = msg.id
        else:
            text = to_plain_str(msg.text or msg.caption or "")
            photos = [msg] if msg.photo else []
            msg_for_link = msg
            effective_message_id = msg.id

        text = clean_channel_post_text(text, channel)

        content_hash = fingerprint_parsed_text(text)

        pre_category, pre_subcategory = detect_category(text, skip_free=False)
        is_service = (
            force_service_channel
            or pre_category == "services_work"
            or is_likely_service_ad(text)
        )
        if not is_service:
            stats["skipped"] += 1
            stats["reasons"]["не послуга"] = stats["reasons"].get("не послуга", 0) + 1
            continue

        relaxed_quality = force_service_channel or is_service
        ok, reason = is_quality(text, len(photos) > 0, relaxed=relaxed_quality)
        if not ok:
            stats["skipped"] += 1
            stats["reasons"][reason] = stats["reasons"].get(reason, 0) + 1
            continue

        price_str, currency, is_free = parse_price(text)
        title = extract_title(text)
        description = enrich_description(title, extract_description(text, title))

        if not force_service_channel and is_likely_not_listing(title, description):
            stats["skipped"] += 1
            stats["reasons"]["не оголошення"] = stats["reasons"].get("не оголошення", 0) + 1
            continue

        if not force_service_channel and has_too_many_emojis(description):
            stats["skipped"] += 1
            stats["reasons"]["багато емоджі"] = stats["reasons"].get("багато емоджі", 0) + 1
            continue

        dedup_key = fingerprint_title_desc(
            title,
            description,
            price=price_str,
            is_free=is_free,
        )
        category, subcategory = detect_category(
            text, skip_free=(price_str is not None and not is_free)
        )
        if force_service_channel:
            detected_sub = subcategory if category == "services_work" else None
            category = "services_work"
            if channel_key in BEAUTY_SERVICE_CHANNELS:
                subcategory = detected_sub or "beauty_services"
            else:
                subcategory = detected_sub or "other_services"
        else:
            category = "services_work"
            subcategory = subcategory or "other_services"

        condition = detect_condition(text, category)

        ok, skip_reason, embedding_json, ai_fields = await run_ai_screen_and_dedup(
            source_channel=channel,
            message_id=effective_message_id,
            content_hash=content_hash,
            dedup_key=dedup_key,
            title=title,
            description=description,
            parser_type=PARSER_TYPE_SERVICES_CHANNEL,
            raw_text=text[:4000],
            source_city=city,
            category=category,
            subcategory=subcategory,
            price=price_str,
            currency=currency,
            is_free=is_free,
            condition=condition,
        )
        if not ok:
            stats["skipped"] += 1
            stats["reasons"][skip_reason] = stats["reasons"].get(skip_reason, 0) + 1
            continue

        if ai_fields:
            title = ai_fields.get("title", title)
            description = ai_fields.get("description", description)
            category = ai_fields.get("category", category)
            subcategory = ai_fields.get("subcategory", subcategory)
            price_str = ai_fields.get("price", price_str)
            currency = ai_fields.get("currency", currency)
            is_free = bool(ai_fields.get("is_free", is_free))
            condition = ai_fields.get("condition", condition)
            city = ai_fields.get("location", city)

        author_username = resolve_author_username(msg_for_link, text, channel)
        author_id = get_sender_id(msg_for_link)
        media_group_id = getattr(msg, "media_group_id", None)
        if media_group_id:
            media_group_id = str(media_group_id)

        chan_slug = re.sub(r"[^a-z0-9]+", "_", channel.lower()).strip("_")[:24] or "ch"
        base_name = f"{chan_slug}_{effective_message_id}"
        images = await download_photos(app, photos, base_name, max_photos=3)

        item_id = insert_parsed_item(
            source_channel=channel,
            source_city=city,
            message_id=effective_message_id,
            media_group_id=media_group_id,
            author_username=author_username,
            author_id=author_id,
            title=title,
            description=description,
            price=price_str,
            currency=currency,
            is_free=is_free,
            category=category,
            subcategory=subcategory,
            condition=condition,
            location=city,
            images=images,
            raw_text=text[:4000],
            content_hash=content_hash,
            dedup_key=dedup_key,
            parser_type=PARSER_TYPE_SERVICES_CHANNEL,
            text_embedding=embedding_json,
        )

        if item_id:
            base_item_data = {
                "id": item_id,
                "source_channel": channel,
                "source_city": city,
                "message_id": effective_message_id,
                "author_username": author_username,
                "author_id": author_id,
                "title": title,
                "description": description,
                "price": price_str,
                "currency": currency,
                "is_free": is_free,
                "category": category,
                "subcategory": subcategory,
                "condition": condition,
                "location": city,
                "images": images,
                "raw_text": text[:4000],
                "msg_link": message_link(
                    channel,
                    effective_message_id,
                    chat_id=chat_target if isinstance(chat_target, int) else None,
                ),
                "parser_type": PARSER_TYPE_SERVICES_CHANNEL,
            }
            try:
                item_data = {
                    **base_item_data,
                    "moderation_target": "services_both",
                    "notify_chat_id": notify_chat_for_parsed_item(base_item_data),
                }
                await notify_callback(item_data)
                await asyncio.sleep(3)
            except Exception as e:
                logger.error(
                    "Помилка сповіщення модерації (services AI) item %s: %s",
                    item_id,
                    e,
                )

            stats["added"] += 1
            logger.info("  ✅ [services→канал] [%s/%s] %s", channel, effective_message_id, title[:50])
        else:
            stats["skipped"] += 1
            stats["reasons"]["дублікат (бд)"] = stats["reasons"].get("дублікат (бд)", 0) + 1

    return stats


async def run_services_ai_channels(notify_callback) -> dict:
    from parser.core.pyrogram_accounts import run_channels_with_accounts

    if not SERVICES_AI_CHANNELS:
        return {
            "added": 0,
            "skipped": 0,
            "errors": [{"channel": "—", "city": "—", "error": "немає каналів у SERVICES_AI_CHANNELS"}],
            "channels": 0,
        }

    fetch_limit, ignore_cursor = _active_fetch_options()
    total = await run_channels_with_accounts(
        dict(SERVICES_AI_CHANNELS),
        parse_services_ai_channel,
        notify_callback,
        log_prefix="Послуги (AI→канал)",
    )
    total["channels"] = len(SERVICES_AI_CHANNELS)
    if ignore_cursor and fetch_limit:
        total["lookback"] = fetch_limit
    return total
