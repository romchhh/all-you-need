#!/usr/bin/env python3
"""
Видалення невикористовуваних і застарілих фото парсера.

Очищає:
  - database/parsed_photos/ для відхилених parsed_items
  - старі pending без виходу на маркетплейс (> N днів)
  - копії після публікації (marketplace_listing_id вже є)
  - сирітські файли на диску без посилань у БД
  - (опційно) parser_* у app/public/listings/originals без посилань у Listing

Запуск з каталогу `bot/`:
  python -m parser.scripts.cleanup_parsed_photos --dry-run
  python -m parser.scripts.cleanup_parsed_photos --days 30
  python -m parser.scripts.cleanup_parsed_photos --all --dry-run
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

_BOT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(_BOT_ROOT) not in sys.path:
    sys.path.insert(0, str(_BOT_ROOT))

from parser.storage.photos_cleanup import (  # noqa: E402
    cleanup_stale_parsed_photos,
    cleanup_unused_parsed_photos,
)


def _format_bytes(n: int) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024 or unit == "GB":
            return f"{n:.1f} {unit}" if unit != "B" else f"{n} B"
        n /= 1024
    return f"{n:.1f} GB"


def main() -> None:
    ap = argparse.ArgumentParser(
        description="Очистити невикористовувані фото парсера (parsed_photos та опційно public)"
    )
    ap.add_argument(
        "--days",
        type=int,
        default=30,
        help="Мінімальний вік stale pending записів у днях (за created_at), за замовчуванням 30",
    )
    ap.add_argument(
        "--public-orphan-days",
        type=int,
        default=7,
        help="Мінімальний вік сирітських parser_* у public перед видаленням (0 = одразу)",
    )
    ap.add_argument(
        "--dry-run",
        action="store_true",
        help="Лише звіт, без видалення файлів і без UPDATE БД",
    )
    ap.add_argument(
        "--legacy",
        action="store_true",
        help="Старий режим: лише pending без listing старіші за --days",
    )
    ap.add_argument(
        "--all",
        action="store_true",
        help="Повне очищення: rejected + stale + published + orphans + public orphans",
    )
    ap.add_argument(
        "--no-rejected",
        action="store_true",
        help="Не видаляти фото відхилених parsed_items",
    )
    ap.add_argument(
        "--no-published",
        action="store_true",
        help="Не видаляти parsed_photos після публікації на маркетплейс",
    )
    ap.add_argument(
        "--no-orphans",
        action="store_true",
        help="Не видаляти сирітські файли в parsed_photos/",
    )
    ap.add_argument(
        "--public-orphans",
        action="store_true",
        help="Також видалити parser_* у public/listings/originals без посилань у Listing",
    )
    args = ap.parse_args()

    if args.legacy:
        result = cleanup_stale_parsed_photos(days=args.days, dry_run=args.dry_run)
    elif args.all:
        result = cleanup_unused_parsed_photos(
            days=args.days,
            dry_run=args.dry_run,
            delete_rejected=True,
            delete_stale_pending=True,
            delete_published=True,
            delete_orphans=True,
            delete_public_orphans=True,
            public_orphan_days=args.public_orphan_days,
        )
    else:
        result = cleanup_unused_parsed_photos(
            days=args.days,
            dry_run=args.dry_run,
            delete_rejected=not args.no_rejected,
            delete_stale_pending=True,
            delete_published=not args.no_published,
            delete_orphans=not args.no_orphans,
            delete_public_orphans=args.public_orphans,
            public_orphan_days=args.public_orphan_days,
        )

    print(json.dumps(result, ensure_ascii=False, indent=2))
    freed = result.get("bytes_freed", 0)
    if freed:
        print(f"\nЗвільнено (прогноз): {_format_bytes(freed)}", file=sys.stderr)


if __name__ == "__main__":
    main()
