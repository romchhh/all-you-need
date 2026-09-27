"""
Щоденний бекап БД → Telegram адмінам.

PostgreSQL: один pg_dump (custom) у ZIP; якщо > ліміту Telegram — 2–3 частини одного архіву.
SQLite (legacy): один .db.gz.
"""

from __future__ import annotations

import gzip
import logging
import os
import shutil
import subprocess
import zipfile
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

RESTORE_README = """AllYouNeed — бекап PostgreSQL

У архіві файл ayn_marketplace.dump (формат pg_dump -Fc).

Відновлення на чисту БД:
  createdb ayn_restore
  pg_restore --no-owner --no-acl -d ayn_restore ayn_marketplace.dump

Якщо архів був розбитий на part01of02, part02of02 — спочатку склеїть:
  cat ayn_marketplace_pg_*.part01of02 ayn_marketplace_pg_*.part02of02 > backup.zip
  unzip backup.zip
"""


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


def telegram_max_part_bytes() -> int:
    mb = max(1, min(49, int(getattr(_tuning, "DB_BACKUP_TELEGRAM_MAX_MB", 45))))
    return mb * 1024 * 1024


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


def _run_pg_dump(out_path: Path, extra_args: list[str] | None = None) -> None:
    pg_dump = _find_pg_dump()
    env = _pg_connection_env()
    cmd = [
        pg_dump,
        "--format=custom",
        "--no-owner",
        "--no-acl",
        *(extra_args or []),
        "--file",
        str(out_path),
    ]
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
        if out_path.is_file():
            out_path.unlink(missing_ok=True)
        raise RuntimeError(f"pg_dump не створив файл або файл порожній: {out_path.name}")


def _zip_dump(dump_path: Path, zip_path: Path) -> None:
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        zf.write(dump_path, arcname="ayn_marketplace.dump")
        zf.writestr("RESTORE.txt", RESTORE_README)


def _split_for_telegram(archive: Path, chunk_size: int) -> list[Path]:
    """Розбиває один ZIP на кілька частин (не десятки таблиць — лише 2–4 файли)."""
    parts: list[Path] = []
    with open(archive, "rb") as src:
        chunks: list[bytes] = []
        while True:
            block = src.read(chunk_size)
            if not block:
                break
            chunks.append(block)
    if not chunks:
        raise RuntimeError(f"порожній архів: {archive.name}")

    total = len(chunks)
    stem = archive.name.removesuffix(".zip")
    for index, block in enumerate(chunks, start=1):
        part_path = BACKUP_DIR / f"{stem}.part{index:02d}of{total:02d}"
        part_path.write_bytes(block)
        parts.append(part_path)
    return parts


def _delivery_paths_for_telegram(archive: Path) -> list[Path]:
    size = archive.stat().st_size
    if size <= TELEGRAM_MAX_DOCUMENT_BYTES:
        return [archive]
    chunk = telegram_max_part_bytes()
    logger.info(
        "daily_db_backup: ZIP %s (%s) > Telegram — split by %s",
        archive.name,
        _human_size(size),
        _human_size(chunk),
    )
    return _split_for_telegram(archive, chunk)


def _create_postgres_backup(label: str) -> tuple[Path, list[Path]]:
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    dump_path = BACKUP_DIR / f"ayn_marketplace_pg_{label}.dump"
    zip_path = BACKUP_DIR / f"ayn_marketplace_pg_{label}.zip"

    logger.info("daily_db_backup: pg_dump → %s", dump_path.name)
    _run_pg_dump(dump_path, [])

    logger.info("daily_db_backup: zip → %s", zip_path.name)
    _zip_dump(dump_path, zip_path)
    dump_path.unlink(missing_ok=True)

    delivery = _delivery_paths_for_telegram(zip_path)
    return zip_path, delivery


def create_database_backup() -> list[Path]:
    """
    Створює бекап на диску.
    Повертає файли для відправки в Telegram (1 ZIP або кілька .partNNofMM).
    """
    label = _timestamp_label()

    if is_postgres():
        _zip_path, delivery = _create_postgres_backup(label)
        return delivery

    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
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
    return [gz_path]


