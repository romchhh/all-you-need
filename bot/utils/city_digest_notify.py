"""
Пакетні (digest) сповіщення для підписки на міста.

Ідея: замість розсилки "1 listing -> 1 повідомлення" ми кладемо listing у чергу,
а кілька разів на день відправляємо дайджест по місту:
  "Нове оголошення у Berlin: «Title» і ще N"

Використовує ту ж БД, що й `utils/city_subscription_notify.py` (sqlite через get_connection()).
"""

from __future__ import annotations

import html
import os
import sqlite3
from datetime import datetime, timezone
from typing import Optional

from aiogram import Bot
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo

from database_functions.telegram_listing_db import get_connection
from utils.city_subscription_notify import (
    listing_city_key_from_location,
    _listing_photo_urls,
    _user_language,
)


def _ensure_city_digest_tables(cursor: sqlite3.Cursor) -> None:
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS CityDigestQueue (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            listingId INTEGER NOT NULL,
            cityKey TEXT NOT NULL,
            createdAt TEXT NOT NULL,
            processedAt TEXT
        )
        """
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_citydigestqueue_processed ON CityDigestQueue(processedAt)"
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_citydigestqueue_city ON CityDigestQueue(cityKey)"
    )
    cursor.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS ux_citydigestqueue_listing ON CityDigestQueue(listingId)"
    )


def enqueue_city_digest_listing(listing_id: int) -> None:
    """
    Додає listing у чергу дайджесту по місту (якщо можливо визначити cityKey).
    Ідемпотентно по listingId.
    """
    conn = get_connection()
    try:
        cur = conn.cursor()
        _ensure_city_digest_tables(cur)
        cur.execute("SELECT COALESCE(location, '') FROM Listing WHERE id = ?", (listing_id,))
        row = cur.fetchone()
        if not row:
            return
        location = row[0] or ""
        city_key = listing_city_key_from_location(location)
        if not city_key:
            return
        now = datetime.now(timezone.utc).isoformat()
        cur.execute(
            """
            INSERT OR IGNORE INTO CityDigestQueue(listingId, cityKey, createdAt, processedAt)
            VALUES (?, ?, ?, NULL)
            """,
            (listing_id, city_key, now),
        )
        conn.commit()
    finally:
        conn.close()


async def send_city_digest_notifications(bot: Bot, max_listings_per_city: int = 10) -> None:
    """
    Відправляє дайджести всім підписникам, після чого помічає queued listings як processedAt.
    """
    webapp_url = (
        os.getenv("WEBAPP_URL") or os.getenv("NEXT_PUBLIC_BASE_URL") or "https://tradegrnd.com"
    ).rstrip("/")
    now = datetime.now(timezone.utc).isoformat()

    conn = get_connection()
    try:
        cur = conn.cursor()
        _ensure_city_digest_tables(cur)

        # Беремо міста, де є непроцеснуті записи
        cur.execute(
            """
            SELECT cityKey, COUNT(*) AS cnt
            FROM CityDigestQueue
            WHERE processedAt IS NULL
            GROUP BY cityKey
            """
        )
        cities = cur.fetchall() or []
        if not cities:
            return

        for city_key, _cnt in cities:
            # Обмежуємо кількість listing-ів на один дайджест по місту
            cur.execute(
                """
                SELECT q.listingId
                FROM CityDigestQueue q
                WHERE q.processedAt IS NULL AND q.cityKey = ?
                ORDER BY q.createdAt ASC
                LIMIT ?
                """,
                (city_key, int(max_listings_per_city)),
            )
            listing_ids = [int(r[0]) for r in (cur.fetchall() or []) if r and r[0] is not None]
            if not listing_ids:
                continue

            # Рахуємо загальну кількість (для "і ще N")
            cur.execute(
                "SELECT COUNT(*) FROM CityDigestQueue WHERE processedAt IS NULL AND cityKey = ?",
                (city_key,),
            )
            total_pending = int((cur.fetchone() or [0])[0])

            # Витягаємо дані лістингів (id, userId, title, images JSON для фото в Telegram)
            placeholders = ",".join(["?"] * len(listing_ids))
            cur.execute(
                f"""
                SELECT id, userId, COALESCE(title, ''), COALESCE(images, '')
                FROM Listing
                WHERE id IN ({placeholders})
                """,
                tuple(listing_ids),
            )
            listing_rows = cur.fetchall() or []
            listings = {
                int(r[0]): (int(r[1]), str(r[2] or ""), str(r[3] or ""))
                for r in listing_rows
                if r and r[0] is not None
            }
            if not listings:
                # Якщо лістинги вже зникли — просто позначимо як processed
                cur.execute(
                    f"UPDATE CityDigestQueue SET processedAt = ? WHERE processedAt IS NULL AND cityKey = ?",
                    (now, city_key),
                )
                conn.commit()
                continue

            # Одержувачі підписки
            cur.execute(
                """
                SELECT CAST(u.telegramId AS INTEGER), cs.userId
                FROM CitySubscription cs
                JOIN User u ON cs.userId = u.id
                WHERE cs.cityKey = ? AND u.isActive = 1
                """,
                (city_key,),
            )
            subs = cur.fetchall() or []
            if not subs:
                # Нема кому — позначимо як processed
                cur.execute(
                    "UPDATE CityDigestQueue SET processedAt = ? WHERE processedAt IS NULL AND cityKey = ?",
                    (now, city_key),
                )
                conn.commit()
                continue

            safe_city = html.escape(str(city_key))
            # Позначаємо processed тільки якщо дайджест відправили хоча б комусь.
            sent_any = False

            for tid_raw, sub_user_id_raw in subs:
                if tid_raw is None or sub_user_id_raw is None:
                    continue
                try:
                    tid = int(tid_raw)
                    sub_user_id = int(sub_user_id_raw)
                except (TypeError, ValueError):
                    continue

                # Відкидаємо listings автора (як і в “миттєвій” розсилці)
                allowed = [
                    (lid, title, images_raw)
                    for lid, (author_uid, title, images_raw) in listings.items()
                    if author_uid != sub_user_id
                ]
                if not allowed:
                    continue

                allowed.sort(key=lambda x: x[0])
                first_listing_id, first_title, first_images_raw = allowed[0]
                more = max(0, total_pending - 1)
                photo_urls = _listing_photo_urls(first_images_raw, webapp_url)
                first_photo_url = photo_urls[0] if photo_urls else ""

                lang = _user_language(cur, tid)
                listing_url = f"{webapp_url}/{lang}/bazaar?listing={first_listing_id}&telegramId={tid}"

                safe_title = html.escape(first_title.strip())
                if lang == "ru":
                    text = (
                        f"🔔 <b>Новые объявления в {safe_city}</b>\n\n"
                        f"«{safe_title}»"
                        + (f"\n\nи ещё <b>{more}</b> шт." if more else "")
                        + "\n\nОткройте витрину, чтобы посмотреть детали."
                    )
                    btn = "🔗 Открыть"
                else:
                    text = (
                        f"🔔 <b>Нові оголошення у {safe_city}</b>\n\n"
                        f"«{safe_title}»"
                        + (f"\n\nі ще <b>{more}</b> шт." if more else "")
                        + "\n\nВідкрийте вітрину, щоб переглянути деталі."
                    )
                    btn = "🔗 Відкрити"

                kb = InlineKeyboardMarkup(
                    inline_keyboard=[
                        [
                            InlineKeyboardButton(
                                text=btn,
                                web_app=WebAppInfo(url=listing_url),
                            )
                        ]
                    ]
                )
                try:
                    if first_photo_url:
                        await bot.send_photo(
                            chat_id=tid,
                            photo=first_photo_url,
                            caption=text[:1024],
                            parse_mode="HTML",
                            reply_markup=kb,
                        )
                    else:
                        await bot.send_message(
                            chat_id=tid,
                            text=text,
                            parse_mode="HTML",
                            reply_markup=kb,
                            disable_web_page_preview=True,
                        )
                    sent_any = True
                except Exception:
                    if first_photo_url:
                        try:
                            await bot.send_message(
                                chat_id=tid,
                                text=text,
                                parse_mode="HTML",
                                reply_markup=kb,
                                disable_web_page_preview=True,
                            )
                            sent_any = True
                        except Exception:
                            pass
                    # мовчки — користувач міг заблокувати
                    continue

            if sent_any:
                cur.execute(
                    "UPDATE CityDigestQueue SET processedAt = ? WHERE processedAt IS NULL AND cityKey = ?",
                    (now, city_key),
                )
                conn.commit()
    finally:
        conn.close()

