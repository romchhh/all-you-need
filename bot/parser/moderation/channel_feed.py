"""
Стрічка каналів TradeGround: раз на 10 хвилин одне якісне оголошення на канал.

Джерело — активні Listing на маркетплейсі (не окремий парсер-черга).
Лише категорія services_work і підкатегорії послуг (без вакансій/роботи/нерухомості/заходів/товарів).
Лише оголошення не старші за 2 дні (publishedAt / createdAt).

Hamburg — лише Гамбург і онлайн-послуги.
Germany — усі міста; міста й підкатегорії послуг чергуються.
Той самий listing у той самий канал не раніше ніж через 21 день.
"""

from __future__ import annotations

import json
import logging
import os

from parser.moderation.channel_feed_select import (
    FeedCandidate,
    city_key_for,
    classify_bucket,
    eligible_for_hamburg,
    is_feed_quality,
    is_online_service,
    normalize_title_key,
    pick_next,
)
from parser.moderation.channel_feed_store import (
    fetch_feed_rows,
    load_rotation,
    remember_channel_publish,
    remember_many,
    recent_title_keys,
    save_rotation,
)
from parser.moderation.services_publish import (
    TRADE_SERVICES_CHANNEL_GERMANY_ID,
    TRADE_SERVICES_CHANNEL_HAMBURG_ID,
    marketplace_listing_to_channel_item,
    publish_services_listing_to_channel,
    services_channel_quiet_hours_active,
)

logger = logging.getLogger(__name__)

FEED_INTERVAL_MIN = 10

def _marketplace_cover_path(row, listing_id: int) -> str:
    """Тематична обкладинка маркетплейсу для каналу (Hamburg / Germany)."""
    from parser.moderation.services_publish import _resolve_services_channel_cover_path

    item = {
        "title": _row_get(row, "title"),
        "description": _row_get(row, "description"),
        "category": _row_get(row, "category"),
        "subcategory": _row_get(row, "subcategory"),
    }
    path = _resolve_services_channel_cover_path(
        item,
        listing_id=listing_id,
        marketplace_listing_id=listing_id,
        marketplace_description=str(_row_get(row, "description") or ""),
    )
    if path:
        return path
    return "/images/channel_covers/services.png"

_CHANNELS = (
    ("hamburg", TRADE_SERVICES_CHANNEL_HAMBURG_ID),
    ("germany", TRADE_SERVICES_CHANNEL_GERMANY_ID),
)


def channel_key_for_chat(chat_id: int) -> str | None:
    if int(chat_id) == int(TRADE_SERVICES_CHANNEL_HAMBURG_ID):
        return "hamburg"
    if int(chat_id) == int(TRADE_SERVICES_CHANNEL_GERMANY_ID):
        return "germany"
    return None


def listing_image_paths(raw) -> list[str]:
    if raw is None:
        return []
    data = raw
    if isinstance(raw, str):
        text = raw.strip()
        if not text:
            return []
        if text.startswith("[") or text.startswith("{"):
            try:
                data = json.loads(text)
            except json.JSONDecodeError:
                return [text]
        else:
            return [text]
    if isinstance(data, str):
        return [data] if data.strip() else []
    if not isinstance(data, list):
        return []
    out: list[str] = []
    for item in data:
        if isinstance(item, str) and item.strip():
            out.append(item.strip())
    return out


def _row_get(row: dict, *names: str):
    for name in names:
        if name in row and row[name] is not None:
            return row[name]
    return None


def _candidates_for_channel(
    channel_key: str,
    rows: list[dict],
    blocked_titles: set[str],
) -> tuple[list[FeedCandidate], dict[int, dict], list[tuple[int, str]]]:
    chosen: list[FeedCandidate] = []
    by_id: dict[int, dict] = {}
    rejected: list[tuple[int, str]] = []
    for row in rows:
        title = str(_row_get(row, "title") or "")
        description = str(_row_get(row, "description") or "")
        location = str(_row_get(row, "location") or "")
        category = str(_row_get(row, "category") or "")
        subcategory = _row_get(row, "subcategory")
        subcategory_s = str(subcategory or "")
        listing_id = int(row["id"])
        bucket = classify_bucket(category, subcategory_s, title, description)
        online = is_online_service(title, description, location, subcategory_s)
        hamburg_ok = channel_key != "hamburg" or eligible_for_hamburg(
            title=title,
            description=description,
            location=location,
            subcategory=subcategory_s,
        )
        title_key = normalize_title_key(title)
        if (
            not bucket
            or not is_feed_quality(title, description, bucket=bucket)
            or not hamburg_ok
            or not title_key
            or title_key in blocked_titles
        ):
            rejected.append((listing_id, title))
            continue
        candidate = FeedCandidate(
            id=listing_id,
            bucket=bucket,
            city_key=city_key_for(location, online=online),
            title_key=title_key,
        )
        chosen.append(candidate)
        by_id[listing_id] = row
    return chosen, by_id, rejected