def cleanup_old_backups(*, keep_days: int | None = None) -> int:
    """Видаляє локальні бекапи старші за keep_days."""
    days = keep_days if keep_days is not None else backup_keep_days()
    if not BACKUP_DIR.is_dir():
        return 0
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    removed = 0
    patterns = (
        "ayn_marketplace_pg_*.zip",
        "ayn_marketplace_pg_*.dump",
        "ayn_marketplace_pg_*.part*",
        "ayn_marketplace_*.db.gz",
        "ayn_marketplace_*.db",
    )
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
        "paths": [],
        "files": 0,
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

    try:
        delivery_paths = create_database_backup()
        if not delivery_paths:
            raise RuntimeError("бекап не створив жодного файлу")

        total_size = sum(p.stat().st_size for p in delivery_paths)
        stats["paths"] = [str(p) for p in delivery_paths]
        stats["path"] = stats["paths"][0]
        stats["files"] = len(delivery_paths)
        stats["size"] = total_size

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
        part_count = len(delivery_paths)
        multi = part_count > 1

        for admin_id in admin_ids:
            if multi:
                try:
                    await bot.send_message(
                        admin_id,
                        (
                            f"🗄 <b>Щоденний бекап БД</b>\n"
                            f"📅 {now_kyiv} · {db_kind}\n"
                            f"📦 Архів занадто великий для одного файлу — "
                            f"<b>{part_count} частини</b>. Збережи всі, склей: "
                            f"<code>cat …part* &gt; backup.zip</code>, потім <code>unzip</code>.\n"
                            f"Інструкція всередині ZIP: <code>RESTORE.txt</code>"
                        ),
                        parse_mode="HTML",
                    )
                except Exception as e:
                    logger.warning("daily_db_backup intro %s: %s", admin_id, e)

            for idx, send_path in enumerate(delivery_paths, start=1):
                size = send_path.stat().st_size
                if multi:
                    caption = (
                        f"🗄 Бекап {now_kyiv}\n"
                        f"📦 Частина {idx}/{part_count}\n"
                        f"💾 {_human_size(size)}\n"
                        f"📁 <code>{send_path.name}</code>"
                    )
                else:
                    caption = (
                        f"🗄 <b>Щоденний бекап БД</b>\n"
                        f"📅 {now_kyiv} (Europe/Kyiv)\n"
                        f"💾 {db_kind} · {_human_size(size)}\n"
                        f"📁 ZIP з <code>ayn_marketplace.dump</code> + RESTORE.txt\n"
                        f"♻️ <code>unzip</code> → <code>pg_restore -d DB ayn_marketplace.dump</code>"
                    )

                if size > TELEGRAM_MAX_DOCUMENT_BYTES:
                    try:
                        await bot.send_message(
                            admin_id,
                            (
                                f"⚠️ <code>{send_path.name}</code> "
                                f"({_human_size(size)}) не влізає в Telegram.\n"
                                f"Повний ZIP на сервері: <code>{BACKUP_DIR}</code>"
                            ),
                            parse_mode="HTML",
                        )
                        stats["failed"] += 1
                    except Exception as e:
                        stats["failed"] += 1
                        logger.warning("daily_db_backup oversize %s: %s", admin_id, e)
                    continue

                try:
                    await bot.send_document(
                        admin_id,
                        FSInputFile(str(send_path)),
                        caption=caption,
                        parse_mode="HTML",
                    )
                    stats["sent"] += 1
                except Exception as e:
                    stats["failed"] += 1
                    logger.warning("daily_db_backup document %s %s: %s", admin_id, send_path.name, e)

        stats["ok"] = stats["sent"] > 0 and stats["failed"] == 0
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
            "✅ daily_db_backup: files=%s sent=%s failed=%s size=%s",
            stats.get("files"),
            stats.get("sent"),
            stats.get("failed"),
            stats.get("size"),
        )
    else:
        logger.error("daily_db_backup job: %s", stats)
