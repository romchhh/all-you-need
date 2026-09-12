"""
Автопідтвердження parsed_items на маркетплейс (real-time після parse).

Товари → лише маркетплейс. Послуги → маркетплейс + Telegram-канал (Hamburg/Germany).
Дублікати на МП прибирає окремий job (marketplace_dedup_cleanup).
"""

from __future__ import annotations

import asyncio
import logging
from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Optional
from zoneinfo import ZoneInfo

from aiogram import Bot

from parser.config.settings import (
    PARSER_AUTO_APPROVE_BATCH,
    PARSER_AUTO_APPROVE_DAILY_LIMIT,
    PARSER_AUTO_APPROVE_ENABLED,
    PARSER_AUTO_APPROVE_INTERVAL_MIN,
    PARSER_AUTO_APPROVE_MANUAL_DRAIN_ROUNDS,
    PARSER_AUTO_APPROVE_MAX_AGE_HOURS,
    PARSER_AUTO_APPROVE_MAX_PER_CATEGORY,
    PARSER_AUTO_APPROVE_MAX_PER_CHANNEL,
    PARSER_AUTO_APPROVE_SERVICES_CHANNEL,
    PARSER_AUTO_APPROVE_WAVE_MINUTES,
)
from parser.core.parse_pipeline import (
    ensure_parsed_item_ai_screened,
    finalize_listing_item_for_publish,
)
from parser.core.patterns import GENERIC_LISTING_TITLE_RE
from parser.core.quality import (
    has_listing_offer_signal,
    is_junk_for_marketplace,
    parsed_item_needs_ai_screen,
)
from parser.marketplace_categories import (
    MARKETPLACE_TAXONOMY,
    apply_marketplace_categories_to_item,
    force_services_marketplace_categories,
)
from parser.moderation.approve_routing import notify_chat_for_parsed_item
from parser.moderation.formatting import preserve_parsed_source_fields
from parser.moderation.marketplace_publish import (
    MarketplacePublishError,
    publish_parsed_item_marketplace,
)
from parser.storage.listing_dedup import active_listing_duplicate
from parser.storage.parsed_items import (
    count_auto_approve_in_flight,
    ensure_parsed_items_table,
    fingerprint_title_desc,
    get_parsed_item_by_id,
    hydrate_parsed_item,
    list_auto_approved_since,
    list_pending_for_auto_approve,
    mark_auto_approved,
    parsed_item_image_refs,
    reset_stale_auto_approve_claims,
    try_claim_auto_approve,
    unclaim_auto_approve,
    update_mod_path_status,
)

logger = logging.getLogger(__name__)

_LOCK = asyncio.Lock()
_KYIV_TZ = ZoneInfo("Europe/Kyiv")

_STUB_TITLES = frozenset({
    "объявление",
    "оголошення",
    "listing",
    "товар",
    "послуга",
    "услуга",
    "мої вітання",
    "мое приветствие",
})


def _kyiv_day_start_utc() -> datetime:
    now = datetime.now(_KYIV_TZ)
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    return start.astimezone(timezone.utc)


def _parse_moderated_at(raw: Optional[str]) -> Optional[datetime]:
    if not raw:
        return None
    text = str(raw).strip()
    if not text:
        return None
    try:
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        dt = datetime.fromisoformat(text)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except ValueError:
        try:
            dt = datetime.strptime(text[:19], "%Y-%m-%d %H:%M:%S")
            return dt.replace(tzinfo=timezone.utc)
        except ValueError:
            return None


def _today_counts() -> dict[str, Counter]:
    start = _kyiv_day_start_utc()
    rows = list_auto_approved_since((start - timedelta(hours=6)).isoformat())
    channel: Counter = Counter()
    category: Counter = Counter()
    group: Counter = Counter()
    total = 0
    for row in rows:
        dt = _parse_moderated_at(row.get("moderated_at"))
        if dt is None or dt < start:
            continue
        total += 1
        ch = str(row.get("source_channel") or "").strip().lower()
        cat = str(row.get("category") or "other").strip().lower()
        try:
            gid = int(row.get("moderation_chat_id") or 0)
        except (TypeError, ValueError):
            gid = 0
        if ch:
            channel[ch] += 1
        if cat:
            category[cat] += 1
        if gid:
            group[gid] += 1
    return {
        "total": Counter({"_": total}),
        "channel": channel,
        "category": category,
        "group": group,
    }


