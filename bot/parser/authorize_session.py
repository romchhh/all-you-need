#!/usr/bin/env python3
"""
Інтерактивна авторизація Pyrogram-сесії парсера.

Запуск з каталогу bot/:
  python3 -m parser.authorize_session                 # main (parser_session)
  python3 -m parser.authorize_session --services      # 2-й (parser_services_session)
  python3 -m parser.authorize_session --fallback      # 3-й резерв @opluger
  python3 -m parser.authorize_services_session
  python3 -m parser.authorize_fallback_session
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

_BOT_ROOT = Path(__file__).resolve().parent.parent
if str(_BOT_ROOT) not in sys.path:
    sys.path.insert(0, str(_BOT_ROOT))

from parser.moderation.config import (  # noqa: E402
    PARSER_API_HASH,
    PARSER_API_ID,
    PARSER_FALLBACK_API_HASH,
    PARSER_FALLBACK_API_ID,
    PARSER_FALLBACK_PHONE,
    PARSER_FALLBACK_SESSION_PATH,
    PARSER_PHONE,
    PARSER_SERVICES_API_HASH,
    PARSER_SERVICES_API_ID,
    PARSER_SERVICES_PHONE,
    PARSER_SERVICES_SESSION_PATH,
    PARSER_SESSION_PATH,
)


def _session_file(session_path: Path) -> Path:
    return session_path.parent / f"{session_path.name}.session"


def _resolve_account(which: str) -> tuple[str, int, str, str, Path]:
    if which == "services":
        label = "services (parser_services_session)"
        api_id = PARSER_SERVICES_API_ID
        api_hash = PARSER_SERVICES_API_HASH
        phone = PARSER_SERVICES_PHONE
        session_path = PARSER_SERVICES_SESSION_PATH
        env_hint = "PARSER_SERVICES_API_ID, PARSER_SERVICES_API_HASH, PARSER_SERVICES_PHONE"
    elif which == "fallback":
        label = "fallback (parser_fallback_session, @opluger)"
        api_id = PARSER_FALLBACK_API_ID
        api_hash = PARSER_FALLBACK_API_HASH
        phone = PARSER_FALLBACK_PHONE
        session_path = PARSER_FALLBACK_SESSION_PATH
        env_hint = "PARSER_FALLBACK_API_ID, PARSER_FALLBACK_API_HASH, PARSER_FALLBACK_PHONE"
    else:
        label = "main (parser_session)"
        api_id = PARSER_API_ID
        api_hash = PARSER_API_HASH
        phone = PARSER_PHONE
        session_path = PARSER_SESSION_PATH
        env_hint = "PARSER_API_ID, PARSER_API_HASH, PARSER_PHONE"

    if not api_id or not api_hash or not phone:
        raise SystemExit(
            f"❌ Не налаштовано {env_hint} у bot/.env\n"
            f"   Файл: {_BOT_ROOT / '.env'}"
        )

    return label, int(api_id), api_hash, phone.strip(), session_path


async def _authorize(which: str) -> None:
    label, api_id, api_hash, phone, session_path = _resolve_account(which)
    session_file = _session_file(session_path)

    try:
        from pyrogram import Client
    except ImportError as e:
        raise SystemExit(
            "❌ Pyrogram не встановлено. pip install pyrogram tgcrypto"
        ) from e

    print(f"🔐 Авторизація: {label}")
    print(f"   Телефон: {phone}")
    print(f"   Сесія:   {session_file}")
    if session_file.exists():
        print("   ℹ️  Файл сесії вже є — Pyrogram перевірить або перевидасть її.")
    print()
    print("Telegram надішле код у додаток або SMS. Введіть його в терміналі.")
    print()

    client = Client(
        name=str(session_path),
        api_id=api_id,
        api_hash=api_hash,
        phone_number=phone,
    )

    await client.start()
    try:
        me = await client.get_me()
        username = f"@{me.username}" if me.username else "(без username)"
        print()
        print(f"✅ Успішно: {me.first_name} {username}, id={me.id}")
        print(f"   Сесія збережена: {session_file}")
        if which == "fallback":
            print()
            print("Додайте в .env для оголошень на маркетплейсі:")
            print(f"   PARSER_FALLBACK_BOT_TELEGRAM_ID={me.id}")
            print(f"   PARSER_FALLBACK_BOT_USERNAME={me.username or 'opluger'}")
    finally:
        await client.stop()


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Авторизація Pyrogram-сесії парсера")
    group = parser.add_mutually_exclusive_group()
    group.add_argument(
        "--services",
        action="store_true",
        help="2-й акаунт (PARSER_SERVICES_*)",
    )
    group.add_argument(
        "--fallback",
        action="store_true",
        help="3-й резервний акаунт (PARSER_FALLBACK_*, @opluger)",
    )
    args = parser.parse_args(argv)
    which = "services" if args.services else ("fallback" if args.fallback else "main")
    asyncio.run(_authorize(which))


if __name__ == "__main__":
    main()
