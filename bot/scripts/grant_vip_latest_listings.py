#!/usr/bin/env python3
"""
Одноразовий / адмінський скрипт: нарахувати VIP (7 днів) на останнє оголошення
маркетплейсу (таблиця Listing) для заданих Telegram username і надіслати
користувачу повідомлення в бот.

Запуск з каталогу bot/:
  python scripts/grant_vip_latest_listings.py
  python scripts/grant_vip_latest_listings.py --dry-run

Потрібні змінні в .env (як у бота): TOKEN.
Залежності: лише стандартна бібліотека; .env читається через python-dotenv або простий парсер.
"""
from __future__ import annotations

import argparse
import html
import json
import os
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

# Тривалість VIP як у app/utils/paymentConstants.ts
VIP_DURATION_DAYS = 7

DEFAULT_USERNAMES = [
    "rtrostuslav",
    "arsenievlog",
    "laslo_baker",
    "romanova_str_k",
    "telebotsnowayrm",
]


def _normalize_username(raw: str) -> str:
    s = raw.strip().lstrip("@").lower()
    return s


def _fmt_ends_for_user(lang: str, ends_at: datetime) -> str:
    if lang == "ru":
        return ends_at.strftime("%d.%m.%Y %H:%M UTC")
    return ends_at.strftime("%d.%m.%Y %H:%M UTC")


def _build_message(lang: str, title: str, listing_id: int, ends_at: datetime) -> str:
    safe_title = html.escape(title)
    ends_str = _fmt_ends_for_user(lang, ends_at)
    if lang == "ru":
        return (
            "⭐ <b>Активировано VIP-размещение</b>\n\n"
            f"Вашему объявлению «<b>{safe_title}</b>» (№{listing_id}) "
            f"начислено <b>VIP на {VIP_DURATION_DAYS} дней</b> "
            f"до <b>{html.escape(ends_str)}</b>.\n\n"
            "Объявление будет показываться в приоритете в каталоге TradeGround."
        )
    return (
        "⭐ <b>Активовано VIP-розміщення</b>\n\n"
        f"Вашому оголошенню «<b>{safe_title}</b>» (№{listing_id}) "
        f"нараховано <b>VIP на {VIP_DURATION_DAYS} днів</b> "
        f"до <b>{html.escape(ends_str)}</b>.\n\n"
        "Оголошення відображатиметься в пріоритеті в каталозі TradeGround."
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


def _listing_has_column(conn: sqlite3.Connection, column: str) -> bool:
    cur = conn.execute("PRAGMA table_info(Listing)")
    return any(row[1] == column for row in cur.fetchall())


def _find_latest_listing(conn: sqlite3.Connection, user_id: int) -> dict | None:
    """Спочатку активне оголошення маркетплейсу, інакше просто останнє за createdAt."""
    cur = conn.cursor()
    has_expires = _listing_has_column(conn, "expiresAt")
    active_extra = ""
    if has_expires:
        active_extra = " AND (expiresAt IS NULL OR datetime(expiresAt) > datetime('now'))"

    cur.execute(
        f"""
        SELECT id, title, status
        FROM Listing
        WHERE userId = ?
          AND status = 'active'
          {active_extra}
        ORDER BY datetime(createdAt) DESC, id DESC
        LIMIT 1
        """,
        (user_id,),
    )
    row = cur.fetchone()
    if row:
        return {"id": row[0], "title": row[1], "status": row[2]}
    cur.execute(
        """
        SELECT id, title, status
        FROM Listing
        WHERE userId = ?
        ORDER BY datetime(createdAt) DESC, id DESC
        LIMIT 1
        """,
        (user_id,),
    )
    row = cur.fetchone()
    if not row:
        return None
    return {"id": row[0], "title": row[1], "status": row[2]}


def _apply_vip(
    conn: sqlite3.Connection,
    user_id: int,
    listing_id: int,
    starts_at: datetime,
    ends_at: datetime,
    dry_run: bool,
) -> None:
    now_str = starts_at.strftime("%Y-%m-%d %H:%M:%S")
    # ISO для полів, які читає Prisma / Next
    starts_iso = starts_at.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    ends_iso = ends_at.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    cur = conn.cursor()
    if dry_run:
        return
    cur.execute(
        """
        UPDATE Listing
        SET promotionType = 'vip',
            promotionEnds = ?,
            updatedAt = ?
        WHERE id = ?
        """,
        (ends_iso, now_str, listing_id),
    )
    cur.execute(
        """
        INSERT INTO PromotionPurchase (
            userId, listingId, promotionType, price, duration,
            paymentMethod, status, startsAt, endsAt, createdAt
        )
        VALUES (?, ?, 'vip', 0, ?, 'admin_grant', 'active', ?, ?, CURRENT_TIMESTAMP)
        """,
        (user_id, listing_id, VIP_DURATION_DAYS, starts_iso, ends_iso),
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


def _run(usernames: list[str], dry_run: bool) -> None:
    _load_dotenv(BOT_ROOT / ".env")
    token = os.getenv("TOKEN")
    if not token:
        print("Помилка: у .env немає TOKEN", file=sys.stderr)
        sys.exit(1)

    conn = sqlite3.connect(DATABASE_PATH, timeout=60.0)
    conn.row_factory = sqlite3.Row
    try:
        starts_at = datetime.now(timezone.utc)
        ends_at = starts_at + timedelta(days=VIP_DURATION_DAYS)

        for raw in usernames:
            uname = _normalize_username(raw)
            print(f"\n=== @{uname} ===")
            user = _find_user(conn, uname)
            if not user:
                print("  Користувача з таким username не знайдено в User.")
                continue

            listing = _find_latest_listing(conn, user["id"])
            if not listing:
                print("  Немає оголошень у таблиці Listing.")
                continue

            print(
                f"  userId={user['id']} telegramId={user['telegramId']} "
                f"listing id={listing['id']} status={listing['status']!r}"
            )
            if listing["status"] != "active":
                print(
                    "  Увага: оголошення не в статусі active — VIP у БД буде, "
                    "але в каталозі може не відображатися."
                )

            if dry_run:
                print("  [dry-run] без змін у БД і без повідомлення.")
                continue

            _apply_vip(
                conn,
                user_id=user["id"],
                listing_id=listing["id"],
                starts_at=starts_at,
                ends_at=ends_at,
                dry_run=False,
            )
            print("  VIP застосовано в БД.")

            lang = get_user_language(user["telegramId"]) or "uk"
            if lang not in ("uk", "ru"):
                lang = "uk"
            text = _build_message(lang, listing["title"], listing["id"], ends_at)
            try:
                _send_telegram_message(token, user["telegramId"], text)
                print("  Повідомлення надіслано в Telegram.")
            except urllib.error.HTTPError as e:
                err = e.read().decode(errors="replace")
                print(f"  Не вдалося надіслати повідомлення: HTTP {e.code} {err}", file=sys.stderr)
            except Exception as e:
                print(f"  Не вдалося надіслати повідомлення: {e}", file=sys.stderr)
    finally:
        conn.close()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Нарахувати VIP на останнє Listing для заданих username."
    )
    parser.add_argument(
        "usernames",
        nargs="*",
        help="Username без @ (за замовчуванням — фіксований список у скрипті)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Лише показати, кого знайдено; без UPDATE/INSERT і без повідомлень",
    )
    args = parser.parse_args()
    names = args.usernames if args.usernames else DEFAULT_USERNAMES
    _run(names, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