def remaining_auto_approve_slots() -> int:
    ensure_parsed_items_table()
    counts = _today_counts()
    in_flight = count_auto_approve_in_flight()
    # Активні claim не повинні блокувати весь денний ліміт (завислі скидає drain).
    used = int(counts["total"].get("_", 0)) + min(in_flight, 5)
    return max(0, PARSER_AUTO_APPROVE_DAILY_LIMIT - used)


def _recent_auto_approved_count(minutes: int | None = None) -> int:
    """Скільки автопідтверджень за останні N хвилин (анти-флуд)."""
    ensure_parsed_items_table()
    window = max(5, int(minutes or PARSER_AUTO_APPROVE_WAVE_MINUTES))
    since = datetime.now(timezone.utc) - timedelta(minutes=window)
    rows = list_auto_approved_since(since.isoformat())
    n = 0
    for row in rows:
        dt = _parse_moderated_at(row.get("moderated_at"))
        if dt is not None and dt >= since:
            n += 1
    return n


def _ensure_auto_approve_unblocked(*, reset_claims: bool = False) -> None:
    """Скинути завислі claim і залогувати, якщо ліміти вичерпані."""
    ensure_parsed_items_table()
    if reset_claims:
        reset = reset_stale_auto_approve_claims()
        if reset:
            logger.warning("auto-approve: скинуто %s завислих claim", reset)
    in_flight = count_auto_approve_in_flight()
    if in_flight:
        logger.warning("auto-approve: %s claim у процесі", in_flight)
    daily_left = remaining_auto_approve_slots()
    wave_left = remaining_auto_approve_wave_slots()
    if daily_left <= 0:
        logger.info("auto-approve: денний ліміт вичерпано (%s/день)", PARSER_AUTO_APPROVE_DAILY_LIMIT)
    elif wave_left <= 0 and daily_left > 0:
        logger.info(
            "auto-approve: хвиля %s хв заповнена (%s за вікно, batch=%s)",
            PARSER_AUTO_APPROVE_WAVE_MINUTES,
            _recent_auto_approved_count(),
            PARSER_AUTO_APPROVE_BATCH,
        )


def remaining_auto_approve_wave_slots(*, aggressive: bool = False) -> int:
    daily = remaining_auto_approve_slots()
    if aggressive:
        return daily
    return max(
        0,
        min(daily, PARSER_AUTO_APPROVE_BATCH - _recent_auto_approved_count()),
    )


def _mod_group_id(item: dict) -> int:
    try:
        if item.get("notify_chat_id") not in (None, "", 0):
            return int(item["notify_chat_id"])
    except (TypeError, ValueError):
        pass
    try:
        if item.get("moderation_chat_id") not in (None, "", 0):
            return int(item["moderation_chat_id"])
    except (TypeError, ValueError):
        pass
    return int(notify_chat_for_parsed_item(item))


def _is_service_item(item: dict) -> bool:
    if (item.get("category") or "").strip().lower() == "services_work":
        return True
    return (item.get("parser_type") or "") == "services_channel"


def is_auto_approve_eligible(item: dict, *, aggressive: bool = False) -> tuple[bool, str]:
    if not item:
        return False, "empty"
    if item.get("marketplace_listing_id"):
        return False, "already_listed"
    if (item.get("status") or "pending").strip().lower() != "pending":
        return False, "not_pending"

    title = str(item.get("title") or "").strip()
    description = str(item.get("description") or "").strip()
    raw_text = str(item.get("raw_text") or "")
    category = str(item.get("category") or "").strip().lower()
    subcategory = item.get("subcategory")

    min_title_len = 4 if aggressive else 5
    if not title or len(title) < min_title_len or title.lower() in _STUB_TITLES:
        return False, "bad_title"
    if not aggressive and GENERIC_LISTING_TITLE_RE.match(title):
        return False, "generic_title"
    if category not in MARKETPLACE_TAXONOMY:
        return False, "bad_category"

    # Після /parse в aggressive-режимі повторно не фільтруємо — parse вже відсіяв сміття.
    if not aggressive:
        junk, reason = is_junk_for_marketplace(
            title,
            description,
            raw_text,
            category,
            subcategory,
            require_offer=True,
        )
        if junk:
            return False, reason or "junk"

        blob = f"{title}\n{description}\n{raw_text}"
        if not has_listing_offer_signal(blob):
            return False, "no_offer"

        images = parsed_item_image_refs(item)
        if not _is_service_item(item) and not images:
            if len(blob.strip()) < 28:
                return False, "no_photos"

        dedup_key = fingerprint_title_desc(
            title,
            description,
            price=str(item.get("price") or ""),
            is_free=bool(item.get("is_free")),
        )
        try:
            if active_listing_duplicate(dedup_key, title, description):
                return False, "duplicate"
        except Exception as e:
            logger.warning("auto-approve dedup check failed: %s", e)
            return False, "dedup_error"

        from parser.ai.screen import is_ai_screen_enabled

        if parsed_item_needs_ai_screen(item) and not is_ai_screen_enabled():
            return False, "needs_ai"

    return True, ""


