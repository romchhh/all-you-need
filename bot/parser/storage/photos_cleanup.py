"""Очищення застарілих фото парсера."""

import json
import logging
from pathlib import Path
from typing import Any, Optional

from parser.storage.connection import BASE_DIR, get_connection

logger = logging.getLogger(__name__)

PHOTOS_DIR = BASE_DIR / "database" / "parsed_photos"


def _normalize_parsed_image_path(ref: str) -> Optional[Path]:
    if not ref or not isinstance(ref, str):
        return None
    r = ref.replace("\\", "/").strip()
    if ".." in r or r.startswith("http://") or r.startswith("https://"):
        return None
    r = r.lstrip("/")
    if r.startswith("database/parsed_photos/"):
        p = BASE_DIR / r
    elif r.startswith("parsed_photos/"):
        p = BASE_DIR / "database" / r
    else:
        return None
    try:
        resolved = p.resolve()
        base_resolved = (BASE_DIR / "database" / "parsed_photos").resolve()
        if not str(resolved).startswith(str(base_resolved)):
            return None
    except OSError:
        return None
    return resolved


def cleanup_stale_parsed_photos(
    days: int = 30,
    dry_run: bool = False,
) -> dict[str, Any]:
    if days < 1 or days > 3650:
        raise ValueError("days must be between 1 and 3650")

    stats: dict[str, Any] = {
        "files_deleted": 0,
        "bytes_freed": 0,
        "parsed_items_cleared": 0,
        "skipped_rows_in_use": 0,
        "errors": [],
    }

    time_mod = f"-{days} days"
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT id, images_json
        FROM parsed_items
        WHERE marketplace_listing_id IS NULL
          AND images_json IS NOT NULL
          AND TRIM(images_json) != ''
          AND TRIM(images_json) != '[]'
          AND datetime(created_at) < datetime('now', ?)
        """,
        (time_mod,),
    )
    rows = cursor.fetchall()
    rows_would_clear = 0

    for row in rows:
        item_id = row["id"]
        try:
            raw = row["images_json"] or "[]"
            refs = json.loads(raw)
        except (json.JSONDecodeError, TypeError) as e:
            stats["errors"].append(f"parsed_items id={item_id}: bad images_json: {e}")
            continue

        if not isinstance(refs, list):
            stats["errors"].append(f"parsed_items id={item_id}: images_json is not a list")
            continue

        basenames: list[str] = []
        for ref in refs:
            if not ref:
                continue
            p = _normalize_parsed_image_path(str(ref))
            if p is not None:
                basenames.append(p.name)

        row_protected = False
        for bn in basenames:
            cursor.execute(
                "SELECT 1 FROM Listing WHERE images LIKE ? LIMIT 1",
                (f"%{bn}%",),
            )
            if cursor.fetchone():
                row_protected = True
                logger.warning(
                    "cleanup_parsed_photos: skip parsed_items id=%s — %s still in Listing.images",
                    item_id,
                    bn,
                )
                break

        if row_protected:
            stats["skipped_rows_in_use"] += 1
            continue

        row_ok = True
        for ref in refs:
            if not ref:
                continue
            path = _normalize_parsed_image_path(str(ref))
            if path is None:
                continue
            if not path.is_file():
                continue
            size = path.stat().st_size
            if dry_run:
                stats["files_deleted"] += 1
                stats["bytes_freed"] += size
                continue
            try:
                path.unlink()
                stats["files_deleted"] += 1
                stats["bytes_freed"] += size
            except OSError as e:
                row_ok = False
                stats["errors"].append(f"unlink {path}: {e}")

        if dry_run and row_ok:
            rows_would_clear += 1
        elif not dry_run and row_ok:
            cursor.execute(
                "UPDATE parsed_items SET images_json = '[]' WHERE id = ?",
                (item_id,),
            )
            stats["parsed_items_cleared"] += 1

    if not dry_run:
        conn.commit()
    conn.close()

    if dry_run:
        stats["parsed_items_cleared"] = rows_would_clear
        stats["note"] = (
            "dry_run: files_deleted/bytes_freed — прогноз; parsed_items_cleared — "
            "скільки рядків отримали б images_json=[]; БД не змінювалась"
        )
    return stats