def _as_bool(value) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    return str(value or "").strip().lower() in {"1", "true", "t", "yes"}


async def _publish_one(bot, channel_key: str, chat_id: int) -> None:
    blocked_titles = recent_title_keys(channel_key)
    last_bucket, last_city = load_rotation(channel_key)
    picked = None
    by_id: dict[int, dict] = {}
    # Кілька проходів: непридатні рядки позначаємо skipped, інакше вони
    # назавжди займають вікно з 400 найстаріших і глушать канал.
    for _page in range(5):
        rows = fetch_feed_rows(channel_key)
        if not rows:
            break
        candidates, by_id, rejected = _candidates_for_channel(
            channel_key, rows, blocked_titles
        )
        if rejected:
            remember_many(
                channel_key,
                [(listing_id, title, None, None, "skipped") for listing_id, title in rejected],
            )
        picked = pick_next(
            candidates,
            last_bucket=last_bucket,
            last_city=last_city,
            blocked_ids=set(),
            blocked_titles=set(),
        )
        if picked is not None:
            break
    if picked is None:
        logger.info("channel feed %s: немає нового якісного оголошення", channel_key)
        return

    row = by_id[picked.id]
    title = str(_row_get(row, "title") or "")
    description = str(_row_get(row, "description") or "")
    cover = _marketplace_cover_path(row, picked.id)
    photo = [cover]

    item = marketplace_listing_to_channel_item(
        row,
        is_free=_as_bool(_row_get(row, "isFree", "isfree")),
    )

    result = await publish_services_listing_to_channel(
        bot,
        item,
        picked.id,
        description,
        photo,
        marketplace_listing_id=picked.id,
        force_channel_ids=[chat_id],
    )
    if chat_id not in result.chat_ids:
        remember_channel_publish(
            listing_id=picked.id,
            channel_key=channel_key,
            title=title,
            bucket=picked.bucket,
            city_key=picked.city_key,
            status="failed",
        )
        logger.info(
            "channel feed %s: listing %s не опубліковано, пропуск на 6 год",
            channel_key,
            picked.id,
        )
        return

    save_rotation(
        channel_key,
        bucket=picked.bucket,
        city_key=picked.city_key,
        listing_id=picked.id,
    )
    logger.info(
        "channel feed %s: listing %s (%s, %s)",
        channel_key,
        picked.id,
        picked.bucket,
        picked.city_key,
    )


async def publish_channel_feed_tick(bot) -> None:
    if services_channel_quiet_hours_active():
        logger.info("channel feed: тихі години, публікацію пропущено")
        return
    for channel_key, chat_id in _CHANNELS:
        try:
            await _publish_one(bot, channel_key, chat_id)
        except Exception:
            logger.exception("channel feed %s: помилка тіка", channel_key)


def register_channel_feed_job(scheduler) -> None:
    raw = (os.getenv("CHANNEL_FEED_ENABLED") or "1").strip().lower()
    if raw in {"0", "false", "no", "off"}:
        logger.info("channel feed вимкнено (CHANNEL_FEED_ENABLED)")
        return

    async def _job() -> None:
        from main import bot as main_bot

        await publish_channel_feed_tick(main_bot)

    scheduler.add_job(
        _job,
        trigger="interval",
        minutes=FEED_INTERVAL_MIN,
        id="channel_feed",
        replace_existing=True,
        max_instances=1,
        misfire_grace_time=120,
    )
    logger.info("channel feed: кожні %s хв у Hamburg і Germany", FEED_INTERVAL_MIN)
