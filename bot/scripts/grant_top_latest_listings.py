#!/usr/bin/env python3
"""
Адмінський скрипт: нарахувати TOP-рекламу (top_category, 7 днів) на всі оголошення
маркетплейсу (Listing), створені за останні N годин (за замовчуванням 8).

Пропускає оголошення, у яких уже є активна реклама (promotionType + promotionEnds у майбутньому).

Якщо передати username / Telegram ID — обробляються лише оголошення цих користувачів.
Без аргументів і з порожнім DEFAULT_TARGETS — усі користувачі.

Запуск з каталогу bot/:
  python3 scripts/grant_top_latest_listings.py
  python3 scripts/grant_top_latest_listings.py user1 123456789
  python3 scripts/grant_top_latest_listings.py --hours 8 --dry-run

Потрібно в .env: TOKEN.
"""
from __future__ import annotations

import argparse
import html
import json
import os
import re
import sqlite3
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

BOT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BOT_ROOT))

try:
    from dotenv import load_dotenv as _load_dotenv
except ImportError:
    def _load_dotenv(path: Path) -> None:
        if not path.is_file():
            return
        for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            k, v = k.strip(), v.strip().strip('"').strip("'")
            if k and k not in os.environ:
                os.environ[k] = v

from database_functions.client_db import get_user_language  # noqa: E402
from database_functions.db_config import DATABASE_PATH  # noqa: E402

TOP_DURATION_DAYS = 7
DEFAULT_HOURS = 20

# Опційно: обмежити користувачів (username без @ або Telegram ID). Порожній список = усі.
DEFAULT_TARGETS: list[str] = []


def _normalize_username(raw: str) -> str:
    return raw.strip().lstrip("@").lower()


def _fmt_ends_for_user(lang: str, ends_at: datetime) -> str:
    _ = lang
    return ends_at.strftime("%d.%m.%Y %H:%M UTC")


def _parse_sqlite_datetime(value: object) -> datetime | None:
    """Парсинг дат з SQLite / ISO в aware UTC."""
    if value is None:
        return None
    s = str(value).strip()
    if not s:
        return None
    s = s.replace("Z", "+00:00")
    if re.match(r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}", s):
        s = s.replace(" ", "T", 1) + "+00:00"
    try:
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except ValueError:
        return None


def _has_active_promotion(promotion_type: object, promotion_ends: object) -> bool:
    """Є активна реклама — не нараховуємо TOP повторно."""
    if not promotion_type or not str(promotion_type).strip():
        return False
    end = _parse_sqlite_datetime(promotion_ends)
    if end is None:
        return True
    return end > datetime.now(timezone.utc)


def _merge_top_promotion_type(existing: str | None) -> str:
    """
    Узгоджено з app/utils/paymentHelpers.ts: highlighted + top_category → 'highlighted,top_category'.
    Якщо вже є vip — додаємо top_category: 'vip,top_category'.
    """
    if not existing or not str(existing).strip():
        return "top_category"
    parts = [p.strip() for p in str(existing).split(",") if p.strip()]
    if "top_category" in parts:
        return ",".join(parts)
    parts.append("top_category")
    if "highlighted" in parts and "top_category" in parts:
        others = [p for p in parts if p not in ("highlighted", "top_category")]
        return "highlighted,top_category" + ("," + ",".join(others) if others else "")
    return ",".join(parts)


def _effective_type_for_merge(promotion_type: object, promotion_ends: object) -> str | None:
    """Якщо минула реклама — не тягнемо старий promotionType у merge (лише свіже TOP)."""
    if _has_active_promotion(promotion_type, promotion_ends):
        return str(promotion_type).strip() if promotion_type else None
    return None


def _build_message_multi(
    lang: str,
    items: list[tuple[int, str]],
    ends_at: datetime,
) -> str:
    ends_str = html.escape(_fmt_ends_for_user(lang, ends_at))
    lines = []
    for lid, title in items:
        safe = html.escape(title)
        lines.append(f"• «<b>{safe}</b>» (№{lid})")
    block = "\n".join(lines)
    if lang == "ru":
        return (
            "📌 <b>Активировано TOP-размещение</b>\n\n"
            f"Начислено <b>TOP в категории на {TOP_DURATION_DAYS} дней</b> "
            f"до <b>{ends_str}</b> для объявлений:\n\n"
            f"{block}\n\n"
            "Они будут выше в своей категории в каталоге TradeGround."
        )
    return (
        "📌 <b>Активовано TOP-розміщення</b>\n\n"
        f"Нараховано <b>TOP у категорії на {TOP_DURATION_DAYS} днів</b> "
        f"до <b>{ends_str}</b> для оголошень:\n\n"
        f"{block}\n\n"
        "Вони будуть вище у своїй категорії в каталозі TradeGround."
    )


