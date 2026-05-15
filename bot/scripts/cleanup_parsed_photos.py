#!/usr/bin/env python3
"""
Видалення застарілих файлів з database/parsed_photos для parsed_items без виходу на маркетплейс.

Запуск з каталогу `bot/`:
  python scripts/cleanup_parsed_photos.py --dry-run
  python scripts/cleanup_parsed_photos.py --days 30
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

_BOT_ROOT = Path(__file__).resolve().parent.parent
if str(_BOT_ROOT) not in sys.path:
    sys.path.insert(0, str(_BOT_ROOT))

from parser.db import cleanup_stale_parsed_photos  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser(
        description="Очистити parsed_photos для оголошень парсера > N днів без marketplace_listing_id"
    )
    ap.add_argument(
        "--days",
        type=int,
        default=30,
        help="Мінімальний вік запису parsed_items у днях (за created_at), за замовчуванням 30",
    )
    ap.add_argument(
        "--dry-run",
        action="store_true",
        help="Лише звіт, без видалення файлів і без UPDATE БД",
    )
    args = ap.parse_args()
    result = cleanup_stale_parsed_photos(days=args.days, dry_run=args.dry_run)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
