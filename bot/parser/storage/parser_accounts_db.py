"""SQLite: акаунти парсера (Pyrogram), керування з адмін-панелі."""

from __future__ import annotations

import logging
import time
from pathlib import Path
from typing import Any, Optional

from parser.storage.connection import get_connection

logger = logging.getLogger(__name__)

_PARSER_DIR = Path(__file__).resolve().parent.parent
SESSIONS_DIR = _PARSER_DIR / "sessions"


def ensure_parser_accounts_table() -> None:
    SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
    conn = get_connection()
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS parser_accounts (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                api_id          INTEGER NOT NULL,
                api_hash        TEXT NOT NULL,
                phone           TEXT NOT NULL,
                telegram_id     INTEGER NOT NULL DEFAULT 0,
                username        TEXT NOT NULL DEFAULT '',
                session_name    TEXT NOT NULL UNIQUE,
                enabled         INTEGER NOT NULL DEFAULT 1,
                status          TEXT NOT NULL DEFAULT 'active',
                last_error      TEXT NOT NULL DEFAULT '',
                parse_runs      INTEGER NOT NULL DEFAULT 0,
                parse_ok        INTEGER NOT NULL DEFAULT 0,
                parse_errors    INTEGER NOT NULL DEFAULT 0,
                dm_sent         INTEGER NOT NULL DEFAULT 0,
                dm_errors       INTEGER NOT NULL DEFAULT 0,
                last_parse_at   REAL NOT NULL DEFAULT 0,
                last_dm_at      REAL NOT NULL DEFAULT 0,
                flood_until     REAL NOT NULL DEFAULT 0,
                created_at      REAL NOT NULL,
                updated_at      REAL NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS parser_meta (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL DEFAULT ''
            )
            """
        )
        conn.commit()
    finally:
        conn.close()


def _row_to_dict(row) -> dict[str, Any]:
    return dict(row) if row is not None else {}


def list_accounts(*, enabled_only: bool = False) -> list[dict[str, Any]]:
    ensure_parser_accounts_table()
    conn = get_connection()
    try:
        if enabled_only:
            rows = conn.execute(
                """
                SELECT * FROM parser_accounts
                WHERE enabled = 1
                ORDER BY id ASC
                """
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM parser_accounts ORDER BY id ASC"
            ).fetchall()
        return [_row_to_dict(r) for r in rows]
    finally:
        conn.close()


def get_account(account_id: int) -> Optional[dict[str, Any]]:
    ensure_parser_accounts_table()
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT * FROM parser_accounts WHERE id = ?",
            (account_id,),
        ).fetchone()
        return _row_to_dict(row) if row else None
    finally:
        conn.close()


def session_path_for(session_name: str) -> Path:
    return SESSIONS_DIR / session_name


def create_account(
    *,
    api_id: int,
    api_hash: str,
    phone: str,
    telegram_id: int = 0,
    username: str = "",
    session_name: str | None = None,
) -> int:
    ensure_parser_accounts_table()
    now = time.time()
    phone = (phone or "").strip()
    api_hash = (api_hash or "").strip()
    username = (username or "").lstrip("@")
    conn = get_connection()
    try:
        cur = conn.execute(
            """
            INSERT INTO parser_accounts (
                api_id, api_hash, phone, telegram_id, username, session_name,
                enabled, status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, 1, 'pending', ?, ?)
            """,
            (
                int(api_id),
                api_hash,
                phone,
                int(telegram_id or 0),
                username,
                session_name or f"tmp_{int(now)}",
                now,
                now,
            ),
        )
        account_id = int(cur.lastrowid)
        final_session = session_name or f"parser_account_{account_id}"
        if final_session != session_name:
            conn.execute(
                "UPDATE parser_accounts SET session_name = ?, updated_at = ? WHERE id = ?",
                (final_session, now, account_id),
            )
        conn.commit()
        return account_id
    finally:
        conn.close()


def update_account(account_id: int, **fields) -> None:
    if not fields:
        return
    ensure_parser_accounts_table()
    allowed = {
        "api_id",
        "api_hash",
        "phone",
        "telegram_id",
        "username",
        "session_name",
        "enabled",
        "status",
        "last_error",
        "parse_runs",
        "parse_ok",
        "parse_errors",
        "dm_sent",
        "dm_errors",
        "last_parse_at",
        "last_dm_at",
        "flood_until",
    }
    sets = []
    vals: list[Any] = []
    for k, v in fields.items():
        if k not in allowed:
            continue
        sets.append(f"{k} = ?")
        vals.append(v)
    if not sets:
        return
    sets.append("updated_at = ?")
    vals.append(time.time())
    vals.append(account_id)
    conn = get_connection()
    try:
        conn.execute(
            f"UPDATE parser_accounts SET {', '.join(sets)} WHERE id = ?",
            vals,
        )
        conn.commit()
    finally:
        conn.close()


def delete_account(account_id: int) -> bool:
    ensure_parser_accounts_table()
    acc = get_account(account_id)
    if not acc:
        return False
    conn = get_connection()
    try:
        conn.execute("DELETE FROM parser_accounts WHERE id = ?", (account_id,))
        conn.commit()
    finally:
        conn.close()

    stem = (acc.get("session_name") or "").strip()
    if stem:
        base = SESSIONS_DIR / stem
        for p in (
            Path(f"{base}.session"),
            Path(f"{base}.session-journal"),
            Path(f"{base}.session-wal"),
            Path(f"{base}.session-shm"),
        ):
            try:
                if p.is_file():
                    p.unlink()
            except OSError as e:
                logger.warning("Не вдалося видалити сесію %s: %s", p, e)
    return True


def mark_parse_result(account_id: int, *, ok: bool, error: str = "") -> None:
    now = time.time()
    conn = get_connection()
    try:
        if ok:
            conn.execute(
                """
                UPDATE parser_accounts
                SET parse_runs = parse_runs + 1,
                    parse_ok = parse_ok + 1,
                    last_parse_at = ?,
                    status = 'active',
                    last_error = '',
                    updated_at = ?
                WHERE id = ?
                """,
                (now, now, account_id),
            )
        else:
            conn.execute(
                """
                UPDATE parser_accounts
                SET parse_runs = parse_runs + 1,
                    parse_errors = parse_errors + 1,
                    last_parse_at = ?,
                    last_error = ?,
                    status = CASE WHEN ? != '' THEN 'error' ELSE status END,
                    updated_at = ?
                WHERE id = ?
                """,
                (now, (error or "")[:500], error or "", now, account_id),
            )
        conn.commit()
    finally:
        conn.close()


def mark_dm_result(account_id: int, *, ok: bool, error: str = "") -> None:
    now = time.time()
    conn = get_connection()
    try:
        if ok:
            conn.execute(
                """
                UPDATE parser_accounts
                SET dm_sent = dm_sent + 1,
                    last_dm_at = ?,
                    status = 'active',
                    last_error = '',
                    updated_at = ?
                WHERE id = ?
                """,
                (now, now, account_id),
            )
        else:
            conn.execute(
                """
                UPDATE parser_accounts
                SET dm_errors = dm_errors + 1,
                    last_dm_at = ?,
                    last_error = ?,
                    updated_at = ?
                WHERE id = ?
                """,
                (now, (error or "")[:500], now, account_id),
            )
        conn.commit()
    finally:
        conn.close()


def set_flood_until(account_id: int, until_ts: float) -> None:
    update_account(account_id, flood_until=until_ts, status="flood")


def get_meta(key: str, default: str = "") -> str:
    ensure_parser_accounts_table()
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT value FROM parser_meta WHERE key = ?", (key,)
        ).fetchone()
        return str(row["value"]) if row else default
    finally:
        conn.close()


def set_meta(key: str, value: str) -> None:
    ensure_parser_accounts_table()
    conn = get_connection()
    try:
        conn.execute(
            """
            INSERT INTO parser_meta (key, value) VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
            """,
            (key, str(value)),
        )
        conn.commit()
    finally:
        conn.close()


def next_rr_offset(meta_key: str, n: int) -> int:
    """Повертає offset і зсуває курсор для наступного виклику."""
    if n <= 0:
        return 0
    try:
        cur = int(get_meta(meta_key, "0") or "0")
    except ValueError:
        cur = 0
    offset = cur % n
    set_meta(meta_key, str(cur + 1))
    return offset


def migrate_env_accounts_if_empty() -> int:
    """Якщо в БД порожньо — імпорт з PARSER_ACCOUNT_* / legacy .env."""
    ensure_parser_accounts_table()
    if list_accounts():
        return 0
    try:
        from parser.config.accounts import load_parser_account_configs
    except Exception as e:
        logger.warning("migrate env accounts: %s", e)
        return 0

    imported = 0
    for cfg in load_parser_account_configs(3):
        if not cfg.is_configured():
            continue
        session_name = f"parser_account_migrated_{cfg.index}"
        # Скопіювати існуючу сесію, якщо є
        old = cfg.session_path
        old_session = Path(f"{old}.session")
        new_stem = SESSIONS_DIR / session_name
        if old_session.is_file():
            try:
                import shutil

                SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
                shutil.copy2(old_session, Path(f"{new_stem}.session"))
            except Exception as e:
                logger.warning("Не вдалося скопіювати сесію %s: %s", old_session, e)

        create_account(
            api_id=cfg.api_id,
            api_hash=cfg.api_hash,
            phone=cfg.phone,
            telegram_id=cfg.telegram_id or 0,
            username=cfg.username or "",
            session_name=session_name,
        )
        # activate
        accs = list_accounts()
        for a in accs:
            if a.get("session_name") == session_name:
                update_account(int(a["id"]), status="active")
                break
        imported += 1
        logger.info("Імпортовано env-акаунт %s → БД (%s)", cfg.label, session_name)
    return imported
