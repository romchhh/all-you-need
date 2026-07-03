"""Два Pyrogram-акаунти для парсингу каналів по черзі (round-robin)."""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from parser.moderation.config import (
    PARSER_API_HASH,
    PARSER_API_ID,
    PARSER_PHONE,
    PARSER_SERVICES_API_HASH,
    PARSER_SERVICES_API_ID,
    PARSER_SERVICES_PHONE,
    PARSER_SERVICES_SESSION_PATH,
    PARSER_SESSION_PATH,
)
from parser.session_lock import pyrogram_session_guard

logger = logging.getLogger(__name__)

ParseChannelFn = Callable[..., Awaitable[dict]]


@dataclass(frozen=True)
class PyrogramAccount:
    label: str
    api_id: int
    api_hash: str
    phone: str
    session_path: Path

    def is_configured(self) -> bool:
        return bool(self.api_id and self.api_hash and self.phone)

    @property
    def phone_tail(self) -> str:
        digits = "".join(c for c in self.phone if c.isdigit())
        return digits[-4:] if len(digits) >= 4 else "????"


def _main_account() -> PyrogramAccount:
    return PyrogramAccount(
        label="main",
        api_id=PARSER_API_ID,
        api_hash=PARSER_API_HASH,
        phone=PARSER_PHONE,
        session_path=PARSER_SESSION_PATH,
    )


def _services_account() -> PyrogramAccount:
    return PyrogramAccount(
        label="services",
        api_id=PARSER_SERVICES_API_ID or PARSER_API_ID,
        api_hash=PARSER_SERVICES_API_HASH or PARSER_API_HASH,
        phone=PARSER_SERVICES_PHONE or PARSER_PHONE,
        session_path=PARSER_SERVICES_SESSION_PATH,
    )


def list_parser_accounts() -> list[PyrogramAccount]:
    """Унікальні налаштовані акаунти (main + services, якщо другий відрізняється)."""
    seen: set[tuple[int, str]] = set()
    out: list[PyrogramAccount] = []
    for acc in (_main_account(), _services_account()):
        if not acc.is_configured():
            continue
        key = (acc.api_id, acc.phone.strip())
        if key in seen:
            continue
        seen.add(key)
        out.append(acc)
    return out


def merge_channel_stats(total: dict, stats: dict, *, channel: str, city: str) -> None:
    total["added"] = int(total.get("added") or 0) + int(stats.get("added") or 0)
    total["skipped"] = int(total.get("skipped") or 0) + int(stats.get("skipped") or 0)
    if stats.get("reasons"):
        merged = total.setdefault("reasons", {})
        for reason, count in stats["reasons"].items():
            merged[reason] = merged.get(reason, 0) + count


async def run_channels_with_accounts(
    channels: dict[str, str],
    parse_fn: ParseChannelFn,
    notify_callback: Callable[..., Awaitable[Any]],
    *,
    log_prefix: str = "Парсинг",
) -> dict:
    """
    Розподіляє канали між акаунтами по черзі (0→acc0, 1→acc1, 2→acc0…).
    Кожен акаунт — окрема Pyrogram-сесія та lock.
    """
    accounts = list_parser_accounts()
    if not accounts:
        raise ValueError("PARSER_API_ID / PARSER_API_HASH / PARSER_PHONE не налаштовано")

    try:
        from pyrogram import Client
    except ImportError as e:
        raise ImportError("Pyrogram не встановлено. pip install pyrogram tgcrypto") from e

    items = list(channels.items())
    buckets: list[list[tuple[str, str]]] = [[] for _ in accounts]
    for idx, item in enumerate(items):
        buckets[idx % len(accounts)].append(item)

    total: dict = {"added": 0, "skipped": 0, "errors": []}

    logger.info(
        "%s: %s канал(ів), %s Telegram-акаунт(ів)",
        log_prefix,
        len(items),
        len(accounts),
    )

    for acc, bucket in zip(accounts, buckets):
        if not bucket:
            continue
        logger.info(
            "%s — акаунт %s (…%s): %s канал(ів)",
            log_prefix,
            acc.label,
            acc.phone_tail,
            len(bucket),
        )
        client = Client(
            name=str(acc.session_path),
            api_id=acc.api_id,
            api_hash=acc.api_hash,
            phone_number=acc.phone,
        )
        async with pyrogram_session_guard(acc.session_path):
            async with client:
                for channel, city in bucket:
                    try:
                        stats = await parse_fn(client, channel, city, notify_callback)
                        merge_channel_stats(total, stats, channel=channel, city=city)
                        logger.info(
                            "  [%s …%s] %s: +%s нових, пропущено %s",
                            acc.label,
                            acc.phone_tail,
                            channel,
                            stats.get("added", 0),
                            stats.get("skipped", 0),
                        )
                    except Exception as e:
                        logger.error(
                            "%s — помилка каналу %s (акаунт %s): %s",
                            log_prefix,
                            channel,
                            acc.label,
                            e,
                            exc_info=True,
                        )
                        total["errors"].append(
                            {"channel": channel, "city": city, "error": str(e)}
                        )

    return total
