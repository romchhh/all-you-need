"""
Щоденний бекап БД → Telegram адмінам.

PostgreSQL: pg_dump (custom format, стиснутий).
SQLite (legacy): копія файлу + gzip.
"""

from __future__ import annotations

import gzip
import logging
import os
import shutil
import subprocess
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

from aiogram import Bot
from aiogram.types import FSInputFile

import tuning as _tuning
from database_functions.db_connection import (
    DB_PATH,
    get_database_url,
    is_postgres,
    pg_dsn_for_psycopg2,
)

logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent.parent.parent
BACKUP_DIR = BASE_DIR / "database" / "backups"
KYIV_TZ = ZoneInfo("Europe/Kyiv")

TELEGRAM_MAX_DOCUMENT_BYTES = 49 * 1024 * 1024


def backup_enabled() -> bool:
    return bool(_tuning.DB_BACKUP_ENABLED)


def notify_admins_enabled() -> bool:
    return bool(_tuning.DB_BACKUP_NOTIFY_ADMINS)


def backup_keep_days() -> int:
    return max(1, int(_tuning.DB_BACKUP_KEEP_DAYS))


def backup_cron_hour() -> int:
    return max(0, min(23, int(_tuning.DB_BACKUP_HOUR)))


def backup_cron_minute() -> int:
    return max(0, min(59, int(_tuning.DB_BACKUP_MINUTE)))


def backup_pg_timeout_sec() -> int:
    return max(60, int(_tuning.DB_BACKUP_PG_TIMEOUT_SEC))


def admin_telegram_ids() -> list[int]:
    ids: list[int] = []
    try:
        from database_functions.admin_db import get_all_administrators

        ids.extend(int(x) for x in get_all_administrators() if x)
    except Exception as e:
        logger.warning("daily_db_backup: admin_db: %s", e)
    if not ids:
        try:
            from config import administrators

            ids.extend(int(x) for x in administrators if x)
        except Exception as e:
            logger.warning("daily_db_backup: config administrators: %s", e)
    return sorted(set(ids))


def _timestamp_label() -> str:
    now = datetime.now(KYIV_TZ)
    return now.strftime("%Y%m%d_%H%M%S")


def _pg_connection_env() -> dict[str, str]:
    url = pg_dsn_for_psycopg2(get_database_url())
    parsed = urlparse(url)
    db_name = (parsed.path or "").lstrip("/") or "postgres"
    env = os.environ.copy()
    if parsed.hostname:
        env["PGHOST"] = parsed.hostname
    if parsed.port:
        env["PGPORT"] = str(parsed.port)
    if parsed.username:
        env["PGUSER"] = parsed.username
    if parsed.password:
        env["PGPASSWORD"] = parsed.password
    env["PGDATABASE"] = db_name
    return env


def _find_pg_dump() -> str:
    custom = (
        getattr(_tuning, "DB_BACKUP_PG_DUMP", "") or os.environ.get("PG_DUMP_PATH", "")
    ).strip()
    if custom:
        path = Path(custom)
        if path.is_file():
            return str(path)
        raise FileNotFoundError(f"DB_BACKUP_PG_DUMP / PG_DUMP_PATH не знайдено: {custom}")

    pg_root = Path("/usr/lib/postgresql")
    if pg_root.is_dir():
        version_dirs: list[tuple[int, Path]] = []
        for entry in pg_root.iterdir():
            if not entry.is_dir() or not entry.name.isdigit():
                continue
            candidate = entry / "bin" / "pg_dump"
            if candidate.is_file():
                version_dirs.append((int(entry.name), candidate))
        if version_dirs:
            version_dirs.sort(key=lambda item: item[0], reverse=True)
            return str(version_dirs[0][1])

    path = shutil.which("pg_dump")
    if path:
        return path
    for candidate in ("/usr/bin/pg_dump", "/usr/local/bin/pg_dump"):
        if Path(candidate).is_file():
            return candidate
    raise FileNotFoundError(
        "pg_dump не знайдено (встановіть postgresql-client-18 у Docker-образ bot)"
    )


def create_database_backup() -> Path:
    """Створює файл бекапу в database/backups/."""
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    label = _timestamp_label()

    if is_postgres():
        out_path = BACKUP_DIR / f"ayn_marketplace_pg_{label}.dump"
        pg_dump = _find_pg_dump()
        env = _pg_connection_env()
        cmd = [
            pg_dump,
            "--format=custom",
            "--no-owner",
            "--no-acl",
            "--file",
            str(out_path),
        ]
        logger.info("daily_db_backup: pg_dump (%s) → %s", pg_dump, out_path.name)
        proc = subprocess.run(
            cmd,
            env=env,
            capture_output=True,
            text=True,
            timeout=backup_pg_timeout_sec(),
            check=False,
        )
        if proc.returncode != 0:
            err = (proc.stderr or proc.stdout or "").strip()[:2000]
            if out_path.is_file():
                out_path.unlink(missing_ok=True)
            raise RuntimeError(f"pg_dump failed ({proc.returncode}): {err}")
        if not out_path.is_file() or out_path.stat().st_size == 0:
            raise RuntimeError("pg_dump не створив файл або файл порожній")
        return out_path

    if not DB_PATH.is_file():
        raise FileNotFoundError(f"SQLite БД не знайдено: {DB_PATH}")

    raw_copy = BACKUP_DIR / f"ayn_marketplace_{label}.db"
    gz_path = BACKUP_DIR / f"ayn_marketplace_{label}.db.gz"
    shutil.copy2(DB_PATH, raw_copy)
    try:
        with open(raw_copy, "rb") as src, gzip.open(gz_path, "wb", compresslevel=6) as dst:
            shutil.copyfileobj(src, dst)
    finally:
        raw_copy.unlink(missing_ok=True)
    logger.info("daily_db_backup: sqlite gzip → %s", gz_path.name)
    return gz_path


