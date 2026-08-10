"""Очищення застарілих і невикористовуваних фото парсера."""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable, Optional

from parser.storage.connection import BASE_DIR, get_connection

logger = logging.getLogger(__name__)

PHOTOS_DIR = BASE_DIR / "database" / "parsed_photos"
PUBLIC_ORIGINALS_DIR = BASE_DIR / "app" / "public" / "listings" / "originals"

_BATCH_ROWS = 250
_COMMIT_EVERY = 200
_PROGRESS_EVERY = 500


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


def _progress(msg: str, on_progress: Callable[[str], None] | None) -> None:
    if on_progress:
        on_progress(msg)
    else:
        logger.info(msg)


def _iter_query_rows(cursor, sql: str, params: tuple = ()) -> Any:
    cursor.execute(sql, params)
    while True:
        rows = cursor.fetchmany(_BATCH_ROWS)
        if not rows:
            break
        for row in rows:
            yield row


def _build_listing_image_basenames(cursor) -> frozenset[str]:
    basenames: set[str] = set()
    for row in _iter_query_rows(
        cursor,
        "SELECT images FROM Listing WHERE images IS NOT NULL AND TRIM(images) NOT IN ('', '[]')",
    ):
        for ref in _load_images_json(row["images"]):
            bn = _basename_from_image_ref(ref)
            if bn:
                basenames.add(bn)
    return frozenset(basenames)


def _build_parsed_referenced_basenames(cursor) -> frozenset[str]:
    basenames: set[str] = set()
    for row in _iter_query_rows(
        cursor,
        """
        SELECT images_json FROM parsed_items
        WHERE images_json IS NOT NULL
          AND TRIM(images_json) NOT IN ('', '[]')
        """,
    ):
        for ref in _load_images_json(row["images_json"]):
            path = _normalize_parsed_image_path(ref)
            if path is not None:
                basenames.add(path.name)
    return frozenset(basenames)


def _row_is_protected(basenames: list[str], listing_basenames: frozenset[str]) -> bool:
    return any(bn in listing_basenames for bn in basenames)


def _delete_file(
    path: Path,
    dry_run: bool,
    stats: dict[str, Any],
    pending_commits: list[int],
) -> bool:
    if not path.is_file():
        return True
    try:
        size = path.stat().st_size
    except OSError as e:
        stats["errors"].append(f"stat {path}: {e}")
        return False
    if dry_run:
        stats["files_deleted"] += 1
        stats["bytes_freed"] += size
        return True
    try:
        path.unlink()
        stats["files_deleted"] += 1
        stats["bytes_freed"] += size
        pending_commits[0] += 1
        return True
    except OSError as e:
        stats["errors"].append(f"unlink {path}: {e}")
        return False


def _maybe_commit(conn, pending_commits: list[int], dry_run: bool) -> None:
    if dry_run or pending_commits[0] < _COMMIT_EVERY:
        return
    conn.commit()
    pending_commits[0] = 0


def _clear_parsed_item_images(
    cursor,
    conn,
    item_id: int,
    dry_run: bool,
    stats: dict[str, Any],
    pending_commits: list[int],
) -> None:
    if dry_run:
        stats["parsed_items_cleared"] += 1
        return
    cursor.execute(
        "UPDATE parsed_items SET images_json = '[]' WHERE id = ?",
        (item_id,),
    )
    stats["parsed_items_cleared"] += 1
    pending_commits[0] += 1
    _maybe_commit(conn, pending_commits, dry_run)


def _cleanup_parsed_item_row(
    cursor,
    conn,
    item_id: int,
    refs: list[str],
    dry_run: bool,
    stats: dict[str, Any],
    listing_basenames: frozenset[str],
    pending_commits: list[int],
) -> None:
    basenames: list[str] = []
    for ref in refs:
        path = _normalize_parsed_image_path(ref)
        if path is not None:
            basenames.append(path.name)

    if _row_is_protected(basenames, listing_basenames):
        stats["skipped_rows_in_use"] += 1
        return

    row_ok = True
    for ref in refs:
        path = _normalize_parsed_image_path(ref)
        if path is None or not path.is_file():
            continue
        if not _delete_file(path, dry_run, stats, pending_commits):
            row_ok = False
        _maybe_commit(conn, pending_commits, dry_run)

    if row_ok:
        _clear_parsed_item_images(cursor, conn, item_id, dry_run, stats, pending_commits)


