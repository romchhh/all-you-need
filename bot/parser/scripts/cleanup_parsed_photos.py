#!/usr/bin/env python3
"""
Видалення фото парсера: не в оголошеннях і старіші за N днів (за замовч. 7).
Видаляє одразу, без підтвердження. Для перегляду — --dry-run.

  python3 -m parser.scripts.cleanup_parsed_photos -v
  python3 -m parser.scripts.cleanup_parsed_photos --dry-run -v
  python3 -m parser.scripts.cleanup_parsed_photos --days 7 --public -v
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

_BOT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(_BOT_ROOT) not in sys.path:
    sys.path.insert(0, str(_BOT_ROOT))

from parser.storage.photos_cleanup import cleanup_old_unused_parser_photos  # noqa: E402


def _format_bytes(n: int) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024 or unit == "GB":
            return f"{n:.1f} {unit}" if unit != "B" else f"{n} B"
        n /= 1024
    return f"{n:.1f} GB"


def main() -> None:
    ap = argparse.ArgumentParser(
        description=(
            "Видалити фото парсера, які не в Listing і старіші за N днів (надто старі). "
            "Без --dry-run видаляє одразу."
        )
    )
    ap.add_argument(
        "--days",
        type=int,
        default=7,
        help="Вік у днях — старіші видаляються (default 7)",
    )
    ap.add_argument("--dry-run", action="store_true", help="Лише звіт, без видалення")
    ap.add_argument("-v", "--verbose", action="store_true", help="Прогрес")
    ap.add_argument(
        "--public",
        action="store_true",
        help="Також parser_* / pi* у public/listings/originals",
    )
    # зворотна сумісність
    ap.add_argument("--all", action="store_true", help=argparse.SUPPRESS)
    ap.add_argument("--public-orphans", action="store_true", help=argparse.SUPPRESS)
    ap.add_argument("--orphans-only", action="store_true", help=argparse.SUPPRESS)
    args = ap.parse_args()

    include_public = args.public or args.public_orphans or args.all

    on_progress = None
    if args.verbose:
        def on_progress(msg: str) -> None:
            print(msg, file=sys.stderr, flush=True)

        on_progress("cleanup: start")

    result = cleanup_old_unused_parser_photos(
        days=args.days,
        dry_run=args.dry_run,
        include_public=include_public,
        on_progress=on_progress,
    )

    print(json.dumps(result, ensure_ascii=False, indent=2))

    deleted = result.get("files_deleted", 0)
    too_old = result.get("too_old_deleted", 0)
    db_cleared = result.get("parsed_items_cleared", 0)
    db_deleted = result.get("parsed_items_deleted", 0)
    freed = result.get("bytes_freed", 0)
    if deleted or db_cleared or db_deleted:
        mode = "прогноз" if args.dry_run else "готово"
        print(
            f"\n{mode}: файлів {deleted} (надто старі {too_old}), "
            f"БД images_json очищено {db_cleared}, рядків parsed_items видалено {db_deleted}, "
            f"диск {_format_bytes(freed)}",
            file=sys.stderr,
        )
    elif args.verbose:
        print("\nНічого не видалено (усі файли або в оголошеннях, або новіші за поріг)", file=sys.stderr)


if __name__ == "__main__":
    main()
