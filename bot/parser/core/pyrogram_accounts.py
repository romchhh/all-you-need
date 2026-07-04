"""Розподіл каналів між Pyrogram-акаунтами + fallback при лімітах Telegram."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from typing import Any

from parser.core.account_pool import (
    PyrogramAccount,
    fallback_accounts_after,
    is_flood_limit_error,
    list_parser_accounts,
)
from parser.session_lock import pyrogram_session_guard

logger = logging.getLogger(__name__)

ParseChannelFn = Callable[..., Awaitable[dict]]

# Не чекати flood wait — одразу перемикати акаунт
PYROGRAM_SLEEP_THRESHOLD = 0

_DB_LOCKED_RETRIES = 4


def merge_channel_stats(total: dict, stats: dict, *, channel: str, city: str) -> None:
    total["added"] = int(total.get("added") or 0) + int(stats.get("added") or 0)
    total["skipped"] = int(total.get("skipped") or 0) + int(stats.get("skipped") or 0)
    if stats.get("reasons"):
        merged = total.setdefault("reasons", {})
        for reason, count in stats["reasons"].items():
            merged[reason] = merged.get(reason, 0) + count


def _is_sqlite_locked(err: BaseException) -> bool:
    return "database is locked" in str(err).lower()


async def _parse_with_retries(
    parse_fn: ParseChannelFn,
    client,
    channel: str,
    city: str,
    notify_callback: Callable[..., Awaitable[Any]],
) -> dict:
    last_err: BaseException | None = None
    for attempt in range(_DB_LOCKED_RETRIES):
        try:
            return await parse_fn(client, channel, city, notify_callback)
        except Exception as e:
            last_err = e
            if _is_sqlite_locked(e) and attempt < _DB_LOCKED_RETRIES - 1:
                wait = min(0.4 * (2**attempt), 3.0)
                logger.warning(
                    "SQLite locked для %s (спроба %s/%s), чекаємо %.1fs",
                    channel,
                    attempt + 1,
                    _DB_LOCKED_RETRIES,
                    wait,
                )
                await asyncio.sleep(wait)
                continue
            raise
    if last_err:
        raise last_err
    raise RuntimeError(f"parse failed for {channel}")


async def _run_bucket_on_account(
    acc: PyrogramAccount,
    bucket: list[tuple[str, str]],
    parse_fn: ParseChannelFn,
    notify_callback: Callable[..., Awaitable[Any]],
    *,
    log_prefix: str,
) -> tuple[dict, list[dict]]:
    """Один Pyrogram Client на всі канали акаунта — менше lock на .session."""
    from pyrogram import Client

    local: dict = {"added": 0, "skipped": 0, "reasons": {}}
    errors: list[dict] = []
    if not bucket:
        return local, errors

    client = Client(
        name=str(acc.session_path),
        api_id=acc.api_id,
        api_hash=acc.api_hash,
        phone_number=acc.phone,
        sleep_threshold=PYROGRAM_SLEEP_THRESHOLD,
    )

    async with pyrogram_session_guard(acc.session_path):
        async with client:
            for idx, (channel, city) in enumerate(bucket):
                try:
                    stats = await _parse_with_retries(
                        parse_fn, client, channel, city, notify_callback
                    )
                    merge_channel_stats(local, stats, channel=channel, city=city)
                    logger.info(
                        "  [%s …%s] %s: +%s нових, пропущено %s",
                        acc.label,
                        acc.phone_tail,
                        channel,
                        stats.get("added", 0),
                        stats.get("skipped", 0),
                    )
                    if stats.get("reasons"):
                        parts = ", ".join(
                            f"{reason}={count}"
                            for reason, count in sorted(
                                stats["reasons"].items(), key=lambda x: -x[1]
                            )
                        )
                        logger.info("  %s — причини пропуску: %s", channel, parts)
                except Exception as e:
                    if is_flood_limit_error(e):
                        stats, used_acc, flood_err = await _parse_channel_with_fallback(
                            acc,
                            parse_fn,
                            channel,
                            city,
                            notify_callback,
                            log_prefix=log_prefix,
                        )
                        if stats is None:
                            errors.append(
                                {
                                    "channel": channel,
                                    "city": city,
                                    "error": flood_err or "ліміт на всіх акаунтах",
                                }
                            )
                        else:
                            merge_channel_stats(local, stats, channel=channel, city=city)
                            used = used_acc or acc
                            logger.info(
                                "  [%s …%s] %s (fallback): +%s, пропущено %s",
                                used.label,
                                used.phone_tail,
                                channel,
                                stats.get("added", 0),
                                stats.get("skipped", 0),
                            )
                    else:
                        logger.error(
                            "%s — помилка каналу %s (акаунт %s): %s",
                            log_prefix,
                            channel,
                            acc.label,
                            e,
                            exc_info=True,
                        )
                        errors.append({"channel": channel, "city": city, "error": str(e)})
                if idx < len(bucket) - 1:
                    await asyncio.sleep(2)

    return local, errors


async def _run_parse_on_account(
    acc: PyrogramAccount,
    parse_fn: ParseChannelFn,
    channel: str,
    city: str,
    notify_callback: Callable[..., Awaitable[Any]],
) -> dict:
    from pyrogram import Client

    client = Client(
        name=str(acc.session_path),
        api_id=acc.api_id,
        api_hash=acc.api_hash,
        phone_number=acc.phone,
        sleep_threshold=PYROGRAM_SLEEP_THRESHOLD,
    )
    async with pyrogram_session_guard(acc.session_path):
        async with client:
            return await _parse_with_retries(
                parse_fn, client, channel, city, notify_callback
            )


async def _parse_channel_with_fallback(
    primary: PyrogramAccount,
    parse_fn: ParseChannelFn,
    channel: str,
    city: str,
    notify_callback: Callable[..., Awaitable[Any]],
    *,
    log_prefix: str,
) -> tuple[dict | None, PyrogramAccount | None, str | None]:
    chain = [primary, *fallback_accounts_after(primary)]
    last_error: str | None = None

    for acc in chain:
        try:
            stats = await _run_parse_on_account(acc, parse_fn, channel, city, notify_callback)
            if acc.label != primary.label:
                logger.info(
                    "%s — %s: канал %s оброблено резервним акаунтом %s (…%s)",
                    log_prefix,
                    primary.label,
                    channel,
                    acc.label,
                    acc.phone_tail,
                )
            return stats, acc, None
        except Exception as e:
            last_error = str(e)
            if is_flood_limit_error(e):
                logger.warning(
                    "%s — ліміт Telegram на %s (…%s) для %s: %s — пробуємо інший акаунт",
                    log_prefix,
                    acc.label,
                    acc.phone_tail,
                    channel,
                    e,
                )
                continue
            raise

    return None, None, last_error


async def run_channels_with_accounts(
    channels: dict[str, str],
    parse_fn: ParseChannelFn,
    notify_callback: Callable[..., Awaitable[Any]],
    *,
    log_prefix: str = "Парсинг",
) -> dict:
    """
    Канали розподіляються round-robin між акаунтами.
    При FloodWait — той самий канал повторюється на іншому акаунті.
    """
    accounts = list_parser_accounts()
    if not accounts:
        raise ValueError("PARSER_API_ID / PARSER_API_HASH / PARSER_PHONE не налаштовано")

    items = list(channels.items())
    buckets: list[list[tuple[str, str]]] = [[] for _ in accounts]
    for idx, item in enumerate(items):
        buckets[idx % len(accounts)].append(item)

    total: dict = {"added": 0, "skipped": 0, "errors": []}

    logger.info(
        "%s: %s канал(ів), %s Telegram-акаунт(ів) [%s]",
        log_prefix,
        len(items),
        len(accounts),
        ", ".join(f"{a.label}(…{a.phone_tail})" for a in accounts),
    )
    if len(accounts) == 1:
        logger.info(
            "%s: один Telegram-акаунт (parser_session) — товари і послуги",
            log_prefix,
        )
    elif len(accounts) < 2:
        logger.warning(
            "%s: лише 1 акаунт — при лімітах Telegram парсинг сповільниться.",
            log_prefix,
        )

    for acc, bucket in zip(accounts, buckets):
        if not bucket:
            continue
        logger.info(
            "%s — основний акаунт %s (…%s): %s канал(ів)",
            log_prefix,
            acc.label,
            acc.phone_tail,
            len(bucket),
        )
        local, errors = await _run_bucket_on_account(
            acc,
            bucket,
            parse_fn,
            notify_callback,
            log_prefix=log_prefix,
        )
        merge_channel_stats(total, local, channel="", city="")
        total["errors"].extend(errors)

    return total