def _cleanup_parsed_item_batches(
    cursor,
    conn,
    sql: str,
    params: tuple,
    dry_run: bool,
    stats: dict[str, Any],
    stat_key: str,
    listing_basenames: frozenset[str],
    pending_commits: list[int],
    on_progress: Callable[[str], None] | None,
) -> None:
    processed = 0
    for row in _iter_query_rows(cursor, sql, params):
        refs = _load_images_json(row["images_json"])
        if not refs:
            continue
        stats[stat_key] += 1
        processed += 1
        _cleanup_parsed_item_row(
            cursor,
            conn,
            row["id"],
            refs,
            dry_run,
            stats,
            listing_basenames,
            pending_commits,
        )
        if processed % _PROGRESS_EVERY == 0:
            _progress(f"cleanup: {stat_key} processed={processed}", on_progress)


def _cleanup_orphan_parsed_files(
    conn,
    dry_run: bool,
    stats: dict[str, Any],
    referenced: frozenset[str],
    listing_basenames: frozenset[str],
    pending_commits: list[int],
    on_progress: Callable[[str], None] | None,
) -> None:
    if not PHOTOS_DIR.is_dir():
        return

    scanned = 0
    try:
        with os.scandir(PHOTOS_DIR) as it:
            for entry in it:
                if not entry.is_file(follow_symlinks=False):
                    continue
                scanned += 1
                name = entry.name
                if name in referenced or name in listing_basenames:
                    continue
                stats["orphan_files"] += 1
                if not _delete_file(Path(entry.path), dry_run, stats, pending_commits):
                    continue
                _maybe_commit(conn, pending_commits, dry_run)
                if scanned % _PROGRESS_EVERY == 0:
                    _progress(
                        f"cleanup: orphan scan scanned={scanned} deleted={stats['orphan_files']}",
                        on_progress,
                    )
    except OSError as e:
        stats["errors"].append(f"scandir {PHOTOS_DIR}: {e}")


