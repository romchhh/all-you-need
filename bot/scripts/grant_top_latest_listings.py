#!/usr/bin/env python3
"""
Адмінський скрипт: нарахувати TOP-рекламу (top_category, 7 днів) на останнє оголошення
маркетплейсу (Listing) для заданих Telegram username або numeric Telegram ID.

Як у app/utils/paymentConstants.ts: top_category — duration 7 днів.

Запуск з каталогу bot/:
  python3 scripts/grant_top_latest_listings.py user1 123456789
  python3 scripts/grant_top_latest_listings.py --dry-run

Потрібно в .env: TOKEN.
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

TOP_DURATION_DAYS = 7

# Username без @ або лише цифри (Telegram ID). Або передайте аргументами.
DEFAULT_TARGETS: list[str] = [
    "7119952932",
    "491000004",
    "6999973578",
    "koshka_ya",
    "SvVost",
    "Alona_hrybovych",
    "a_rezunenko",
]


def _normalize_username(raw: str) -> str:
    return raw.strip().lstrip("@").lower()


def _fmt_ends_for_user(lang: str, ends_at: datetime) -> str:
    _ = lang
    return ends_at.strftime("%d.%m.%Y %H:%M UTC")


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


def _build_message(lang: str, title: str, listing_id: int, ends_at: datetime) -> str:
    safe_title = html.escape(title)
    ends_str = html.escape(_fmt_ends_for_user(lang, ends_at))
    if lang == "ru":
        return (
            "📌 <b>Активировано TOP-размещение</b>\n\n"
            f"Вашему объявлению «<b>{safe_title}</b>» (№{listing_id}) "
            f"начислено <b>TOP в категории на {TOP_DURATION_DAYS} дней</b> "
            f"до <b>{ends_str}</b>.\n\n"
            "Объявление будет выше в своей категории в каталоге TradeGround."
        )
    return (
        "📌 <b>Активовано TOP-розміщення</b>\n\n"
        f"Вашому оголошенню «<b>{safe_title}</b>» (№{listing_id}) "
        f"нараховано <b>TOP у категорії на {TOP_DURATION_DAYS} днів</b> "
        f"до <b>{ends_str}</b>.\n\n"
        "Оголошення буде вище у своїй категорії в каталозі TradeGround."
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


def _resolve_user(conn: sqlite3.Connection, raw: str) -> tuple[dict | None, str]:
    """
    Повертає (user | None, label для логу).
    Якщо рядок — лише цифри, шукаємо за telegramId, інакше за username.
    """
    s = raw.strip()
    if s.isdigit():
        tid = int(s)
        u = _find_user_by_telegram_id(conn, tid)
        return u, f"telegramId={tid}"
    uname = _normalize_username(s)
    u = _find_user(conn, uname)
    return u, f"@{uname}"


def _listing_has_column(conn: sqlite3.Connection, column: str) -> bool:
    cur = conn.execute("PRAGMA table_info(Listing)")
    return any(row[1] == column for row in cur.fetchall())


def _find_latest_listing(conn: sqlite3.Connection, user_id: int) -> dict | None:
    cur = conn.cursor()
    has_expires = _listing_has_column(conn, "expiresAt")
    active_extra = ""
    if has_expires:
        active_extra = " AND (expiresAt IS NULL OR datetime(expiresAt) > datetime('now'))"

    cur.execute(
        f"""
        SELECT id, title, status, promotionType
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
        return {
            "id": row[0],
            "title": row[1],
            "status": row[2],
            "promotionType": row[3],
        }
    cur.execute(
        """
        SELECT id, title, status, promotionType
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
    return {
        "id": row[0],
        "title": row[1],
        "status": row[2],
        "promotionType": row[3],
    }


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


def _run(targets: list[str], dry_run: bool) -> None:
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

        for raw in targets:
            user, label = _resolve_user(conn, raw)
            print(f"\n=== {label} ===")
            if not user:
                print("  Користувача не знайдено в User.")
                continue

            listing = _find_latest_listing(conn, user["id"])
            if not listing:
                print("  Немає оголошень у таблиці Listing.")
                continue

            merged = _merge_top_promotion_type(listing.get("promotionType"))
            print(
                f"  userId={user['id']} telegramId={user['telegramId']} "
                f"listing id={listing['id']} status={listing['status']!r} "
                f"promotionType: {listing.get('promotionType')!r} → {merged!r}"
            )
            if listing["status"] != "active":
                print(
                    "  Увага: оголошення не в статусі active — зміни в БД можуть "
                    "не відображатися в каталозі."
                )

            if dry_run:
                print("  [dry-run] без змін у БД і без повідомлення.")
                continue

            _apply_top(
                conn,
                user_id=user["id"],
                listing_id=listing["id"],
                merged_type=merged,
                starts_at=starts_at,
                ends_at=ends_at,
                dry_run=False,
            )
            print("  TOP застосовано в БД.")

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
        description="Нарахувати TOP (top_category) на останнє Listing: username або Telegram ID."
    )
    parser.add_argument(
        "targets",
        nargs="*",
        help="Username без @ або numeric Telegram ID",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Лише перевірка; без UPDATE/INSERT і без повідомлень",
    )
    args = parser.parse_args()
    names = list(args.targets) if args.targets else list(DEFAULT_TARGETS)
    if not names:
        print(
            "Вкажіть хоча б один username або Telegram ID, "
            "або заповніть DEFAULT_TARGETS у скрипті.",
            file=sys.stderr,
        )
        sys.exit(1)
    _run(names, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
