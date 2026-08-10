#!/usr/bin/env python3
"""
Видалення невикористовуваних і застарілих фото парсера.

Запуск з каталогу `bot/`:
  python3 -m parser.scripts.cleanup_parsed_photos --dry-run -v
  python3 -m parser.scripts.cleanup_parsed_photos --all -v
  python3 -m parser.scripts.cleanup_parsed_photos --orphans-only -v
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
    ap.add_argument("--days", type=int, default=30, help="Вік stale pending у днях (default 30)")
    ap.add_argument(
        "--public-orphan-days",
        type=int,
        default=7,
        help="Мін. вік parser_* у public перед видаленням (0 = одразу)",
    )
    ap.add_argument("--dry-run", action="store_true", help="Лише звіт, без змін")
    ap.add_argument("-v", "--verbose", action="store_true", help="Прогрес у stderr")
    ap.add_argument("--legacy", action="store_true", help="Лише stale pending")
    ap.add_argument(
        "--all",
        action="store_true",
        help="rejected + stale + published + orphans (+ public з --public-orphans)",
    )
    ap.add_argument(
        "--orphans-only",
        action="store_true",
        help="Швидкий режим для VPS: лише сироти в parsed_photos/",
    )
    ap.add_argument("--no-rejected", action="store_true")
    ap.add_argument("--no-published", action="store_true")
    ap.add_argument("--no-orphans", action="store_true")
    ap.add_argument(
        "--public-orphans",
        action="store_true",
        help="Також parser_* / pi* у public/listings/originals",
    )
    args = ap.parse_args()

    on_progress = None
    if args.verbose:
        def on_progress(msg: str) -> None:
            print(msg, file=sys.stderr, flush=True)

        on_progress("cleanup: start")

    if args.orphans_only:
        result = cleanup_unused_parsed_photos(
            days=args.days,
            dry_run=args.dry_run,
            delete_rejected=False,
            delete_stale_pending=False,
            delete_published=False,
            delete_orphans=True,
            delete_public_orphans=False,
            on_progress=on_progress,
        )
    elif args.legacy:
        result = cleanup_stale_parsed_photos(days=args.days, dry_run=args.dry_run)
    elif args.all:
        result = cleanup_unused_parsed_photos(
            days=args.days,
            dry_run=args.dry_run,
            delete_rejected=True,
            delete_stale_pending=True,
            delete_published=True,
            delete_orphans=True,
            delete_public_orphans=args.public_orphans,
            public_orphan_days=args.public_orphan_days,
            on_progress=on_progress,
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
            on_progress=on_progress,
        )

    print(json.dumps(result, ensure_ascii=False, indent=2))
    freed = result.get("bytes_freed", 0)
    if freed:
        print(f"\nЗвільнено: {_format_bytes(freed)}", file=sys.stderr)


if __name__ == "__main__":
    main()