def _cleanup_public_parser_orphans(
    conn,
    dry_run: bool,
    stats: dict[str, Any],
    listing_basenames: frozenset[str],
    public_orphan_days: int,
    pending_commits: list[int],
    on_progress: Callable[[str], None] | None,
) -> None:
    if not PUBLIC_ORIGINALS_DIR.is_dir():
        return

    cutoff = (
        datetime.now(timezone.utc) - timedelta(days=public_orphan_days)
        if public_orphan_days > 0
        else None
    )
    scanned = 0

    for pattern in ("parser_*", "pi*"):
        for path in PUBLIC_ORIGINALS_DIR.glob(pattern):
            if not path.is_file():
                continue
            scanned += 1
            name = path.name
            if name in listing_basenames:
                continue
            if cutoff is not None:
                try:
                    mtime = datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc)
                except OSError as e:
                    stats["errors"].append(f"stat {path}: {e}")
                    continue
                if mtime > cutoff:
                    continue
            stats["public_orphan_files"] += 1
            if not _delete_file(path, dry_run, stats, pending_commits):
                continue
            _maybe_commit(conn, pending_commits, dry_run)
            if scanned % _PROGRESS_EVERY == 0:
                _progress(
                    f"cleanup: public orphans scanned={scanned} deleted={stats['public_orphan_files']}",
                    on_progress,
                )


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
    on_progress: Callable[[str], None] | None = None,
) -> dict[str, Any]:
    """
    Комплексне очищення фото парсера (оптимізовано для VPS: без LIKE, батчі, commit кожні N файлів).
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

    _progress("cleanup: loading Listing image index…", on_progress)
    conn = get_connection()
    cursor = conn.cursor()
    listing_basenames = _build_listing_image_basenames(cursor)
    referenced_parsed = _build_parsed_referenced_basenames(cursor)
    _progress(
        f"cleanup: listing_images={len(listing_basenames)} parsed_refs={len(referenced_parsed)}",
        on_progress,
    )

    pending_commits = [0]
    time_mod = f"-{days} days"

    if delete_rejected:
        _progress("cleanup: rejected rows…", on_progress)
        _cleanup_parsed_item_batches(
            cursor,
            conn,
            """
            SELECT id, images_json
            FROM parsed_items
            WHERE images_json IS NOT NULL
              AND TRIM(images_json) NOT IN ('', '[]')
              AND (
                    LOWER(COALESCE(status, '')) = 'rejected'
                 OR (
                        LOWER(COALESCE(marketplace_mod_status, '')) = 'rejected'
                    AND LOWER(COALESCE(channel_mod_status, '')) = 'rejected'
                 )
              )
            """,
            (),
            dry_run,
            stats,
            "rejected_rows",
            listing_basenames,
            pending_commits,
            on_progress,
        )

    if delete_stale_pending:
        _progress("cleanup: stale pending rows…", on_progress)
        _cleanup_parsed_item_batches(
            cursor,
            conn,
            """
            SELECT id, images_json
            FROM parsed_items
            WHERE marketplace_listing_id IS NULL
              AND images_json IS NOT NULL
              AND TRIM(images_json) NOT IN ('', '[]')
              AND datetime(created_at) < datetime('now', ?)
              AND LOWER(COALESCE(status, 'pending')) != 'rejected'
            """,
            (time_mod,),
            dry_run,
            stats,
            "stale_pending_rows",
            listing_basenames,
            pending_commits,
            on_progress,
        )

    if delete_published:
        _progress("cleanup: published rows…", on_progress)
        _cleanup_parsed_item_batches(
            cursor,
            conn,
            """
            SELECT id, images_json
            FROM parsed_items
            WHERE marketplace_listing_id IS NOT NULL
              AND images_json IS NOT NULL
              AND TRIM(images_json) NOT IN ('', '[]')
            """,
            (),
            dry_run,
            stats,
            "published_rows",
            listing_basenames,
            pending_commits,
            on_progress,
        )

    if delete_orphans:
        _progress("cleanup: orphan files in parsed_photos/…", on_progress)
        _cleanup_orphan_parsed_files(
            conn,
            dry_run,
            stats,
            referenced_parsed,
            listing_basenames,
            pending_commits,
            on_progress,
        )

    if delete_public_orphans:
        _progress("cleanup: public parser orphans…", on_progress)
        _cleanup_public_parser_orphans(
            conn,
            dry_run,
            stats,
            listing_basenames,
            public_orphan_days,
            pending_commits,
            on_progress,
        )

    if not dry_run:
        conn.commit()
    conn.close()

    _progress(
        f"cleanup: done deleted={stats['files_deleted']} freed={stats['bytes_freed']} bytes",
        on_progress,
    )

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


def run_auto_parsed_photos_cleanup() -> dict[str, Any]:
    """Автоочистка parsed_photos (після парсингу / cron)."""
    from parser.config.settings import (
        PARSER_PHOTOS_AUTO_CLEANUP,
        PARSER_PHOTOS_CLEANUP_DAYS,
        PARSER_PHOTOS_CLEANUP_PUBLIC,
        PARSER_PHOTOS_PUBLIC_ORPHAN_DAYS,
    )

    if not PARSER_PHOTOS_AUTO_CLEANUP:
        return {"skipped": True, "reason": "PARSER_PHOTOS_AUTO_CLEANUP=0"}

    result = cleanup_unused_parsed_photos(
        days=PARSER_PHOTOS_CLEANUP_DAYS,
        dry_run=False,
        delete_rejected=True,
        delete_stale_pending=True,
        delete_published=True,
        delete_orphans=True,
        delete_public_orphans=PARSER_PHOTOS_CLEANUP_PUBLIC,
        public_orphan_days=PARSER_PHOTOS_PUBLIC_ORPHAN_DAYS,
    )
    if result.get("files_deleted") or result.get("parsed_items_cleared"):
        logger.info(
            "auto parsed photos cleanup: deleted=%s freed=%s bytes cleared_rows=%s orphans=%s public_orphans=%s",
            result.get("files_deleted", 0),
            result.get("bytes_freed", 0),
            result.get("parsed_items_cleared", 0),
            result.get("orphan_files", 0),
            result.get("public_orphan_files", 0),
        )
    return result
