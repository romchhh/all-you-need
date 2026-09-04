"""Розподіл каналів між Pyrogram-акаунтами + fallback при лімітах Telegram."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from typing import Any

from parser.core.account_pool import (
    PyrogramAccount,
    extract_flood_wait_seconds,
    fallback_accounts_after,
    is_flood_limit_error,
    list_accounts_round_robin,
)
from parser.core.session_lock import pyrogram_session_guard
from parser.storage import parser_accounts_db as accounts_db
from parser.storage.connection import is_sqlite_locked_error
from parser.storage.session_sqlite import prepare_pyrogram_session, release_pyrogram_session

logger = logging.getLogger(__name__)

ParseChannelFn = Callable[..., Awaitable[dict]]

PYROGRAM_SLEEP_THRESHOLD = 0
_DB_LOCKED_RETRIES = 12
_CLIENT_START_RETRIES = 8
_ACCOUNT_BUCKET_RETRIES = 4
_INTER_ACCOUNT_SLEEP_SEC = 4.0
_DEFERRED_PASS_SLEEP_SEC = 12.0


def _build_pyrogram_client(acc: PyrogramAccount):
    from pyrogram import Client

    return Client(
        name=str(acc.session_path),
        api_id=acc.api_id,
        api_hash=acc.api_hash,
        phone_number=acc.phone,
        sleep_threshold=PYROGRAM_SLEEP_THRESHOLD,
    )


def _ensure_pyrogram_patched() -> None:
    from parser.core.pyrogram_photo_patch import apply_pyrogram_photo_size_patch

    apply_pyrogram_photo_size_patch()


def merge_channel_stats(total: dict, stats: dict, *, channel: str, city: str) -> None:
    total["added"] = int(total.get("added") or 0) + int(stats.get("added") or 0)
    total["skipped"] = int(total.get("skipped") or 0) + int(stats.get("skipped") or 0)
    if stats.get("reasons"):
        merged = total.setdefault("reasons", {})
        for reason, count in stats["reasons"].items():
            merged[reason] = merged.get(reason, 0) + count


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
            if is_sqlite_locked_error(e) and attempt < _DB_LOCKED_RETRIES - 1:
                wait = min(0.8 * (2**attempt), 8.0)
                logger.warning(
                    "SQLite/Pyrogram locked для %s (спроба %s/%s), чекаємо %.1fs",
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
    """Один Pyrogram Client на всі канали акаунта."""
    _ensure_pyrogram_patched()

    local: dict = {"added": 0, "skipped": 0, "reasons": {}}
    errors: list[dict] = []
    if not bucket:
        return local, errors

    last_err: BaseException | None = None
    for start_attempt in range(_CLIENT_START_RETRIES):
        await asyncio.to_thread(prepare_pyrogram_session, acc.session_path)
        client = _build_pyrogram_client(acc)
        try:
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
        except Exception as e:
            last_err = e
            if is_sqlite_locked_error(e) and start_attempt < _CLIENT_START_RETRIES - 1:
                wait = min(1.5 * (2**start_attempt), 10.0)
                logger.warning(
                    "Pyrogram session locked (%s), retry %s/%s через %.1fs",
                    acc.label,
                    start_attempt + 1,
                    _CLIENT_START_RETRIES,
                    wait,
                )
                await asyncio.sleep(wait)
                continue
            raise
        finally:
            await asyncio.to_thread(release_pyrogram_session, acc.session_path)

    if last_err:
        raise last_err
    return local, errors


async def _run_bucket_resilient(
    acc: PyrogramAccount,
    bucket: list[tuple[str, str]],
    parse_fn: ParseChannelFn,
    notify_callback: Callable[..., Awaitable[Any]],
    *,
    log_prefix: str,
) -> tuple[dict, list[dict], PyrogramAccount]:
    """Retry + резервний акаунт, якщо Pyrogram/.session або SQLite тимчасово зайняті."""
    last_err: BaseException | None = None
    tried: set[int] = set()

    def _candidates() -> list[PyrogramAccount]:
        chain = [acc, *fallback_accounts_after(acc)]
        out: list[PyrogramAccount] = []
        for candidate in chain:
            if candidate.id in tried:
                continue
            tried.add(candidate.id)
            out.append(candidate)
        return out

    for candidate in _candidates():
        for attempt in range(_ACCOUNT_BUCKET_RETRIES):
            try:
                local, errors = await _run_bucket_on_account(
                    candidate,
                    bucket,
                    parse_fn,
                    notify_callback,
                    log_prefix=log_prefix,
                )
                if candidate.id != acc.id:
                    logger.warning(
                        "%s — bucket %s канал(ів) з %s оброблено резервом %s",
                        log_prefix,
                        len(bucket),
                        acc.label,
                        candidate.label,
                    )
                return local, errors, candidate
            except Exception as e:
                last_err = e
                if is_sqlite_locked_error(e) and attempt < _ACCOUNT_BUCKET_RETRIES - 1:
                    wait = min(2.0 * (2**attempt), 12.0)
                    logger.warning(
                        "%s — SQLite/session locked для %s (bucket retry %s/%s, %.1fs)",
                        log_prefix,
                        candidate.label,
                        attempt + 1,
                        _ACCOUNT_BUCKET_RETRIES,
                        wait,
                    )
                    await asyncio.sleep(wait)
                    continue
                logger.warning(
                    "%s — bucket на %s не вдався: %s",
                    log_prefix,
                    candidate.label,
                    e,
                )
                break
        if last_err is None or not is_sqlite_locked_error(last_err):
            break
        await asyncio.sleep(_INTER_ACCOUNT_SLEEP_SEC)

    if last_err:
        raise last_err
    raise RuntimeError(f"bucket failed for {acc.label}")


async def _run_parse_on_account(
    acc: PyrogramAccount,
    parse_fn: ParseChannelFn,
    channel: str,
    city: str,
    notify_callback: Callable[..., Awaitable[Any]],
) -> dict:
    _ensure_pyrogram_patched()

    last_err: BaseException | None = None
    for start_attempt in range(_CLIENT_START_RETRIES):
        await asyncio.to_thread(prepare_pyrogram_session, acc.session_path)
        client = _build_pyrogram_client(acc)
        try:
            async with pyrogram_session_guard(acc.session_path):
                async with client:
                    result = await _parse_with_retries(
                        parse_fn, client, channel, city, notify_callback
                    )
            await asyncio.to_thread(release_pyrogram_session, acc.session_path)
            return result
        except Exception as e:
            last_err = e
            if is_sqlite_locked_error(e) and start_attempt < _CLIENT_START_RETRIES - 1:
                await asyncio.sleep(min(1.5 * (2**start_attempt), 10.0))
                continue
            raise
    if last_err:
        raise last_err
    raise RuntimeError(f"parse failed for {channel}")


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
            if is_flood_limit_error(e) or is_sqlite_locked_error(e):
                logger.warning(
                    "%s — %s для %s (…%s) канал %s: %s — пробуємо інший акаунт",
                    log_prefix,
                    "ліміт Telegram" if is_flood_limit_error(e) else "SQLite/session locked",
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
    accounts = list_accounts_round_robin(for_dm=False)
    if not accounts:
        raise ValueError(
            "Немає активних акаунтів парсера. Додайте їх у адмін-панелі: «Парсер акаунти»."
        )

    items = list(channels.items())
    buckets: list[list[tuple[str, str]]] = [[] for _ in accounts]
    for idx, item in enumerate(items):
        buckets[idx % len(accounts)].append(item)

    total: dict = {"added": 0, "skipped": 0, "errors": []}
    deferred_buckets: list[tuple[PyrogramAccount, list[tuple[str, str]]]] = []

    logger.info(
        "%s: %s канал(ів), %s Telegram-акаунт(ів) [%s]",
        log_prefix,
        len(items),
        len(accounts),
        ", ".join(f"{a.label}(…{a.phone_tail})" for a in accounts),
    )

    for idx, (acc, bucket) in enumerate(zip(accounts, buckets)):
        if not bucket:
            continue
        if idx > 0:
            await asyncio.sleep(_INTER_ACCOUNT_SLEEP_SEC)
        logger.info(
            "%s — основний акаунт %s (…%s): %s канал(ів)",
            log_prefix,
            acc.label,
            acc.phone_tail,
            len(bucket),
        )
        try:
            local, errors, used_acc = await _run_bucket_resilient(
                acc,
                bucket,
                parse_fn,
                notify_callback,
                log_prefix=log_prefix,
            )
            merge_channel_stats(total, local, channel="", city="")
            total["errors"].extend(errors)
            try:
                accounts_db.mark_parse_result(acc.id, ok=True)
                if used_acc.id != acc.id:
                    accounts_db.mark_parse_result(used_acc.id, ok=True)
            except Exception as mark_err:
                logger.warning(
                    "%s — не вдалось оновити статистику акаунта %s: %s",
                    log_prefix,
                    acc.label,
                    mark_err,
                )
        except Exception as e:
            logger.exception("%s — збій акаунта %s: %s", log_prefix, acc.label, e)
            deferred_buckets.append((acc, bucket))
            try:
                accounts_db.mark_parse_result(acc.id, ok=False, error=str(e))
            except Exception as mark_err:
                logger.warning("mark_parse_result(%s): %s", acc.label, mark_err)
            wait_sec = extract_flood_wait_seconds(e)
            if wait_sec > 0:
                import time as _time

                accounts_db.set_flood_until(acc.id, _time.time() + wait_sec)

    if deferred_buckets:
        logger.warning(
            "%s — повторний прохід для %s акаунт(ів) після паузи %.0fs",
            log_prefix,
            len(deferred_buckets),
            _DEFERRED_PASS_SLEEP_SEC,
        )
        await asyncio.sleep(_DEFERRED_PASS_SLEEP_SEC)
        for acc, bucket in deferred_buckets:
            try:
                local, errors, used_acc = await _run_bucket_resilient(
                    acc,
                    bucket,
                    parse_fn,
                    notify_callback,
                    log_prefix=f"{log_prefix} [retry]",
                )
                merge_channel_stats(total, local, channel="", city="")
                total["errors"].extend(errors)
                accounts_db.mark_parse_result(acc.id, ok=True)
                if used_acc.id != acc.id:
                    accounts_db.mark_parse_result(used_acc.id, ok=True)
                logger.info(
                    "%s — повторний прохід OK для %s (%s каналів)",
                    log_prefix,
                    acc.label,
                    len(bucket),
                )
            except Exception as e:
                logger.exception("%s — повторний прохід failed %s: %s", log_prefix, acc.label, e)
                hint = ""
                if is_sqlite_locked_error(e):
                    hint = " (перевірте bot/parser/sessions/*.session-wal або два bot-процеси)"
                total["errors"].append(
                    {
                        "channel": "—",
                        "city": "—",
                        "error": f"{acc.label}: {e}{hint}",
                        "account": acc.label,
                    }
                )

    return total
