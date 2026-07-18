#!/usr/bin/env python3
"""
Інтерактивна авторизація Pyrogram-сесії парсера.

Запуск з каталогу bot/:
  python3 -m parser.scripts.authorize_session --account 1
  python3 -m parser.scripts.authorize_session --account 2
  python3 -m parser.scripts.authorize_session --account 3
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

_BOT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(_BOT_ROOT) not in sys.path:
    sys.path.insert(0, str(_BOT_ROOT))

from parser.config.accounts import load_parser_account_configs  # noqa: E402


def _session_file(session_path: Path) -> Path:
    return session_path.parent / f"{session_path.name}.session"


async def _authorize(account_index: int) -> None:
    configs = {c.index: c for c in load_parser_account_configs(3)}
    cfg = configs.get(account_index)
    if not cfg or not cfg.is_configured():
        raise SystemExit(
            f"❌ PARSER_ACCOUNT_{account_index}_API_ID / _API_HASH / _PHONE не налаштовано в bot/.env"
        )

    try:
        from pyrogram import Client
    except ImportError as e:
        raise SystemExit("❌ Pyrogram не встановлено. pip install pyrogram tgcrypto") from e

    session_file = _session_file(cfg.session_path)
    print(f"🔐 Авторизація: PARSER_ACCOUNT_{account_index}")
    print(f"   Телефон: {cfg.phone}")
    print(f"   Сесія:   {session_file}")
    if session_file.exists():
        print("   ℹ️  Файл сесії вже є — Pyrogram перевірить або перевидасть її.")
    print()
    print("Telegram надішле код у додаток або SMS. Введіть його в терміналі.")
    print()

    client = Client(
        name=str(cfg.session_path),
        api_id=cfg.api_id,
        api_hash=cfg.api_hash,
        phone_number=cfg.phone,
    )

    await client.start()
    try:
        me = await client.get_me()
        username = f"@{me.username}" if me.username else "(без username)"
        print()
        print(f"✅ Успішно: {me.first_name} {username}, id={me.id}")
        print(f"   Сесія збережена: {session_file}")
        print()
        print("Додайте / оновіть у bot/.env:")
        print(f"   PARSER_ACCOUNT_{account_index}_TELEGRAM_ID={me.id}")
        if me.username:
            print(f"   PARSER_ACCOUNT_{account_index}_USERNAME={me.username}")
    finally:
        await client.stop()


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Авторизація Pyrogram-сесії парсера")
    parser.add_argument(
        "--account",
        type=int,
        choices=(1, 2, 3),
        default=1,
        help="Номер акаунта PARSER_ACCOUNT_N (1–3)",
    )
    # legacy flags
    parser.add_argument("--services", action="store_true", help=argparse.SUPPRESS)
    parser.add_argument("--fallback", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args(argv)

    account = args.account
    if args.services:
        account = 2
    elif args.fallback:
        account = 3

    asyncio.run(_authorize(account))


if __name__ == "__main__":
    main()