def cleanup_old_backups(*, keep_days: int | None = None) -> int:
    """Видаляє локальні бекапи старші за keep_days."""
    days = keep_days if keep_days is not None else backup_keep_days()
    if not BACKUP_DIR.is_dir():
        return 0
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    removed = 0
    patterns = ("ayn_marketplace_pg_*.dump", "ayn_marketplace_*.db.gz", "ayn_marketplace_*.db")
    for pattern in patterns:
        for path in BACKUP_DIR.glob(pattern):
            try:
                mtime = datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc)
            except OSError:
                continue
            if mtime < cutoff:
                try:
                    path.unlink()
                    removed += 1
                except OSError as e:
                    logger.warning("daily_db_backup: не вдалось видалити %s: %s", path, e)
    return removed


def _human_size(num_bytes: int) -> str:
    n = float(max(0, num_bytes))
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024 or unit == "GB":
            return f"{n:.1f} {unit}" if unit != "B" else f"{int(n)} B"
        n /= 1024
    return f"{num_bytes} B"


async def send_daily_backup_to_admins(bot: Bot) -> dict[str, Any]:
    """Бекап + розсилка адмінам. Повертає статистику для логів."""
    stats: dict[str, Any] = {
        "ok": False,
        "path": None,
        "size": 0,
        "sent": 0,
        "failed": 0,
        "skipped_notify": False,
        "error": None,
    }
    if not backup_enabled():
        stats["skipped_notify"] = True
        stats["error"] = "disabled"
        return stats

    backup_path: Path | None = None
    try:
        backup_path = create_database_backup()
        size = backup_path.stat().st_size
        stats["path"] = str(backup_path)
        stats["size"] = size

        removed = cleanup_old_backups()
        if removed:
            logger.info("daily_db_backup: видалено старих файлів: %s", removed)

        if not notify_admins_enabled():
            stats["ok"] = True
            stats["skipped_notify"] = True
            return stats

        admin_ids = admin_telegram_ids()
        if not admin_ids:
            stats["error"] = "no_admins"
            logger.warning("daily_db_backup: немає admin Telegram ID")
            return stats

        now_kyiv = datetime.now(KYIV_TZ).strftime("%d.%m.%Y %H:%M")
        db_kind = "PostgreSQL" if is_postgres() else "SQLite"
        caption = (
            f"🗄 <b>Щоденний бекап БД</b>\n"
            f"📅 {now_kyiv} (Europe/Kyiv)\n"
            f"💾 {db_kind} · {_human_size(size)}\n"
            f"📁 <code>{backup_path.name}</code>"
        )

        if size > TELEGRAM_MAX_DOCUMENT_BYTES:
            notice = (
                f"{caption}\n\n"
                f"⚠️ Файл занадто великий для Telegram "
                f"({_human_size(size)} &gt; 49 MB).\n"
                f"Бекап збережено на сервері: <code>{backup_path}</code>"
            )
            for admin_id in admin_ids:
                try:
                    await bot.send_message(admin_id, notice, parse_mode="HTML")
                    stats["sent"] += 1
                except Exception as e:
                    stats["failed"] += 1
                    logger.warning("daily_db_backup notify %s: %s", admin_id, e)
            stats["ok"] = True
            return stats

        for admin_id in admin_ids:
            try:
                await bot.send_document(
                    admin_id,
                    FSInputFile(str(backup_path)),
                    caption=caption,
                    parse_mode="HTML",
                )
                stats["sent"] += 1
            except Exception as e:
                stats["failed"] += 1
                logger.warning("daily_db_backup document %s: %s", admin_id, e)

        stats["ok"] = stats["sent"] > 0 or stats["failed"] == 0
        return stats
    except Exception as e:
        stats["error"] = str(e)
        logger.exception("daily_db_backup failed")
        if notify_admins_enabled():
            for admin_id in admin_telegram_ids():
                try:
                    await bot.send_message(
                        admin_id,
                        f"❌ <b>Бекап БД не вдався</b>\n<pre>{str(e)[:3500]}</pre>",
                        parse_mode="HTML",
                    )
                except Exception:
                    pass
        return stats


async def run_daily_db_backup_job(bot: Bot) -> None:
    stats = await send_daily_backup_to_admins(bot)
    if stats.get("ok"):
        logger.info(
            "✅ daily_db_backup: %s sent=%s failed=%s size=%s",
            stats.get("path"),
            stats.get("sent"),
            stats.get("failed"),
            stats.get("size"),
        )
    else:
        logger.error("daily_db_backup job: %s", stats)
