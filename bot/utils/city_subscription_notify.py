"""
Сповіщення підписників міста про нове оголошення маркетплейсу (після схвалення в Telegram-боті).
Логіка міста збігається з app/utils/cityNormalization.ts
"""

from __future__ import annotations

import asyncio
import html
import json
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


def _listing_photo_urls(images_raw: str | None, webapp_url: str) -> List[str]:
    if not images_raw:
        return []
    items: list = []
    try:
        parsed = json.loads(images_raw)
        if isinstance(parsed, list):
            items = parsed
        elif isinstance(parsed, str):
            items = [parsed]
    except Exception:
        items = [images_raw]

    urls: List[str] = []
    for item in items:
        raw = ""
        if isinstance(item, dict):
            raw = str(item.get("file_id") or item.get("url") or "").strip()
        elif isinstance(item, str):
            raw = item.strip()
        if not raw:
            continue
        if raw.startswith("http://") or raw.startswith("https://"):
            urls.append(raw)
            continue
        clean = raw.split("?", 1)[0].lstrip("/")
        if not clean:
            continue
        if "parsed_photos/" in clean:
            suffix = clean.split("parsed_photos/", 1)[1]
            if suffix:
                urls.append(f"{webapp_url}/api/parsed-images/{suffix}")
        else:
            urls.append(f"{webapp_url}/api/images/{clean}")

    # унікальні зберігаємо порядок
    seen = set()
    uniq: List[str] = []
    for u in urls:
        if u in seen:
            continue
        seen.add(u)
        uniq.append(u)
    return uniq


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
            """
            SELECT
                id,
                userId,
                title,
                COALESCE(description, ''),
                COALESCE(location, ''),
                COALESCE(images, '')
            FROM Listing
            WHERE id = ?
            """,
            (listing_id,),
        )
        row = cursor.fetchone()
        if not row:
            print(f"[city_subscription_notify] Listing {listing_id} not found")
            return

        _lid, author_user_id, title, description, location, images_raw = (
            row[0],
            row[1],
            row[2],
            row[3],
            row[4],
            row[5],
        )
        city_key = listing_city_key_from_location(location)
        if not city_key:
            print(f"[city_subscription_notify] Empty city for listing {listing_id}")
            return
        photo_urls = _listing_photo_urls(images_raw, webapp_url)
        first_photo_url = photo_urls[0] if photo_urls else ""

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

        safe_title = html.escape((title or "").strip())
        safe_city = html.escape(city_key)
        safe_description = html.escape(" ".join((description or "").split()).strip()[:300])
        safe_photo_link = html.escape(first_photo_url, quote=True)

        for tid in recipients:
            lang = _user_language(cursor, tid)
            listing_url = (
                f"{webapp_url}/{lang}/bazaar?listing={listing_id}&telegramId={tid}"
            )
            if lang == "ru":
                text = (
                    f"🔔 <b>Новое объявление в {safe_city}</b>\n\n"
                    f"«{safe_title}»\n\n"
                    f"{safe_description or 'Без описания.'}\n\n"
                    + (
                        f"🖼 <a href=\"{safe_photo_link}\">Фото объявления</a>\n\n"
                        if safe_photo_link
                        else ""
                    )
                    + "Откройте витрину, чтобы посмотреть детали."
                )
                btn = "🔗 Открыть"
            else:
                text = (
                    f"🔔 <b>Нове оголошення у {safe_city}</b>\n\n"
                    f"«{safe_title}»\n\n"
                    f"{safe_description or 'Без опису.'}\n\n"
                    + (
                        f"🖼 <a href=\"{safe_photo_link}\">Фото оголошення</a>\n\n"
                        if safe_photo_link
                        else ""
                    )
                    + "Відкрийте вітрину, щоб переглянути деталі."
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
                        caption=text[:1024],  # ліміт Telegram для caption
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
            except Exception as e:
                print(f"[city_subscription_notify] send failed for {tid}: {e}")
                if first_photo_url:
                    try:
                        await bot.send_message(
                            chat_id=tid,
                            text=text,
                            parse_mode="HTML",
                            reply_markup=kb,
                            disable_web_page_preview=True,
                        )
                    except Exception as e2:
                        print(
                            f"[city_subscription_notify] text fallback failed for {tid}: {e2}"
                        )

            await asyncio.sleep(0.05)
    finally:
        conn.close()