def _find_user(conn: sqlite3.Connection, username: str) -> dict | None:
    cur = conn.cursor()
    cur.execute(
        """
        SELECT id, telegramId, username
        FROM User
        WHERE username IS NOT NULL
          AND LOWER(TRIM(username)) = ?
        LIMIT 1
        """,
        (username,),
    )
    row = cur.fetchone()
    if not row:
        return None
    return {"id": row[0], "telegramId": int(row[1]), "username": row[2]}


def _find_user_by_telegram_id(conn: sqlite3.Connection, telegram_id: int) -> dict | None:
    cur = conn.cursor()
    cur.execute(
        """
        SELECT id, telegramId, username
        FROM User
        WHERE telegramId = ?
        LIMIT 1
        """,
        (telegram_id,),
    )
    row = cur.fetchone()
    if not row:
        return None
    return {"id": row[0], "telegramId": int(row[1]), "username": row[2]}


def _resolve_user(conn: sqlite3.Connection, raw: str) -> dict | None:
    s = raw.strip()
    if s.isdigit():
        return _find_user_by_telegram_id(conn, int(s))
    return _find_user(conn, _normalize_username(s))


def _listing_has_column(conn: sqlite3.Connection, column: str) -> bool:
    cur = conn.execute("PRAGMA table_info(Listing)")
    return any(row[1] == column for row in cur.fetchall())


def _time_column_expr(conn: sqlite3.Connection) -> str:
    """Момент «викладено»: publishedAt якщо є, інакше createdAt."""
    if _listing_has_column(conn, "publishedAt"):
        return "COALESCE(l.publishedAt, l.createdAt)"
    return "l.createdAt"


def _fetch_recent_listings(
    conn: sqlite3.Connection,
    hours: int,
    user_ids: list[int] | None,
) -> list[sqlite3.Row]:
    time_col = _time_column_expr(conn)
    cur = conn.cursor()
    sql = f"""
        SELECT l.id AS listing_id,
               l.userId AS user_id,
               l.title AS title,
               l.status AS status,
               l.promotionType AS promotion_type,
               l.promotionEnds AS promotion_ends,
               l.createdAt AS created_at,
               u.telegramId AS telegram_id
        FROM Listing l
        JOIN User u ON u.id = l.userId
        WHERE datetime({time_col}) >= datetime('now', ?)
    """
    params: list = [f"-{int(hours)} hours"]
    if user_ids:
        placeholders = ",".join("?" * len(user_ids))
        sql += f" AND l.userId IN ({placeholders})"
        params.extend(user_ids)
    sql += " ORDER BY datetime(l.createdAt) ASC, l.id ASC"
    cur.execute(sql, params)
    return cur.fetchall()


def _apply_top(
    conn: sqlite3.Connection,
    user_id: int,
    listing_id: int,
    merged_type: str,
    starts_at: datetime,
    ends_at: datetime,
    dry_run: bool,
) -> None:
    now_str = starts_at.strftime("%Y-%m-%d %H:%M:%S")
    starts_iso = starts_at.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    ends_iso = ends_at.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    cur = conn.cursor()
    if dry_run:
        return
    cur.execute(
        """
        UPDATE Listing
        SET promotionType = ?,
            promotionEnds = ?,
            updatedAt = ?
        WHERE id = ?
        """,
        (merged_type, ends_iso, now_str, listing_id),
    )
    cur.execute(
        """
        INSERT INTO PromotionPurchase (
            userId, listingId, promotionType, price, duration,
            paymentMethod, status, startsAt, endsAt, createdAt
        )
        VALUES (?, ?, 'top_category', 0, ?, 'admin_grant', 'active', ?, ?, CURRENT_TIMESTAMP)
        """,
        (user_id, listing_id, TOP_DURATION_DAYS, starts_iso, ends_iso),
    )
    conn.commit()


def _send_telegram_message(token: str, chat_id: int, text: str) -> None:
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = json.dumps(
        {
            "chat_id": chat_id,
            "text": text,
            "parse_mode": "HTML",
            "disable_web_page_preview": True,
        }
    ).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        body = json.loads(resp.read().decode())
    if not body.get("ok"):
        raise RuntimeError(body)


