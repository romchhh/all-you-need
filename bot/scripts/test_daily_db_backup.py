#!/usr/bin/env python3
"""Перевірка щоденного бекапу (без Telegram, якщо не передано --send)."""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from pathlib import Path

BOT_ROOT = Path(__file__).resolve().parent.parent
REPO_ROOT = BOT_ROOT.parent
sys.path.insert(0, str(BOT_ROOT))
os.chdir(REPO_ROOT)

from dotenv import load_dotenv

load_dotenv(BOT_ROOT / ".env")
load_dotenv(BOT_ROOT.parent / ".env")


def test_create_backup() -> Path:
    from utils.daily_db_backup import create_database_backup, cleanup_old_backups

    path = create_database_backup()
    assert path, "backup files missing"
    total = sum(p.stat().st_size for p in path)
    assert total > 0, "backup empty"
    removed = cleanup_old_backups(keep_days=3650)
    print(f"OK backup: {len(path)} file(s), {total} bytes total, cleanup removed={removed}")
    for p in path[:5]:
        print(f"  - {p.name} ({p.stat().st_size} bytes)")
    if len(path) > 5:
        print(f"  ... +{len(path) - 5} more")
    return path


def test_admin_ids() -> None:
    from utils.daily_db_backup import admin_telegram_ids

    ids = admin_telegram_ids()
    print(f"Admin IDs ({len(ids)}): {ids}")
    if not ids:
        print("WARN: no admin telegram ids — set ADMINISTRATORS in .env")


async def test_send(token: str) -> None:
    from aiogram import Bot
    from utils.daily_db_backup import send_daily_backup_to_admins

    bot = Bot(token=token)
    try:
        stats = await send_daily_backup_to_admins(bot)
        print("Send stats:", stats)
        if not stats.get("ok") and stats.get("error") not in ("disabled",):
            raise SystemExit(1)
    finally:
        await bot.session.close()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--send", action="store_true", help="Надіслати бекап адмінам у Telegram")
    args = parser.parse_args()

    test_admin_ids()
    test_create_backup()

    if args.send:
        token = (os.getenv("TOKEN") or "").strip()
        if not token:
            raise SystemExit("TOKEN не задано для --send")
        asyncio.run(test_send(token))
    else:
        print("Skip Telegram (--send не вказано)")


if __name__ == "__main__":
    main()
