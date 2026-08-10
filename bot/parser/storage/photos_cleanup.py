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


def _file_is_too_old(path: Path, cutoff: datetime) -> bool:
    try:
        mtime = datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc)
    except OSError:
        return False
    return mtime <= cutoff


def _delete_file(
    path: Path,
    dry_run: bool,
    stats: dict[str, Any],
    pending_commits: list[int],
    reason: str = "unused",
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
        if reason == "too_old":
            stats["too_old_deleted"] += 1
        return True
    try:
        path.unlink()
        stats["files_deleted"] += 1
        stats["bytes_freed"] += size
        if reason == "too_old":
            stats["too_old_deleted"] += 1
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


def _update_parsed_item_images(
    cursor,
    conn,
    item_id: int,
    refs: list[str],
    dry_run: bool,
    stats: dict[str, Any],
    pending_commits: list[int],
) -> None:
    if dry_run:
        stats["parsed_items_images_trimmed"] += 1
        return
    cursor.execute(
        "UPDATE parsed_items SET images_json = ? WHERE id = ?",
        (json.dumps(refs, ensure_ascii=False), item_id),
    )
    stats["parsed_items_images_trimmed"] += 1
    pending_commits[0] += 1
    _maybe_commit(conn, pending_commits, dry_run)


def _delete_parsed_item_row(
    cursor,
    conn,
    item_id: int,
    dry_run: bool,
    stats: dict[str, Any],
    pending_commits: list[int],
) -> None:
    if dry_run:
        stats["parsed_items_deleted"] += 1
        return
    cursor.execute("DELETE FROM parsed_items WHERE id = ?", (item_id,))
    stats["parsed_items_deleted"] += 1
    pending_commits[0] += 1
    _maybe_commit(conn, pending_commits, dry_run)


def _cleanup_old_parsed_photos_on_disk(
    conn,
    dry_run: bool,
    stats: dict[str, Any],
    listing_basenames: frozenset[str],
    cutoff: datetime,
    pending_commits: list[int],
    on_progress: Callable[[str], None] | None,
) -> None:
    """Видалити файли parsed_photos/: не в Listing і старіші за cutoff."""
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
                path = Path(entry.path)

                if name in listing_basenames:
                    stats["skipped_in_use"] += 1
                    continue

                if not _file_is_too_old(path, cutoff):
                    stats["skipped_too_recent"] += 1
                    continue

                stats["too_old_candidates"] += 1
                if not _delete_file(path, dry_run, stats, pending_commits, reason="too_old"):
                    continue
                _maybe_commit(conn, pending_commits, dry_run)

                if scanned % _PROGRESS_EVERY == 0:
                    _progress(
                        f"cleanup: надто старі — переглянуто {scanned}, "
                        f"видалено {stats['too_old_deleted']}",
                        on_progress,
                    )
    except OSError as e:
        stats["errors"].append(f"scandir {PHOTOS_DIR}: {e}")


def _sync_parsed_items_images_in_db(
    cursor,
    conn,
    dry_run: bool,
    stats: dict[str, Any],
    listing_basenames: frozenset[str],
    cutoff: datetime,
    time_mod: str,
    pending_commits: list[int],
    on_progress: Callable[[str], None] | None,
) -> None:
    """Синхронізувати parsed_items.images_json з диском після видалення фото."""
    processed = 0
    for row in _iter_query_rows(
        cursor,
        """
        SELECT id, images_json, created_at
        FROM parsed_items
        WHERE images_json IS NOT NULL
          AND TRIM(images_json) NOT IN ('', '[]')
        """,
    ):
        refs = _load_images_json(row["images_json"])
        if not refs:
            continue

        basenames: list[str] = []
        kept_refs: list[str] = []
        for ref in refs:
            path = _normalize_parsed_image_path(ref)
            if path is None:
                continue
            basenames.append(path.name)
            if path.name in listing_basenames:
                kept_refs.append(ref)
                continue
            if path.is_file() and not _file_is_too_old(path, cutoff):
                kept_refs.append(ref)

        if _any_in_listing(basenames, listing_basenames):
            if kept_refs != refs:
                processed += 1
                if kept_refs:
                    _update_parsed_item_images(
                        cursor, conn, row["id"], kept_refs, dry_run, stats, pending_commits
                    )
                else:
                    _clear_parsed_item_images(
                        cursor, conn, row["id"], dry_run, stats, pending_commits
                    )
            continue

        row_old = _row_created_before(row["created_at"], time_mod, cursor)
        all_gone = all(
            (p := _normalize_parsed_image_path(ref)) is None or not p.is_file()
            for ref in refs
        )

        if row_old or all_gone or not kept_refs:
            processed += 1
            _clear_parsed_item_images(cursor, conn, row["id"], dry_run, stats, pending_commits)
        elif kept_refs != refs:
            processed += 1
            _update_parsed_item_images(
                cursor, conn, row["id"], kept_refs, dry_run, stats, pending_commits
            )

        if processed % _PROGRESS_EVERY == 0:
            _progress(
                f"cleanup: БД images_json — оновлено {processed} "
                f"(очищено {stats['parsed_items_cleared']}, "
                f"підрізано {stats['parsed_items_images_trimmed']})",
                on_progress,
            )


def _delete_old_parsed_items_from_db(
    cursor,
    conn,
    dry_run: bool,
    stats: dict[str, Any],
    time_mod: str,
    pending_commits: list[int],
    on_progress: Callable[[str], None] | None,
) -> None:
    """
    Видалити застарілі рядки parsed_items (> N днів):
    rejected, опубліковані (є listing), або без фото (images_json порожній).
    """
    deleted_batch = 0
    for row in _iter_query_rows(
        cursor,
        """
        SELECT id, status, marketplace_mod_status, channel_mod_status,
               marketplace_listing_id, images_json
        FROM parsed_items
        WHERE datetime(created_at) < datetime('now', ?)
        """,
        (time_mod,),
    ):
        status = (row["status"] or "").strip().lower()
        mp = (row["marketplace_mod_status"] or status or "pending").strip().lower()
        ch = (row["channel_mod_status"] or status or "pending").strip().lower()
        images_raw = (row["images_json"] or "").strip()
        has_listing = row["marketplace_listing_id"] is not None
        no_images = images_raw in ("", "[]")

        should_delete = (
            status == "rejected"
            or (mp == "rejected" and ch == "rejected")
            or has_listing
            or no_images
        )
        if not should_delete:
            stats["parsed_items_kept"] += 1
            continue

        deleted_batch += 1
        _delete_parsed_item_row(cursor, conn, row["id"], dry_run, stats, pending_commits)

        if deleted_batch % _PROGRESS_EVERY == 0:
            _progress(
                f"cleanup: БД parsed_items — видалено {stats['parsed_items_deleted']} застарілих рядків",
                on_progress,
            )


def _cleanup_old_parsed_item_rows(
    cursor,
    conn,
    dry_run: bool,
    stats: dict[str, Any],
    listing_basenames: frozenset[str],
    cutoff: datetime,
    time_mod: str,
    pending_commits: list[int],
    on_progress: Callable[[str], None] | None,
) -> None:
    """Видалити файли з parsed_items старіших за N днів (допоміжний прохід перед sync БД)."""
    processed = 0
    for row in _iter_query_rows(
        cursor,
        """
        SELECT id, images_json, created_at
        FROM parsed_items
        WHERE images_json IS NOT NULL
          AND TRIM(images_json) NOT IN ('', '[]')
          AND datetime(created_at) < datetime('now', ?)
        """,
        (time_mod,),
    ):
        refs = _load_images_json(row["images_json"])
        if not refs:
            continue

        basenames: list[str] = []
        paths: list[Path] = []
        for ref in refs:
            path = _normalize_parsed_image_path(ref)
            if path is not None:
                basenames.append(path.name)
                paths.append(path)

        if _any_in_listing(basenames, listing_basenames):
            stats["skipped_rows_in_use"] += 1
            continue

        processed += 1
        stats["stale_parsed_rows"] += 1

        for path in paths:
            if not path.is_file():
                continue
            if path.name in listing_basenames:
                continue
            if not _file_is_too_old(path, cutoff):
                continue
            _delete_file(path, dry_run, stats, pending_commits, reason="too_old")
            _maybe_commit(conn, pending_commits, dry_run)

        if processed % _PROGRESS_EVERY == 0:
            _progress(f"cleanup: parsed_items файли — оброблено {processed}", on_progress)


def _any_in_listing(basenames: list[str], listing_basenames: frozenset[str]) -> bool:
    return any(bn in listing_basenames for bn in basenames)


def _row_created_before(created_at: Any, time_mod: str, cursor) -> bool:
    if not created_at:
        return True
    cursor.execute(
        "SELECT 1 WHERE datetime(?) < datetime('now', ?)",
        (str(created_at), time_mod),
    )
    return cursor.fetchone() is not None


def _cleanup_old_public_parser_photos(
    conn,
    dry_run: bool,
    stats: dict[str, Any],
    listing_basenames: frozenset[str],
    cutoff: datetime,
    pending_commits: list[int],
    on_progress: Callable[[str], None] | None,
) -> None:
    if not PUBLIC_ORIGINALS_DIR.is_dir():
        return

    scanned = 0
    for pattern in ("parser_*", "pi*"):
        for path in PUBLIC_ORIGINALS_DIR.glob(pattern):
            if not path.is_file():
                continue
            scanned += 1
            if path.name in listing_basenames:
                stats["skipped_in_use"] += 1
                continue
            if not _file_is_too_old(path, cutoff):
                stats["skipped_too_recent"] += 1
                continue
            stats["public_too_old_deleted"] += 1
            if not _delete_file(path, dry_run, stats, pending_commits, reason="too_old"):
                continue
            _maybe_commit(conn, pending_commits, dry_run)
            if scanned % _PROGRESS_EVERY == 0:
                _progress(
                    f"cleanup: public надто старі — переглянуто {scanned}, "
                    f"видалено {stats['public_too_old_deleted']}",
                    on_progress,
                )


def cleanup_old_unused_parser_photos(
    days: int = 7,
    dry_run: bool = False,
    *,
    include_public: bool = True,
    on_progress: Callable[[str], None] | None = None,
) -> dict[str, Any]:
    """
    Видалити фото парсера, які:
    - не використовуються в Listing.images
    - старіші за `days` днів (за mtime файлу або created_at parsed_items)

    Без підтвердження — dry_run=False видаляє одразу.
    """
    if days < 1 or days > 3650:
        raise ValueError("days must be between 1 and 3650")

    stats: dict[str, Any] = {
        "files_deleted": 0,
        "bytes_freed": 0,
        "too_old_deleted": 0,
        "too_old_candidates": 0,
        "public_too_old_deleted": 0,
        "parsed_items_cleared": 0,
        "parsed_items_images_trimmed": 0,
        "parsed_items_deleted": 0,
        "parsed_items_kept": 0,
        "stale_parsed_rows": 0,
        "skipped_in_use": 0,
        "skipped_too_recent": 0,
        "skipped_rows_in_use": 0,
        "errors": [],
        "days": days,
        "reason": "надто старі та не використовуються в оголошеннях",
    }

    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    time_mod = f"-{days} days"

    _progress(f"cleanup: правило — старіші {days} дн., не в Listing → видалити", on_progress)
    _progress("cleanup: завантаження індексу Listing…", on_progress)

    conn = get_connection()
    cursor = conn.cursor()
    listing_basenames = _build_listing_image_basenames(cursor)
    _progress(f"cleanup: фото в оголошеннях (захищені): {len(listing_basenames)}", on_progress)

    pending_commits = [0]

    _progress("cleanup: parsed_photos/ — надто старі…", on_progress)
    _cleanup_old_parsed_photos_on_disk(
        conn, dry_run, stats, listing_basenames, cutoff, pending_commits, on_progress
    )

    _progress("cleanup: parsed_items — файли старіших за поріг…", on_progress)
    _cleanup_old_parsed_item_rows(
        cursor, conn, dry_run, stats, listing_basenames, cutoff, time_mod, pending_commits, on_progress
    )

    _progress("cleanup: БД — синхронізація images_json…", on_progress)
    _sync_parsed_items_images_in_db(
        cursor, conn, dry_run, stats, listing_basenames, cutoff, time_mod, pending_commits, on_progress
    )

    _progress("cleanup: БД — видалення застарілих parsed_items…", on_progress)
    _delete_old_parsed_items_from_db(
        cursor, conn, dry_run, stats, time_mod, pending_commits, on_progress
    )

    if include_public:
        _progress("cleanup: public parser/pi* — надто старі…", on_progress)
        _cleanup_old_public_parser_photos(
            conn, dry_run, stats, listing_basenames, cutoff, pending_commits, on_progress
        )

    if not dry_run:
        conn.commit()
    conn.close()

    _progress(
        f"cleanup: готово — файли {stats['files_deleted']} (надто старі {stats['too_old_deleted']}), "
        f"БД images_json очищено {stats['parsed_items_cleared']}, "
        f"рядків видалено {stats['parsed_items_deleted']}",
        on_progress,
    )

    if dry_run:
        stats["note"] = "dry_run: лише прогноз, файли та БД не змінювались"
    return stats


def cleanup_unused_parsed_photos(
    days: int = 7,
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
    """Зворотна сумісність — делегує в age-based cleanup."""
    del delete_rejected, delete_stale_pending, delete_published, delete_orphans, public_orphan_days
    return cleanup_old_unused_parser_photos(
        days=days,
        dry_run=dry_run,
        include_public=delete_public_orphans,
        on_progress=on_progress,
    )


def cleanup_stale_parsed_photos(
    days: int = 7,
    dry_run: bool = False,
) -> dict[str, Any]:
    return cleanup_old_unused_parser_photos(days=days, dry_run=dry_run, include_public=False)


def run_auto_parsed_photos_cleanup() -> dict[str, Any]:
    """Автоочистка без підтвердження — після парсингу / cron."""
    from parser.config.settings import (
        PARSER_PHOTOS_AUTO_CLEANUP,
        PARSER_PHOTOS_CLEANUP_DAYS,
        PARSER_PHOTOS_CLEANUP_PUBLIC,
    )

    if not PARSER_PHOTOS_AUTO_CLEANUP:
        return {"skipped": True, "reason": "PARSER_PHOTOS_AUTO_CLEANUP=0"}

    result = cleanup_old_unused_parser_photos(
        days=PARSER_PHOTOS_CLEANUP_DAYS,
        dry_run=False,
        include_public=PARSER_PHOTOS_CLEANUP_PUBLIC,
    )
    if result.get("files_deleted") or result.get("parsed_items_cleared") or result.get("parsed_items_deleted"):
        logger.info(
            "auto parsed photos cleanup (надто старі >%sd): files=%s db_cleared=%s db_deleted=%s freed=%s",
            result.get("days", 7),
            result.get("files_deleted", 0),
            result.get("parsed_items_cleared", 0),
            result.get("parsed_items_deleted", 0),
            result.get("bytes_freed", 0),
        )
    return result
