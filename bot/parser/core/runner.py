"""Парсинг Telegram-каналів та збереження оголошень."""

import asyncio
import logging
import re

from parser.category_keywords import detect_category
from parser.config.channels import (
    BEAUTY_SERVICE_CHANNELS,
    CHANNELS,
    SERVICE_CHANNELS,
    normalize_channel_key,
)
from parser.config.settings import FETCH_LIMIT, SERVICES_MODERATION_CHANNEL_ID
from parser.core.photos import download_photos
from parser.core.quality import (
    has_too_many_emojis,
    is_likely_not_listing,
    is_likely_service_ad,
    is_quality,
)
from parser.core.telegram_meta import get_sender_id, get_sender_username, message_link
from parser.core.text import (
    clean_channel_post_text,
    detect_condition,
    enrich_description,
    extract_description,
    extract_title,
    parse_price,
    to_plain_str,
)
from parser.storage.parsed_items import (
    ensure_parsed_items_table,
    fingerprint_parsed_text,
    fingerprint_title_desc,
    insert_parsed_item,
    parsed_item_exists,
    parsed_item_is_raw_duplicate,
    parsed_item_is_semantic_duplicate,
)

logger = logging.getLogger(__name__)


async def parse_channel(app, channel: str, city: str, notify_callback) -> dict:
    ensure_parsed_items_table()

    stats = {"added": 0, "skipped": 0, "reasons": {}}
    processed_groups: set[str] = set()

    logger.info("Парсимо канал %s (місто: %s), ліміт: %s", channel, city, FETCH_LIMIT)

    async for msg in app.get_chat_history(channel, limit=FETCH_LIMIT):
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

        if parsed_item_exists(channel, effective_message_id):
            stats["skipped"] += 1
            stats["reasons"]["дублікат (бд)"] = stats["reasons"].get("дублікат (бд)", 0) + 1
            continue

        content_hash = fingerprint_parsed_text(text)
        if parsed_item_is_raw_duplicate(content_hash):
            stats["skipped"] += 1
            stats["reasons"]["дублікат (текст)"] = stats["reasons"].get("дублікат (текст)", 0) + 1
            continue

        channel_key = normalize_channel_key(channel)
        pre_category, _ = detect_category(text, skip_free=False)
        relaxed_quality = (
            channel_key in BEAUTY_SERVICE_CHANNELS
            or pre_category == "services_work"
            or is_likely_service_ad(text)
        )

        ok, reason = is_quality(text, len(photos) > 0, relaxed=relaxed_quality)
        if not ok:
            stats["skipped"] += 1
            stats["reasons"][reason] = stats["reasons"].get(reason, 0) + 1
            continue

        price_str, currency, is_free = parse_price(text)
        title = extract_title(text)
        description = enrich_description(title, extract_description(text, title))

        if is_likely_not_listing(title, description):
            stats["skipped"] += 1
            stats["reasons"]["не оголошення"] = stats["reasons"].get("не оголошення", 0) + 1
            continue

        if not relaxed_quality and has_too_many_emojis(description):
            stats["skipped"] += 1
            stats["reasons"]["багато емоджі"] = stats["reasons"].get("багато емоджі", 0) + 1
            continue

        dedup_key = fingerprint_title_desc(title, description)
        if parsed_item_is_semantic_duplicate(dedup_key):
            stats["skipped"] += 1
            stats["reasons"]["дублікат (оголошення)"] = stats["reasons"].get(
                "дублікат (оголошення)", 0
            ) + 1
            continue

        category, subcategory = detect_category(text, skip_free=(price_str is not None and not is_free))
        if channel_key in SERVICE_CHANNELS:
            detected_sub = subcategory if category == "services_work" else None
            category = "services_work"
            if channel_key in BEAUTY_SERVICE_CHANNELS:
                subcategory = detected_sub or "beauty_services"
            else:
                subcategory = detected_sub or "other_services"
        condition = detect_condition(text, category)

        author_username = get_sender_username(msg_for_link)
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
        )

        if item_id:
            item_data = {
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
                "msg_link": message_link(channel, effective_message_id),
                "notify_chat_id": (
                    SERVICES_MODERATION_CHANNEL_ID
                    if category == "services_work"
                    else None
                ),
            }
            try:
                await notify_callback(item_data)
                await asyncio.sleep(3)
            except Exception as e:
                logger.error("Помилка сповіщення адміна для item %s: %s", item_id, e)

            stats["added"] += 1
            logger.info("  ✅ [%s/%s] %s", channel, effective_message_id, title[:50])
        else:
            stats["skipped"] += 1
            stats["reasons"]["дублікат (бд)"] = stats["reasons"].get("дублікат (бд)", 0) + 1

    return stats


async def run_all_channels(app, notify_callback) -> dict:
    total: dict = {"added": 0, "skipped": 0, "errors": []}
    for channel, city in CHANNELS.items():
        try:
            stats = await parse_channel(app, channel, city, notify_callback)
            total["added"] += stats["added"]
            total["skipped"] += stats["skipped"]
            logger.info(
                "Канал %s: +%s нових, пропущено %s",
                channel,
                stats["added"],
                stats["skipped"],
            )
        except Exception as e:
            logger.error("Помилка парсингу каналу %s: %s", channel, e, exc_info=True)
            total["errors"].append({"channel": channel, "city": city, "error": str(e)})
    return total
