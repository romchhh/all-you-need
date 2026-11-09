"""Акаунти парсера / агрегатора — не підставляти як автора оголошення."""

from __future__ import annotations

import os
from functools import lru_cache


_STATIC_USERNAMES: frozenset[str] = frozenset(
    {
        "parser_bot",
        "tradeground",
        "tradeground_seller",
        "tradeground_seller2",
        "tradeground_seller3",
    }
)

_STATIC_TELEGRAM_IDS: frozenset[int] = frozenset({8590825131, 5587484547})


@lru_cache(maxsize=1)
def aggregator_usernames() -> frozenset[str]:
    names = set(_STATIC_USERNAMES)
    try:
        from parser.config.accounts import load_parser_account_configs

        for acc in load_parser_account_configs():
            u = (acc.username or "").strip().lstrip("@").lower()
            if u:
                names.add(u)
    except Exception:
        pass
    extra = (os.getenv("PARSER_AGGREGATOR_USERNAMES") or "").strip()
    for part in extra.split(","):
        u = part.strip().lstrip("@").lower()
        if u:
            names.add(u)
    return frozenset(names)


@lru_cache(maxsize=1)
def aggregator_telegram_ids() -> frozenset[int]:
    ids = set(_STATIC_TELEGRAM_IDS)
    try:
        from parser.config.accounts import load_parser_account_configs

        for acc in load_parser_account_configs():
            if acc.telegram_id:
                ids.add(int(acc.telegram_id))
    except Exception:
        pass
    for key in (
        "PARSER_BOT_TELEGRAM_ID",
        "PARSER_SERVICES_BOT_TELEGRAM_ID",
        "PARSER_FALLBACK_BOT_TELEGRAM_ID",
        "PARSER_ACCOUNT_1_TELEGRAM_ID",
        "PARSER_ACCOUNT_2_TELEGRAM_ID",
        "PARSER_ACCOUNT_3_TELEGRAM_ID",
    ):
        raw = (os.getenv(key) or "").strip()
        if raw.isdigit():
            ids.add(int(raw))
    return frozenset(ids)


def is_aggregator_username(username: str | None) -> bool:
    u = (username or "").strip().lstrip("@").lower()
    return bool(u) and u in aggregator_usernames()


def is_aggregator_telegram_id(telegram_id) -> bool:
    if telegram_id in (None, "", 0, "0"):
        return False
    try:
        tid = int(telegram_id)
    except (TypeError, ValueError):
        return False
    return tid in aggregator_telegram_ids()


def clear_aggregator_username(username: str | None) -> str:
    u = (username or "").strip().lstrip("@")
    if not u or is_aggregator_username(u):
        return ""
    return u
