"""Очищення застарілих і невикористовуваних фото парсера."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

from parser.storage.connection import BASE_DIR, get_connection

logger = logging.getLogger(__name__)

PHOTOS_DIR = BASE_DIR / "database" / "parsed_photos"
PUBLIC_ORIGINALS_DIR = BASE_DIR / "app" / "public" / "listings" / "originals"


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
        base_resolved = PHOTOS_DIR.resolve()
        if not str(resolved).startswith(str(base_resolved)):
            return None
    except OSError:
        return None
    return resolved


def _basename_from_image_ref(ref: str) -> Optional[str]:
    if not ref or not isinstance(ref, str):
        return None
    r = ref.replace("\\", "/").strip().rstrip("/")
    if not r or r.startswith("http://") or r.startswith("https://"):
        return None
    return Path(r).name or None


def _load_images_json(raw: Any) -> list[str]:
    if raw is None:
        return []
    if isinstance(raw, list):
        return [str(x) for x in raw if x]
    try:
        parsed = json.loads(raw or "[]")
    except (json.JSONDecodeError, TypeError):
        return []
    if not isinstance(parsed, list):
        return []
    return [str(x) for x in parsed if x]


def _listing_references_basename(cursor, basename: str) -> bool:
    cursor.execute(
        "SELECT 1 FROM Listing WHERE images LIKE ? LIMIT 1",
        (f"%{basename}%",),
    )
    return cursor.fetchone() is not None


def _collect_referenced_parsed_basenames(cursor) -> set[str]:
    basenames: set[str] = set()
    cursor.execute("SELECT images_json FROM parsed_items WHERE images_json IS NOT NULL")
    for row in cursor.fetchall():
        for ref in _load_images_json(row["images_json"]):
            path = _normalize_parsed_image_path(ref)
            if path is not None:
                basenames.add(path.name)
    cursor.execute("SELECT images FROM Listing WHERE images IS NOT NULL")
    for row in cursor.fetchall():
        for ref in _load_images_json(row["images"]):
            bn = _basename_from_image_ref(ref)
            if bn and _normalize_parsed_image_path(f"database/parsed_photos/{bn}"):
                basenames.add(bn)
    return basenames


def _collect_listing_image_basenames(cursor) -> set[str]:
    basenames: set[str] = set()
    cursor.execute("SELECT images FROM Listing WHERE images IS NOT NULL")
    for row in cursor.fetchall():
        for ref in _load_images_json(row["images"]):
            bn = _basename_from_image_ref(ref)
            if bn:
                basenames.add(bn)
    return basenames


def _delete_file(path: Path, dry_run: bool, stats: dict[str, Any]) -> bool:
    if not path.is_file():
        return True
    size = path.stat().st_size
    if dry_run:
        stats["files_deleted"] += 1
        stats["bytes_freed"] += size
        return True
    try:
        path.unlink()
        stats["files_deleted"] += 1
        stats["bytes_freed"] += size
        return True
    except OSError as e:
        stats["errors"].append(f"unlink {path}: {e}")
        return False


def _clear_parsed_item_images(
    cursor,
    item_id: int,
    dry_run: bool,
    stats: dict[str, Any],
) -> None:
    if dry_run:
        stats["parsed_items_cleared"] += 1
        return
    cursor.execute(
        "UPDATE parsed_items SET images_json = '[]' WHERE id = ?",
        (item_id,),
    )
    stats["parsed_items_cleared"] += 1


def _cleanup_parsed_item_row(
    cursor,
    item_id: int,
    refs: list[str],
    dry_run: bool,
    stats: dict[str, Any],
) -> None:
    basenames: list[str] = []
    for ref in refs:
        path = _normalize_parsed_image_path(ref)
        if path is not None:
            basenames.append(path.name)

    for bn in basenames:
        if _listing_references_basename(cursor, bn):
            stats["skipped_rows_in_use"] += 1
            logger.warning(
                "cleanup_parsed_photos: skip parsed_items id=%s — %s still in Listing.images",
                item_id,
                bn,
            )
            return

    row_ok = True
    for ref in refs:
        path = _normalize_parsed_image_path(ref)
        if path is None or not path.is_file():
            continue
        if not _delete_file(path, dry_run, stats):
            row_ok = False

    if row_ok:
        _clear_parsed_item_images(cursor, item_id, dry_run, stats)


def cleanup_unused_parsed_photos(
    days: int = 30,
    dry_run: bool = False,
    *,
    delete_rejected: bool = True,
    delete_stale_pending: bool = True,
    delete_published: bool = True,
    delete_orphans: bool = True,
    delete_public_orphans: bool = False,
    public_orphan_days: int = 7,
) -> dict[str, Any]:
    """
    Комплексне очищення фото парсера.

    - rejected: відхилені parsed_items (будь-який вік)
    - stale pending: без marketplace_listing_id, старіші за `days`
    - published: уже опубліковані (є marketplace_listing_id), фото скопійовано в public
    - orphans: файли в parsed_photos/, на які немає посилань у БД і Listing
    - public orphans: parser_* у public/listings/originals без посилань у Listing (опційно)
    """
    if days < 1 or days > 3650:
        raise ValueError("days must be between 1 and 3650")
    if public_orphan_days < 0 or public_orphan_days > 3650:
        raise ValueError("public_orphan_days must be between 0 and 3650")

    stats: dict[str, Any] = {
        "files_deleted": 0,
        "bytes_freed": 0,
        "parsed_items_cleared": 0,
        "skipped_rows_in_use": 0,
        "rejected_rows": 0,
        "stale_pending_rows": 0,
        "published_rows": 0,
        "orphan_files": 0,
        "public_orphan_files": 0,
        "errors": [],
    }

    time_mod = f"-{days} days"
    conn = get_connection()
    cursor = conn.cursor()

    if delete_rejected:
        cursor.execute(
            """
            SELECT id, images_json
            FROM parsed_items
            WHERE images_json IS NOT NULL
              AND TRIM(images_json) != ''
              AND TRIM(images_json) != '[]'
              AND (
                    LOWER(COALESCE(status, '')) = 'rejected'
                 OR (
                        LOWER(COALESCE(marketplace_mod_status, '')) = 'rejected'
                    AND LOWER(COALESCE(channel_mod_status, '')) = 'rejected'
                 )
              )
            """
        )
        for row in cursor.fetchall():
            refs = _load_images_json(row["images_json"])
            if not refs:
                continue
            stats["rejected_rows"] += 1
            _cleanup_parsed_item_row(cursor, row["id"], refs, dry_run, stats)

    if delete_stale_pending:
        cursor.execute(
            """
            SELECT id, images_json
            FROM parsed_items
            WHERE marketplace_listing_id IS NULL
              AND images_json IS NOT NULL
              AND TRIM(images_json) != ''
              AND TRIM(images_json) != '[]'
              AND datetime(created_at) < datetime('now', ?)
              AND LOWER(COALESCE(status, 'pending')) != 'rejected'
            """,
            (time_mod,),
        )
        for row in cursor.fetchall():
            refs = _load_images_json(row["images_json"])
            if not refs:
                continue
            stats["stale_pending_rows"] += 1
            _cleanup_parsed_item_row(cursor, row["id"], refs, dry_run, stats)

    if delete_published:
        cursor.execute(
            """
            SELECT id, images_json
            FROM parsed_items
            WHERE marketplace_listing_id IS NOT NULL
              AND images_json IS NOT NULL
              AND TRIM(images_json) != ''
              AND TRIM(images_json) != '[]'
            """
        )
        for row in cursor.fetchall():
            refs = _load_images_json(row["images_json"])
            if not refs:
                continue
            stats["published_rows"] += 1
            _cleanup_parsed_item_row(cursor, row["id"], refs, dry_run, stats)

    if delete_orphans and PHOTOS_DIR.is_dir():
        referenced = _collect_referenced_parsed_basenames(cursor)
        for path in PHOTOS_DIR.iterdir():
            if not path.is_file():
                continue
            if path.name in referenced:
                continue
            if _listing_references_basename(cursor, path.name):
                stats["skipped_rows_in_use"] += 1
                continue
            stats["orphan_files"] += 1
            _delete_file(path, dry_run, stats)

    if delete_public_orphans and PUBLIC_ORIGINALS_DIR.is_dir():
        listing_basenames = _collect_listing_image_basenames(cursor)
        for path in PUBLIC_ORIGINALS_DIR.iterdir():
            if not path.is_file():
                continue
            name = path.name
            if not (name.startswith("parser_") or name.startswith("pi")):
                continue
            if name in listing_basenames:
                continue
            if public_orphan_days > 0:
                mtime = datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc)
                cutoff = datetime.now(timezone.utc) - timedelta(days=public_orphan_days)
                if mtime > cutoff:
                    continue
            stats["public_orphan_files"] += 1
            _delete_file(path, dry_run, stats)

    if not dry_run:
        conn.commit()
    conn.close()

    if dry_run:
        stats["note"] = (
            "dry_run: files_deleted/bytes_freed — прогноз; parsed_items_cleared — "
            "скільки рядків отримали б images_json=[]; БД не змінювалась"
        )
    return stats


def cleanup_stale_parsed_photos(
    days: int = 30,
    dry_run: bool = False,
) -> dict[str, Any]:
    """Зворотна сумісність: лише застарілі pending без marketplace_listing_id."""
    result = cleanup_unused_parsed_photos(
        days=days,
        dry_run=dry_run,
        delete_rejected=False,
        delete_stale_pending=True,
        delete_published=False,
        delete_orphans=False,
        delete_public_orphans=False,
    )
    return {
        "files_deleted": result["files_deleted"],
        "bytes_freed": result["bytes_freed"],
        "parsed_items_cleared": result["parsed_items_cleared"],
        "skipped_rows_in_use": result["skipped_rows_in_use"],
        "errors": result["errors"],
        **({"note": result["note"]} if dry_run and "note" in result else {}),
    }
