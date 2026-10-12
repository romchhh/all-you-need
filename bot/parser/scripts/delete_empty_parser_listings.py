#!/usr/bin/env python3
"""
Оголошення з парсера без нормального опису (порожній / лише заголовок).

  python3 -m parser.scripts.delete_empty_parser_listings -v
  python3 -m parser.scripts.delete_empty_parser_listings --execute -v
  python3 -m parser.scripts.delete_empty_parser_listings --execute --repair-first -v

За замовчуванням — dry-run (без --execute нічого не змінює).
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

_BOT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(_BOT_ROOT) not in sys.path:
    sys.path.insert(0, str(_BOT_ROOT))

from database_functions.db_connection import get_connection, is_postgres  # noqa: E402
from parser.moderation.formatting import (  # noqa: E402
    build_final_marketplace_description,
    is_effectively_empty_marketplace_description,
    preserve_parsed_source_fields,
)


def _listing_table() -> str:
    return '"Listing"' if is_postgres() else "Listing"


def _fetch_parser_listings() -> list[dict]:
    conn = get_connection()
    cursor = conn.cursor()
    lt = _listing_table()
    cursor.execute(
        f"""
        SELECT
            l.id AS listing_id,
            l.title AS listing_title,
            l.description AS listing_description,
            l.status AS listing_status,
            pi.id AS parsed_item_id,
            pi.title AS pi_title,
            pi.description AS pi_description,
            pi.raw_text AS raw_text,
            pi.author_username AS author_username,
            pi.msg_link AS msg_link,
            pi.source_channel AS source_channel,
            pi.message_id AS message_id
        FROM {lt} l
        INNER JOIN parsed_items pi ON pi.marketplace_listing_id = l.id
        WHERE l.status IN ('active', 'pending', 'pending_moderation', 'hidden')
        ORDER BY l.id ASC
        """
    )
    rows = cursor.fetchall()
    conn.close()
    out: list[dict] = []
    for row in rows:
        if hasattr(row, "keys"):
            out.append(dict(row))
        else:
            out.append(
                {
                    "listing_id": row[0],
                    "listing_title": row[1],
                    "listing_description": row[2],
                    "listing_status": row[3],
                    "parsed_item_id": row[4],
                    "pi_title": row[5],
                    "pi_description": row[6],
                    "raw_text": row[7],
                    "author_username": row[8],
                    "msg_link": row[9],
                    "source_channel": row[10],
                    "message_id": row[11],
                }
            )
    return out


def _hide_listing(listing_id: int) -> None:
    conn = get_connection()
    cursor = conn.cursor()
    lt = _listing_table()
    if is_postgres():
        cursor.execute(
            f'UPDATE {lt} SET status = ?, "updatedAt" = NOW() WHERE id = ?',
            ("hidden", listing_id),
        )
    else:
        cursor.execute(
            f"UPDATE {lt} SET status = 'hidden', updatedAt = datetime('now') WHERE id = ?",
            (listing_id,),
        )
    conn.commit()
    conn.close()


def _update_listing_description(listing_id: int, description: str) -> None:
    conn = get_connection()
    cursor = conn.cursor()
    lt = _listing_table()
    if is_postgres():
        cursor.execute(
            f'UPDATE {lt} SET description = ?, "updatedAt" = NOW() WHERE id = ?',
            (description, listing_id),
        )
    else:
        cursor.execute(
            f"UPDATE {lt} SET description = ?, updatedAt = datetime('now') WHERE id = ?",
            (description, listing_id),
        )
    conn.commit()
    conn.close()


def main() -> None:
    ap = argparse.ArgumentParser(description="Сховати оголошення парсера без опису")
    ap.add_argument(
        "--execute",
        action="store_true",
        help="Застосувати зміни (без цього — лише звіт)",
    )
    ap.add_argument(
        "--repair-first",
        action="store_true",
        help="Спочатку відновити опис з parsed_items.raw_text",
    )
    ap.add_argument(
        "--min-body-len",
        type=int,
        default=12,
        help="Мін. довжина тексту без службового хвоста",
    )
    ap.add_argument("-v", "--verbose", action="store_true")
    args = ap.parse_args()
    dry_run = not args.execute

    rows = _fetch_parser_listings()
    to_hide: list[dict] = []
    repaired = 0

    for row in rows:
        listing_id = int(row["listing_id"])
        title = str(row.get("listing_title") or row.get("pi_title") or "")
        desc = str(row.get("listing_description") or "")

        if args.repair_first:
            ctx = preserve_parsed_source_fields(
                {
                    "title": row.get("pi_title") or title,
                    "description": row.get("pi_description") or "",
                    "raw_text": row.get("raw_text") or "",
                },
                row,
            )
            new_desc = build_final_marketplace_description(ctx)
            if not is_effectively_empty_marketplace_description(
                new_desc, title, min_body_len=args.min_body_len
            ):
                if args.verbose:
                    print(
                        f"{'repair' if args.execute else 'would repair'} listing {listing_id}",
                        file=sys.stderr,
                    )
                if args.execute:
                    _update_listing_description(listing_id, new_desc)
                repaired += 1
                desc = new_desc

        if is_effectively_empty_marketplace_description(
            desc, title, min_body_len=args.min_body_len
        ):
            to_hide.append(
                {
                    "listing_id": listing_id,
                    "parsed_item_id": row.get("parsed_item_id"),
                    "title": title[:80],
                    "description_preview": (desc or "")[:120],
                    "status": row.get("listing_status"),
                }
            )

    report = {
        "dry_run": dry_run,
        "scanned": len(rows),
        "repaired": repaired if args.repair_first else 0,
        "repaired_applied": repaired if args.repair_first and args.execute else 0,
        "to_hide_count": len(to_hide),
        "to_hide": to_hide[:500],
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))

    if dry_run:
        print(
            f"\nDry-run: знайдено {len(to_hide)} оголошень без опису. "
            "Запустіть з --execute або --execute --repair-first",
            file=sys.stderr,
        )
        return

    hidden = 0
    for item in to_hide:
        lid = int(item["listing_id"])
        if args.verbose:
            print(f"hide listing {lid}", file=sys.stderr)
        _hide_listing(lid)
        hidden += 1

    print(f"Приховано оголошень: {hidden}", file=sys.stderr)


if __name__ == "__main__":
    main()
