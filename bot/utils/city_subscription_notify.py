"""
Сповіщення підписників міста про нове оголошення маркетплейсу (після схвалення в Telegram-боті).
Логіка міста збігається з app/utils/cityNormalization.ts
"""

from __future__ import annotations

import asyncio
import html
import os
import sqlite3
from typing import List

from aiogram import Bot
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo

from database_functions.telegram_listing_db import get_connection

# Синхронізовано з app/utils/cityNormalization.ts (CITY_ALIASES)
CITY_ALIASES = {
    "гамбург": "Hamburg",
    "hamburg": "Hamburg",
    "мюнхен": "München",
    "munich": "München",
    "берлин": "Berlin",
    "berlin": "Berlin",
    "кёльн": "Köln",
    "кельн": "Köln",
    "koln": "Köln",
    "cologne": "Köln",
    "дюссельдорф": "Düsseldorf",
    "dusseldorf": "Düsseldorf",
    "düsseldorf": "Düsseldorf",
    "dusseldrof": "Düsseldorf",
    "duseldorf": "Düsseldorf",
    "штутгарт": "Stuttgart",
    "stuttgart": "Stuttgart",
    "stutgart": "Stuttgart",
    "ганновер": "Hannover",
    "hannover": "Hannover",
    "hanover": "Hannover",
    "бремен": "Bremen",
    "bremen": "Bremen",
    "лейпциг": "Leipzig",
    "leipzig": "Leipzig",
    "дрезден": "Dresden",
    "dresden": "Dresden",
    "дортмунд": "Dortmund",
    "dortmund": "Dortmund",
    "эссен": "Essen",
    "essen": "Essen",
    "дуйсбург": "Duisburg",
    "duisburg": "Duisburg",
    "бонн": "Bonn",
    "bonn": "Bonn",
    "карлсруэ": "Karlsruhe",
    "karlsruhe": "Karlsruhe",
    "маннгейм": "Mannheim",
    "манхайм": "Mannheim",
    "mannheim": "Mannheim",
    "нюрнберг": "Nürnberg",
    "nuremberg": "Nürnberg",
    "nürnberg": "Nürnberg",
    "франкфурт": "Frankfurt am Main",
    "frankfurt": "Frankfurt am Main",
}


def normalize_city_input(city: str) -> str:
    key = city.strip().lower()
    return CITY_ALIASES.get(key, city.strip())


def listing_city_key_from_location(location: str) -> str:
    raw = (location or "").strip()
    if not raw:
        return ""
    first = raw.split(",", 1)[0].strip() if "," in raw else raw
    return normalize_city_input(first)


def _user_language(cursor: sqlite3.Cursor, telegram_id: int) -> str:
    try:
        cursor.execute(
            "SELECT language FROM User WHERE CAST(telegramId AS INTEGER) = ?",
            (telegram_id,),
        )
        row = cursor.fetchone()
        if row and row[0] in ("uk", "ru"):
            return row[0]
    except Exception:
        pass
    return "uk"


async def notify_city_subscribers_marketplace(bot: Bot, listing_id: int) -> None:
    """
    Надсилає повідомлення всім підписникам cityKey (окрім автора оголошення).
    """
    webapp_url = (
        os.getenv("WEBAPP_URL") or os.getenv("NEXT_PUBLIC_BASE_URL") or "https://tradegrnd.com"
    ).rstrip("/")

    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, userId, title, COALESCE(location, '') FROM Listing WHERE id = ?",
            (listing_id,),
        )
        row = cursor.fetchone()
        if not row:
            print(f"[city_subscription_notify] Listing {listing_id} not found")
            return

        _lid, author_user_id, title, location = row[0], row[1], row[2], row[3]
        city_key = listing_city_key_from_location(location)
        if not city_key:
            print(f"[city_subscription_notify] Empty city for listing {listing_id}")
            return

        cursor.execute(
            """
            SELECT CAST(u.telegramId AS INTEGER)
            FROM CitySubscription cs
            JOIN User u ON cs.userId = u.id
            WHERE cs.cityKey = ? AND cs.userId != ? AND u.isActive = 1
            """,
            (city_key, author_user_id),
        )
        recipients: List[int] = []
        for r in cursor.fetchall():
            if r and r[0] is not None:
                try:
                    recipients.append(int(r[0]))
                except (TypeError, ValueError):
                    continue

        print(
            f"[city_subscription_notify] listing={listing_id} cityKey={city_key} "
            f"subscribers={len(recipients)}"
        )

        safe_title = html.escape(title or "")
        safe_city = html.escape(city_key)

        for tid in recipients:
            lang = _user_language(cursor, tid)
            listing_url = (
                f"{webapp_url}/{lang}/bazaar?listing={listing_id}&telegramId={tid}"
            )
            if lang == "ru":
                text = (
                    f"🔔 <b>Новое объявление в {safe_city}</b>\n\n"
                    f"«{safe_title}»\n\n"
                    f"Откройте витрину, чтобы посмотреть детали."
                )
                btn = "🔗 Открыть"
            else:
                text = (
                    f"🔔 <b>Нове оголошення у {safe_city}</b>\n\n"
                    f"«{safe_title}»\n\n"
                    f"Відкрийте вітрину, щоб переглянути деталі."
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
                await bot.send_message(
                    chat_id=tid,
                    text=text,
                    parse_mode="HTML",
                    reply_markup=kb,
                    disable_web_page_preview=True,
                )
            except Exception as e:
                print(f"[city_subscription_notify] send failed for {tid}: {e}")

            await asyncio.sleep(0.05)
    finally:
        conn.close()