def explain_manual_review(item: dict, *, aggressive: bool = False) -> str:
    """Коротка причина, чому оголошення не автопублікувалось одразу."""
    if not PARSER_AUTO_APPROVE_ENABLED:
        return "auto_approve_disabled"
    if not aggressive and remaining_auto_approve_wave_slots() <= 0:
        return "wave_limit_or_daily_cap"
    if not aggressive and not _under_soft_caps(hydrate_parsed_item(item), _today_counts()):
        return "diversity_cap"
    ok, reason = is_auto_approve_eligible(hydrate_parsed_item(item), aggressive=aggressive)
    if not ok:
        return reason or "not_eligible"
    return "prepare_failed"


def _under_soft_caps(item: dict, counts: dict[str, Counter]) -> bool:
    ch = str(item.get("source_channel") or "").strip().lower()
    cat = str(item.get("category") or "other").strip().lower()
    gid = _mod_group_id(item)
    if ch and counts["channel"][ch] >= PARSER_AUTO_APPROVE_MAX_PER_CHANNEL:
        return False
    if cat and counts["category"][cat] >= PARSER_AUTO_APPROVE_MAX_PER_CATEGORY:
        return False
    max_per_group = max(20, PARSER_AUTO_APPROVE_DAILY_LIMIT // 2)
    if gid and counts["group"][gid] >= max_per_group:
        return False
    return True


def _diversity_score(item: dict, counts: dict[str, Counter]) -> tuple:
    ch = str(item.get("source_channel") or "").strip().lower()
    cat = str(item.get("category") or "other").strip().lower()
    gid = _mod_group_id(item)
    photos = 1 if parsed_item_image_refs(item) else 0
    created = str(item.get("created_at") or "")
    return (
        counts["group"][gid],
        counts["channel"][ch],
        counts["category"][cat],
        0 if photos else 1,
        created,
        int(item.get("id") or 0),
    )


def pick_auto_approve_batch(
    candidates: list[dict],
    *,
    slots: int,
    enforce_soft_caps: bool,
) -> list[dict]:
    if slots <= 0 or not candidates:
        return []

    ensure_parsed_items_table()
    counts = _today_counts()
    remaining = list(candidates)
    selected: list[dict] = []
    seen: set[int] = set()

    def _take(pool: list[dict], require_caps: bool) -> Optional[dict]:
        ranked = sorted(pool, key=lambda it: _diversity_score(it, counts))
        for item in ranked:
            item_id = int(item.get("id") or 0)
            if not item_id or item_id in seen:
                continue
            if require_caps and not _under_soft_caps(item, counts):
                continue
            return item
        return None

    while slots > 0 and remaining:
        picked = _take(remaining, require_caps=enforce_soft_caps)
        if picked is None and not enforce_soft_caps:
            picked = _take(remaining, require_caps=False)
        if picked is None:
            break
        selected.append(picked)
        seen.add(int(picked["id"]))
        remaining = [x for x in remaining if int(x.get("id") or 0) not in seen]
        slots -= 1
        ch = str(picked.get("source_channel") or "").strip().lower()
        cat = str(picked.get("category") or "other").strip().lower()
        gid = _mod_group_id(picked)
        counts["total"]["_"] += 1
        if ch:
            counts["channel"][ch] += 1
        if cat:
            counts["category"][cat] += 1
        if gid:
            counts["group"][gid] += 1

    return selected


async def _prepare_listing(item: dict) -> Optional[dict]:
    from parser.ai.screen import is_ai_screen_enabled
    from parser.core.location import resolve_parsed_location

    force_service = _is_service_item(item)
    try:
        working = dict(item)
        # Як у ручному approve: завжди AI enrich перед публікацією (не лише needs_ai_screen).
        if is_ai_screen_enabled():
            try:
                working = await ensure_parsed_item_ai_screened(dict(item))
            except RuntimeError as e:
                logger.info(
                    "auto-approve parsed_item %s: AI enrich failed, fallback to parser fields: %s",
                    item.get("id"),
                    e,
                )
        listing_item = preserve_parsed_source_fields(working, item)
        listing_item = finalize_listing_item_for_publish(
            listing_item,
            force_service=force_service or _is_service_item(listing_item),
        )
        listing_item["location"] = resolve_parsed_location(
            channel_city=str(listing_item.get("source_city") or ""),
            source_channel=str(listing_item.get("source_channel") or "") or None,
            suggested=str(listing_item.get("location") or ""),
            text=(
                f"{listing_item.get('title') or ''}\n"
                f"{listing_item.get('description') or ''}\n"
                f"{listing_item.get('raw_text') or ''}"
            ),
        )
        if force_service or _is_service_item(listing_item):
            listing_item = force_services_marketplace_categories(listing_item)
            listing_item["condition"] = "new"
        else:
            listing_item = apply_marketplace_categories_to_item(listing_item)
        return listing_item
    except RuntimeError as e:
        logger.info("auto-approve skip parsed_item %s: AI %s", item.get("id"), e)
        return None
    except Exception:
        logger.exception("auto-approve prepare failed parsed_item %s", item.get("id"))
        return None


async def _publish_and_notify(
    bot: Bot,
    item: dict,
    listing_item: dict,
    *,
    aggressive: bool = False,
) -> bool:
    from parser.notify.admin import notify_auto_approved_marketplace
    from utils.city_digest_notify import enqueue_city_digest_listing
    from parser.moderation.author_notify import schedule_author_notify

    item_id = int(item["id"])
    try:
        listing_id, description, images_web = publish_parsed_item_marketplace(
            item_id,
            listing_item,
            item,
            moderated_by=None,
            skip_duplicate_check=aggressive,
        )
    except MarketplacePublishError as e:
        logger.info("auto-approve publish skip parsed_item %s: %s", item_id, e)
        return False

    mark_auto_approved(item_id)
    fresh = get_parsed_item_by_id(item_id)
    if fresh:
        item = hydrate_parsed_item({**item, **fresh})
    item["marketplace_listing_id"] = listing_id
    item["auto_approved"] = 1

    channel_published: list[int] = []
    if PARSER_AUTO_APPROVE_SERVICES_CHANNEL and _is_service_item(listing_item):
        try:
            from parser.moderation.services_publish import (
                format_services_channels_labels,
                publish_services_listing_to_channel,
                resolve_services_trade_channel_ids,
            )

            force_ids = resolve_services_trade_channel_ids(listing_item)
            channel_published = await publish_services_listing_to_channel(
                bot,
                listing_item,
                item_id,
                description,
                images_web,
                marketplace_listing_id=listing_id,
                force_channel_ids=force_ids,
            )
            if channel_published:
                update_mod_path_status(item_id, "channel", "approved", moderated_by=None)
                logger.info(
                    "🤖 auto-approve channel: parsed_item %s → %s",
                    item_id,
                    format_services_channels_labels(channel_published),
                )
            else:
                logger.warning(
                    "🤖 auto-approve: канал не опубліковано для parsed_item %s (targets=%s)",
                    item_id,
                    force_ids,
                )
        except Exception:
            logger.exception(
                "auto-approve channel publish failed parsed_item %s", item_id
            )

    try:
        enqueue_city_digest_listing(listing_id)
    except Exception as notify_err:
        logger.warning(
            "auto-approve city-digest Listing %s: %s", listing_id, notify_err
        )

    schedule_author_notify(
        listing_item,
        listing_id,
        use_services_sender=_is_service_item(listing_item),
        channel_only=False,
    )

    try:
        await notify_auto_approved_marketplace(
            bot,
            item,
            listing_id,
            listing_item,
            channel_chat_ids=channel_published,
        )
    except Exception:
        logger.exception(
            "auto-approve notify failed parsed_item %s listing %s",
            item_id,
            listing_id,
        )

    logger.info(
        "🤖 auto-approve parsed_item %s → Listing %s (%s / %s, channels=%s)",
        item_id,
        listing_id,
        listing_item.get("category"),
        item.get("source_channel"),
        channel_published,
    )
    _schedule_home_activity_revalidate()
    return True


def _schedule_home_activity_revalidate() -> None:
    """Фоново оновити кеш «+N сьогодні / по містах» на вебі."""
    try:
        from parser.notify.home_activity import schedule_home_activity_revalidate

        schedule_home_activity_revalidate()
    except Exception:
        logger.debug("home-activity revalidate schedule skipped", exc_info=True)


async def _auto_approve_one(bot: Bot, item: dict, *, aggressive: bool = False) -> bool:
    item = hydrate_parsed_item(item)
    item_id = int(item.get("id") or 0)
    if not item_id:
        return False
    if remaining_auto_approve_wave_slots(aggressive=aggressive) <= 0:
        return False

    ok, reason = is_auto_approve_eligible(item, aggressive=aggressive)
    if not ok:
        logger.info("auto-approve ineligible %s: %s", item_id, reason)
        return False

    if not try_claim_auto_approve(item_id):
        return False

    try:
        listing_item = await _prepare_listing(item)
        if not listing_item:
            return False
        if not aggressive:
            check = dict(item)
            check.update({
                "title": listing_item.get("title"),
                "description": listing_item.get("description"),
                "category": listing_item.get("category"),
                "subcategory": listing_item.get("subcategory"),
                "price": listing_item.get("price"),
                "is_free": listing_item.get("is_free"),
                "status": "pending",
            })
            ok, reason = is_auto_approve_eligible(check, aggressive=False)
            if not ok:
                logger.info(
                    "auto-approve skip after prepare %s: %s", item_id, reason
                )
                return False
        published = await _publish_and_notify(
            bot, item, listing_item, aggressive=aggressive
        )
        if published:
            return True
        return False
    finally:
        fresh = get_parsed_item_by_id(item_id)
        if fresh and int(fresh.get("auto_approved") or 0) == 2:
            unclaim_auto_approve(item_id)


async def maybe_auto_approve_and_notify(
    bot: Bot,
    item_data: dict,
    *,
    aggressive: bool = False,
) -> bool:
    """
    Parse-time: одразу після insert — автопублікація (real-time).
    True — картку pending у групу модерації слати не треба.
    """
    if not PARSER_AUTO_APPROVE_ENABLED:
        return False
    _ensure_auto_approve_unblocked(reset_claims=False)
    if remaining_auto_approve_wave_slots(aggressive=aggressive) <= 0:
        return False
    item = hydrate_parsed_item(item_data)
    if not aggressive and not _under_soft_caps(item, _today_counts()):
        return False
    ok, reason = is_auto_approve_eligible(item, aggressive=aggressive)
    if not ok:
        logger.info(
            "auto-approve skip parsed_item %s at parse-time: %s",
            item.get("id"),
            reason,
        )
        return False
    return await _auto_approve_one(bot, item, aggressive=aggressive)


async def run_auto_approve_drain(
    bot: Bot | None = None,
    *,
    aggressive: bool = False,
    min_total_approved: int = 0,
    already_approved: int = 0,
) -> dict:
    """Добирає різноманітну пачку з pending до денного ліміту (або min_total_approved)."""
    stats: dict = {
        "approved": 0,
        "skipped": 0,
        "slots": 0,
        "rounds": 0,
        "skip_reasons": {},
    }
    if not PARSER_AUTO_APPROVE_ENABLED:
        return stats

    goal = max(0, int(min_total_approved) - int(already_approved))
    skip_reasons: Counter = Counter()
    tried_ids: set[int] = set()

    _ensure_auto_approve_unblocked(reset_claims=True)

    close_bot = False
    if bot is None:
        import os

        token = os.getenv("TOKEN", "")
        if not token:
            logger.warning("auto-approve drain: немає TOKEN")
            return stats
        bot = Bot(token=token)
        close_bot = True

    try:
        from parser.notify.admin import SEND_DELAY_SEC

        max_rounds = PARSER_AUTO_APPROVE_MANUAL_DRAIN_ROUNDS if aggressive else 1
        for _round in range(max_rounds):
            if remaining_auto_approve_wave_slots(aggressive=aggressive) <= 0:
                break
            if goal > 0 and stats["approved"] >= goal:
                break

            pending = list_pending_for_auto_approve(
                PARSER_AUTO_APPROVE_MAX_AGE_HOURS,
                limit=1200 if aggressive else 800,
            )
            eligible: list[dict] = []
            round_skip: Counter = Counter()
            for item in pending:
                item_id = int(item.get("id") or 0)
                if item_id and item_id in tried_ids:
                    continue
                ok, reason = is_auto_approve_eligible(item, aggressive=aggressive)
                if ok:
                    eligible.append(item)
                else:
                    stats["skipped"] += 1
                    if reason:
                        round_skip[reason] += 1
                        skip_reasons[reason] += 1

            if round_skip and not eligible:
                top = round_skip.most_common(5)
                logger.info(
                    "auto-approve drain: 0 eligible з %s pending (top: %s)",
                    len(pending),
                    ", ".join(f"{k}={v}" for k, v in top),
                )

            async with _LOCK:
                slots = remaining_auto_approve_wave_slots(aggressive=aggressive)
                stats["slots"] = max(stats["slots"], slots)
                if slots <= 0:
                    break
                if goal > 0:
                    slots = min(slots, goal - stats["approved"])
                if slots <= 0:
                    break
                batch = pick_auto_approve_batch(
                    eligible,
                    slots=slots,
                    enforce_soft_caps=not aggressive,
                )
                leftover = slots - len(batch)
                if leftover > 0:
                    taken_ids = {int(x["id"]) for x in batch}
                    extra = pick_auto_approve_batch(
                        [x for x in eligible if int(x["id"]) not in taken_ids],
                        slots=leftover,
                        enforce_soft_caps=False,
                    )
                    batch.extend(extra)

            if not batch:
                break

            stats["rounds"] += 1
            round_approved = 0
            for item in batch:
                item_id = int(item.get("id") or 0)
                if item_id:
                    tried_ids.add(item_id)
                if remaining_auto_approve_wave_slots(aggressive=aggressive) <= 0:
                    break
                if goal > 0 and stats["approved"] >= goal:
                    break
                if await _auto_approve_one(bot, item, aggressive=aggressive):
                    stats["approved"] += 1
                    round_approved += 1
                    await asyncio.sleep(SEND_DELAY_SEC)
                else:
                    stats["skipped"] += 1

            if round_approved == 0:
                next_eligible = [
                    it
                    for it in pending
                    if int(it.get("id") or 0) not in tried_ids
                    and is_auto_approve_eligible(it, aggressive=aggressive)[0]
                ]
                if not next_eligible:
                    break

            if goal > 0 and stats["approved"] >= goal:
                break

        stats["skip_reasons"] = dict(skip_reasons.most_common(8))
        if skip_reasons and stats["approved"] < max(1, goal):
            top = skip_reasons.most_common(5)
            logger.info(
                "auto-approve drain skip reasons (approved=%s goal=%s): %s",
                stats["approved"],
                goal,
                ", ".join(f"{k}={v}" for k, v in top),
            )

        if stats["approved"]:
            logger.info(
                "🤖 auto-approve drain: +%s (ліміт %s/день, залишок %s, rounds=%s)",
                stats["approved"],
                PARSER_AUTO_APPROVE_DAILY_LIMIT,
                remaining_auto_approve_slots(),
                stats["rounds"],
            )
            _schedule_home_activity_revalidate()
        return stats
    finally:
        if close_bot:
            await bot.session.close()


def register_auto_approve_job(scheduler) -> None:
    if not PARSER_AUTO_APPROVE_ENABLED:
        logger.info("auto-approve вимкнено (tuning.py: PARSER_AUTO_APPROVE_ENABLED=False)")
        return

    try:
        from parser.storage.connection import ensure_parser_storage

        ensure_parser_storage()
        n = reset_stale_auto_approve_claims()
        if n:
            logger.info("auto-approve: скинуто %s завислих claim", n)
    except Exception:
        logger.warning("auto-approve: не вдалося скинути stale claims", exc_info=True)

    async def _job():
        try:
            from main import bot as main_bot

            await run_auto_approve_drain(main_bot)
        except Exception:
            logger.exception("auto-approve drain job failed")

    scheduler.add_job(
        _job,
        trigger="interval",
        minutes=PARSER_AUTO_APPROVE_INTERVAL_MIN,
        id="parser_auto_approve_drain",
        replace_existing=True,
        misfire_grace_time=max(60, int(PARSER_AUTO_APPROVE_INTERVAL_MIN * 60)),
        max_instances=1,
    )
    logger.info(
        "✅ Auto-approve drain зареєстровано (%s/день, кожні %s хв)",
        PARSER_AUTO_APPROVE_DAILY_LIMIT,
        PARSER_AUTO_APPROVE_INTERVAL_MIN,
    )