def _run(
    targets: list[str],
    hours: int,
    dry_run: bool,
) -> None:
    _load_dotenv(BOT_ROOT / ".env")
    token = os.getenv("TOKEN")
    if not token:
        print("Помилка: у .env немає TOKEN", file=sys.stderr)
        sys.exit(1)

    conn = sqlite3.connect(DATABASE_PATH, timeout=60.0)
    conn.row_factory = sqlite3.Row
    try:
        starts_at = datetime.now(timezone.utc)
        ends_at = starts_at + timedelta(days=TOP_DURATION_DAYS)

        user_ids_filter: list[int] | None = None
        if targets:
            user_ids_filter = []
            for raw in targets:
                u = _resolve_user(conn, raw)
                label = raw.strip()
                if not u:
                    print(f"⚠ Користувача не знайдено: {label}")
                    continue
                user_ids_filter.append(u["id"])
            if not user_ids_filter:
                print("Немає валідних користувачів для фільтра — вихід.", file=sys.stderr)
                return
            print(f"Фільтр userId: {user_ids_filter}")

        rows = _fetch_recent_listings(conn, hours, user_ids_filter)
        print(
            f"Вікно: останні {hours} год.; знайдено рядків Listing: {len(rows)} "
            f"(час події: publishedAt або createdAt)."
        )

        applied_by_telegram: dict[int, list[tuple[int, str]]] = {}
        skipped_ad = 0

        for row in rows:
            lid = row["listing_id"]
            uid = row["user_id"]
            title = row["title"]
            status = row["status"]
            ptype = row["promotion_type"]
            pends = row["promotion_ends"]
            tid = int(row["telegram_id"])

            if _has_active_promotion(ptype, pends):
                print(f"  listing #{lid} — пропуск: уже є активна реклама ({ptype!r})")
                skipped_ad += 1
                continue

            effective = _effective_type_for_merge(ptype, pends)
            merged = _merge_top_promotion_type(effective)
            print(
                f"  listing #{lid} userId={uid} status={status!r} "
                f"promotion: {ptype!r} → {merged!r}"
            )

            if dry_run:
                applied_by_telegram.setdefault(tid, []).append((lid, title))
                continue

            _apply_top(
                conn,
                user_id=uid,
                listing_id=lid,
                merged_type=merged,
                starts_at=starts_at,
                ends_at=ends_at,
                dry_run=False,
            )
            applied_by_telegram.setdefault(tid, []).append((lid, title))
            print(f"    TOP застосовано.")

        if dry_run:
            print(f"\n[dry-run] було б нараховано: {sum(len(v) for v in applied_by_telegram.values())} оголошень")
            print(f"  пропущено (активна реклама): {skipped_ad}")
            return

        for telegram_id, items in applied_by_telegram.items():
            if not items:
                continue
            lang = get_user_language(telegram_id) or "uk"
            if lang not in ("uk", "ru"):
                lang = "uk"
            text = _build_message_multi(lang, items, ends_at)
            try:
                _send_telegram_message(token, telegram_id, text)
                print(f"Повідомлення → telegramId={telegram_id} ({len(items)} огол.)")
            except urllib.error.HTTPError as e:
                err = e.read().decode(errors="replace")
                print(
                    f"Не вдалося надіслати telegramId={telegram_id}: HTTP {e.code} {err}",
                    file=sys.stderr,
                )
            except Exception as e:
                print(f"Не вдалося надіслати telegramId={telegram_id}: {e}", file=sys.stderr)

        print(f"\nГотово. TOP нараховано: {sum(len(v) for v in applied_by_telegram.values())} оголошень.")
        print(f"Пропущено (вже є реклама): {skipped_ad}")
    finally:
        conn.close()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="TOP (top_category) для Listing, створених за останні N годин."
    )
    parser.add_argument(
        "targets",
        nargs="*",
        help="Опційно: username або Telegram ID — лише їхні оголошення",
    )
    parser.add_argument(
        "--hours",
        type=int,
        default=DEFAULT_HOURS,
        help=f"Скільки годин назад брати оголошення (за замовчуванням {DEFAULT_HOURS})",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Без змін у БД і без повідомлень",
    )
    args = parser.parse_args()
    names = list(args.targets) if args.targets else list(DEFAULT_TARGETS)
    _run(names, hours=args.hours, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
