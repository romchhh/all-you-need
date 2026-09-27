"""
Щоденний бекап БД → Telegram адмінам.

PostgreSQL: pg_dump по частинах (схема + data-only на таблицю) для ліміту Telegram.
SQLite (legacy): копія файлу + gzip.
"""

from __future__ import annotations

import gzip
import logging
import os
import re
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


def _safe_table_slug(table_name: str) -> str:
    slug = re.sub(r"[^\w.-]+", "_", table_name).strip("_")
    return slug[:48] or "table"


def _pg_table_identifier(schema: str, table: str) -> str:
    return f'{schema}."{table}"'


def _list_pg_user_tables() -> list[tuple[str, str]]:
    from database_functions.db_connection import _load_psycopg2

    psycopg2, _ = _load_psycopg2()
    conn = psycopg2.connect(pg_dsn_for_psycopg2(get_database_url()))
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT table_schema, table_name
                FROM information_schema.tables
                WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
                  AND table_type = 'BASE TABLE'
                ORDER BY table_name
                """
            )
            rows = cur.fetchall()
            return [(str(s), str(t)) for s, t in rows]
    finally:
        conn.close()


def _run_pg_dump(out_path: Path, extra_args: list[str]) -> None:
    pg_dump = _find_pg_dump()
    env = _pg_connection_env()
    cmd = [
        pg_dump,
        "--format=custom",
        "--no-owner",
        "--no-acl",
        *extra_args,
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


def _run_pg_dump_plain_gzip(out_path: Path, extra_args: list[str]) -> None:
    """Plain SQL → gzip (менший розмір для великих таблиць)."""
    pg_dump = _find_pg_dump()
    env = _pg_connection_env()
    cmd = [
        pg_dump,
        "--format=plain",
        "--no-owner",
        "--no-acl",
        *extra_args,
    ]
    proc = subprocess.run(
        cmd,
        env=env,
        capture_output=True,
        timeout=backup_pg_timeout_sec(),
        check=False,
    )
    if proc.returncode != 0:
        err = (proc.stderr or b"").decode("utf-8", errors="replace")[:2000]
        raise RuntimeError(f"pg_dump plain failed ({proc.returncode}): {err}")
    if not proc.stdout:
        raise RuntimeError(f"pg_dump plain порожній вивід: {out_path.name}")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(out_path, "wb", compresslevel=6) as gz:
        gz.write(proc.stdout)


def _create_postgres_table_backups(label: str) -> list[Path]:
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    parts: list[Path] = []

    schema_path = BACKUP_DIR / f"ayn_marketplace_pg_{label}_00_schema.dump"
    logger.info("daily_db_backup: schema → %s", schema_path.name)
    _run_pg_dump(schema_path, ["--schema-only"])
    parts.append(schema_path)

    tables = _list_pg_user_tables()
    if not tables:
        raise RuntimeError("PostgreSQL: не знайдено жодної таблиці для бекапу")

    for index, (schema, table) in enumerate(tables, start=1):
        slug = _safe_table_slug(table)
        table_id = _pg_table_identifier(schema, table)
        dump_path = BACKUP_DIR / f"ayn_marketplace_pg_{label}_{index:02d}_{slug}.dump"
        logger.info("daily_db_backup: table %s → %s", table_id, dump_path.name)
        _run_pg_dump(dump_path, ["--data-only", f"--table={table_id}"])
        parts.append(dump_path)

    return parts


def create_database_backup() -> list[Path]:
    """Створює файл(и) бекапу в database/backups/."""
    label = _timestamp_label()

    if is_postgres():
        return _create_postgres_table_backups(label)

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
        "ayn_marketplace_pg_*.dump",
        "ayn_marketplace_pg_*.sql.gz",
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


def _telegram_send_path(path: Path, schema: str, table: str) -> Path:
    """Якщо custom dump занадто великий — пробуємо sql.gz для однієї таблиці."""
    limit = telegram_max_part_bytes()
    if path.stat().st_size <= limit:
        return path

    if table and schema:
        gz_path = path.with_suffix(".sql.gz")
        logger.info(
            "daily_db_backup: %s > %s, пробуємо plain+gzip",
            path.name,
            _human_size(limit),
        )
        table_id = _pg_table_identifier(schema, table)
        _run_pg_dump_plain_gzip(gz_path, ["--data-only", f"--table={table_id}"])
        if gz_path.stat().st_size <= TELEGRAM_MAX_DOCUMENT_BYTES:
            path.unlink(missing_ok=True)
            return gz_path
        gz_path.unlink(missing_ok=True)

    return path


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
        backup_paths = create_database_backup()
        if not backup_paths:
            raise RuntimeError("бекап не створив жодного файлу")

        total_size = sum(p.stat().st_size for p in backup_paths)
        stats["paths"] = [str(p) for p in backup_paths]
        stats["path"] = stats["paths"][0]
        stats["files"] = len(backup_paths)
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
        part_count = len(backup_paths)
        intro = (
            f"🗄 <b>Щоденний бекап БД</b>\n"
            f"📅 {now_kyiv} (Europe/Kyiv)\n"
            f"💾 {db_kind} · {_human_size(total_size)} · частин: <b>{part_count}</b>\n"
            f"📋 Схема + окремий файл на кожну таблицю\n"
            f"♻️ Відновлення: <code>pg_restore -d DB schema.dump</code>, "
            f"потім <code>pg_restore -d DB table.dump</code> (або <code>psql | gunzip</code> для .sql.gz)"
        )

        table_meta: list[tuple[str, str]] = []
        if is_postgres():
            table_meta = [("", "")] + _list_pg_user_tables()

        for admin_id in admin_ids:
            try:
                await bot.send_message(admin_id, intro, parse_mode="HTML")
                stats["sent"] += 1
            except Exception as e:
                stats["failed"] += 1
                logger.warning("daily_db_backup intro %s: %s", admin_id, e)

            for idx, path in enumerate(backup_paths, start=1):
                schema, table = ("", "")
                if idx <= len(table_meta):
                    schema, table = table_meta[idx - 1]

                send_path = path
                if is_postgres() and idx > 1 and table:
                    try:
                        send_path = _telegram_send_path(path, schema, table)
                    except Exception as e:
                        logger.warning("daily_db_backup compress %s: %s", path.name, e)
                        send_path = path

                size = send_path.stat().st_size
                title = "schema" if idx == 1 and is_postgres() else (table or send_path.stem)
                caption = (
                    f"📦 Частина {idx}/{part_count} · <code>{title}</code>\n"
                    f"💾 {_human_size(size)}\n"
                    f"📁 <code>{send_path.name}</code>"
                )

                if size > TELEGRAM_MAX_DOCUMENT_BYTES:
                    notice = (
                        f"⚠️ Частина {idx}/{part_count} <code>{send_path.name}</code> "
                        f"занадто велика для Telegram ({_human_size(size)}).\n"
                        f"Файл лишився на сервері: <code>{send_path}</code>"
                    )
                    try:
                        await bot.send_message(admin_id, notice, parse_mode="HTML")
                        stats["sent"] += 1
                    except Exception as e:
                        stats["failed"] += 1
                        logger.warning("daily_db_backup oversize notify %s: %s", admin_id, e)
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

        stats["ok"] = stats["failed"] == 0 or stats["sent"] > 0
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
