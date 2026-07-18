"""Публікація послуг у Telegram-канал + маршрутизація за містом."""

from __future__ import annotations

import html
import logging
import os
import re
from pathlib import Path
from typing import Optional

from aiogram import Bot
from aiogram.exceptions import TelegramBadRequest
from aiogram.types import FSInputFile, InlineKeyboardButton, InlineKeyboardMarkup, InputMediaPhoto
from dotenv import load_dotenv

from parser.category_keywords import get_category_label
from parser.config.settings import BOT_USERNAME, WEBAPP_URL
from parser.core.telegram_meta import parsed_item_message_link
from parser.core.text import detect_lang
from parser.moderation.formatting import (
    assemble_telegram_caption,
    build_channel_hashtags,
    format_original_post_link_html,
    listing_miniapp_url,
    strip_original_post_link_block,
    truncate_telegram_html,
)
from utils.location_normalization import normalize_city_name
from utils.translations import t

load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")

logger = logging.getLogger(__name__)

# Hamburg | TradeGround — публікація після модерації
TRADE_SERVICES_CHANNEL_HAMBURG_ID: int = int(
    os.getenv("TRADE_SERVICES_CHANNEL_HAMBURG_ID")
    or os.getenv("TRADE_CHANNEL_ID")
    or "-1003627644062"
)
# Germany | TradeGround — публікація після модерації
TRADE_SERVICES_CHANNEL_GERMANY_ID: int = int(
    os.getenv("TRADE_SERVICES_CHANNEL_GERMANY_ID")
    or os.getenv("TRADE_GERMANY_CHANNEL_ID")
    or "-1003857694156"
)

_HAMBURG_RE = re.compile(r"\bhamburg\b|\bгамбург\b", re.IGNORECASE)

_GERMANY_WIDE_LOCATION = frozenset({
    "germany",
    "deutschland",
    "німеччина",
    "немеччина",
    "germania",
    "вся німеччина",
    "вся германия",
    "whole germany",
})

_ONLINE_OR_REMOTE_RE = re.compile(
    r"\bonline\b|\bонлайн\b|\bremote\b|\bвіддален\w*|\bдистанц\w*|"
    r"\bzoom\b|\bskype\b|\bteams\b|"
    r"онлайн[\s-]?(?:услуг|сервис|консультац|урок|школ)|"
    r"online[\s-]?(?:service|consult|lesson|school)",
    re.IGNORECASE,
)

_GERMANY_WIDE_TEXT_RE = re.compile(
    r"по\s+всей\s+германии|по\s+всій\s+німеччині|"
    r"на\s+всю\s+германи\w*|на\s+всю\s+німеччин\w*|"
    r"auf\s+ganz(?:er)?\s+deutschland|"
    r"in\s+ganz\s+deutschland|"
    r"whole\s+germany|entire\s+germany|"
    r"по\s+всей\s+deutschland|"
    r"вся\s+германи\w*|вся\s+німеччин\w*",
    re.IGNORECASE,
)

# Виїзд / забір з адреси — аудиторія не лише одне місто.
_NATIONWIDE_PICKUP_RE = re.compile(
    r"забираем\s+с\s+адрес|заберем\s+с\s+адрес|"
    r"з\s+адрес[иы]|з\s+вашего\s+адрес|"
    r"abholung|pickup|"
    r"выезд\s+по|виїзд\s+по|"
    r"по\s+(?:всей|всій)\s+(?:германии|німеччини|deutschland)|"
    r"туристическ\w+\s+сопровожден|"
    r"сопровождени\w+\s+на\s+весь\s+период|"
    r"reisebegleitung|abholservice",
    re.IGNORECASE,
)

# Тури / поїздки / відпочинок (часто з Hamburg-каналу, але для всієї Німеччини).
_TRAVEL_TOURISM_RE = re.compile(
    r"поездк\w*|поїздк\w*|"
    r"отдых\s+на\s+море|відпочинок\s+на\s+морі|"
    r"туристическ\w*|туристичн\w*|"
    r"(?:^|\s)тур(?:\s|$|ы\b)|"
    r"курорт|"
    r"\brimini\b|итали\w*|італі\w*|"
    r"пляж|"
    r"(?:отель|hotel).{0,40}(?:линия|linie|line)|"
    r"проживани\w*|"
    r"reise|urlaub|ferien|"
    r"с\s+человека|с\s+особи|pro\s+person|"
    r"venezia|venice|венеци|рим|rome|florenz|florence|милан|milan|"
    r"санмарино|san\s*marino",
    re.IGNORECASE,
)

# Міста для визначення локації з тексту оголошення (не з каналу-джерела).
_KNOWN_SERVICE_CITIES: tuple[str, ...] = (
    "Berlin", "Hamburg", "München", "Köln", "Frankfurt", "Stuttgart",
    "Düsseldorf", "Leipzig", "Dortmund", "Essen", "Bremen", "Dresden",
    "Hannover", "Nürnberg", "Duisburg", "Bochum", "Wuppertal", "Bielefeld",
    "Bonn", "Münster", "Karlsruhe", "Mannheim", "Augsburg", "Wiesbaden",
    "Aachen", "Mönchengladbach", "Gelsenkirchen", "Braunschweig", "Kiel",
    "Freiburg im Breisgau", "Lübeck", "Erfurt", "Rostock", "Mainz", "Kassel",
    "Potsdam", "Heidelberg", "Darmstadt", "Regensburg", "Würzburg", "Ulm",
    "Dülmen",
)


def _service_text_blob(item: dict) -> str:
    """Текст оголошення (без source_city і location — їх може підставити парсер каналу)."""
    parts = [
        str(item.get("title") or ""),
        str(item.get("description") or ""),
        str(item.get("raw_text") or ""),
    ]
    return "\n".join(parts)


def _item_text_blob(item: dict) -> str:
    parts = [
        str(item.get("title") or ""),
        str(item.get("description") or ""),
        str(item.get("raw_text") or ""),
        str(item.get("location") or ""),
        str(item.get("source_city") or ""),
    ]
    return "\n".join(parts)


def _ascii_fold(text: str) -> str:
    return (
        text.replace("ü", "u")
        .replace("ö", "o")
        .replace("ä", "a")
        .replace("ß", "ss")
        .replace("Ü", "U")
        .replace("Ö", "O")
        .replace("Ä", "A")
    )


def _detect_cities_in_text(text: str) -> list[str]:
    if not text:
        return []
    lower = text.lower()
    lower_ascii = _ascii_fold(lower)
    found: list[str] = []
    for city in _KNOWN_SERVICE_CITIES:
        c_lower = city.lower()
        c_ascii = _ascii_fold(c_lower)
        if re.search(rf"\b{re.escape(c_lower)}\b", lower) or re.search(
            rf"\b{re.escape(c_ascii)}\b", lower_ascii
        ):
            canon = normalize_city_name(city) or city
            if canon not in found:
                found.append(canon)
    return found


def _effective_service_location(item: dict) -> str:
    """
    Локальний канал (source_city=Hamburg/Berlin/…) → завжди місто каналу.
    Загальний канал (Germany) → місто з location/тексту, інакше Germany.
    """
    from parser.core.location import is_local_source_city, resolve_parsed_location

    source_city = (item.get("source_city") or "").strip()
    if source_city and is_local_source_city(source_city):
        return normalize_city_name(source_city) or source_city

    return resolve_parsed_location(
        channel_city=source_city or "Germany",
        suggested=str(item.get("location") or ""),
        text=_service_text_blob(item),
    )


def _normalized_location_tokens(location: str) -> set[str]:
    raw = (location or "").strip().lower()
    if not raw:
        return set()
    tokens = {raw}
    first = raw.split(",")[0].strip().lower()
    tokens.add(first)
    tokens.add(normalize_city_name(first).lower())
    return tokens


def is_germany_wide_location(location: str) -> bool:
    return bool(_normalized_location_tokens(location) & _GERMANY_WIDE_LOCATION)


def is_travel_or_mobile_nationwide_service(item: dict) -> bool:
    """Тури, виїзди, забір з адреси — релевантно всій Німеччині (навіть якщо канал Hamburg)."""
    blob = _item_text_blob(item)
    if _NATIONWIDE_PICKUP_RE.search(blob):
        return True
    if _TRAVEL_TOURISM_RE.search(blob):
        # Туристичний пакет: поїздка + проживання/ціна/супровід
        package_hints = re.search(
            r"проживани|отель|hotel|€|eur|с\s+человека|с\s+особи|"
            r"апартамент|номер|завтрак|сопровожден|море|курорт",
            blob,
            re.IGNORECASE,
        )
        if package_hints:
            return True
    return False


def is_dual_channel_service(item: dict) -> bool:
    """Оголошення для аудиторії всієї Німеччини → Hamburg + Germany."""
    return is_online_or_germany_wide_service(item) or is_travel_or_mobile_nationwide_service(
        item
    )


def is_online_or_germany_wide_service(item: dict) -> bool:
    """Онлайн- послуги або оголошення на всю Німеччину → обидва канали."""
    blob = _item_text_blob(item)
    if _ONLINE_OR_REMOTE_RE.search(blob):
        return True
    if _GERMANY_WIDE_TEXT_RE.search(blob):
        return True

    subcategory = (item.get("subcategory") or "").strip().lower()
    if subcategory in {"it_services", "online_services"}:
        if _ONLINE_OR_REMOTE_RE.search(blob) or is_germany_wide_location(
            str(item.get("location") or "")
        ):
            return True

    for loc in (item.get("location"), _effective_service_location(item)):
        val = (loc or "").strip()
        if val and is_germany_wide_location(val):
            return True

    return False


def _location_candidates(item: dict) -> list[str]:
    """Застаріло для маршруту — лишено для сумісності."""
    eff = _effective_service_location(item)
    out: list[str] = []
    if eff:
        out.append(eff)
    return out


def is_hamburg_location(location: str) -> bool:
    raw = (location or "").strip()
    if not raw:
        return False
    if is_germany_wide_location(raw):
        return False
    if _HAMBURG_RE.search(raw):
        return True
    first_part = raw.split(",")[0].strip()
    return normalize_city_name(first_part).lower() == "hamburg"


def is_hamburg_service_item(item: dict) -> bool:
    return is_hamburg_location(_effective_service_location(item))


def resolve_services_trade_channel_ids(item: dict) -> list[int]:
    """
    Аудиторія вся Німеччина (онлайн, тури, забір з адреси) → обидва канали.
    Локальний Hamburg → лише Hamburg.
    Інше місто (Wuppertal, Berlin, …) → лише Germany.
    """
    eff_loc = _effective_service_location(item)
    logger.debug(
        "services route: eff_loc=%r location=%r source_city=%r",
        eff_loc,
        item.get("location"),
        item.get("source_city"),
    )
    if is_dual_channel_service(item):
        return [TRADE_SERVICES_CHANNEL_HAMBURG_ID, TRADE_SERVICES_CHANNEL_GERMANY_ID]
    if is_hamburg_service_item(item):
        return [TRADE_SERVICES_CHANNEL_HAMBURG_ID]
    return [TRADE_SERVICES_CHANNEL_GERMANY_ID]


def resolve_services_trade_channel_id(item: dict) -> int:
    """Перший канал з маршруту (зворотна сумісність)."""
    return resolve_services_trade_channel_ids(item)[0]


def services_channel_label(chat_id: int) -> str:
    if chat_id == TRADE_SERVICES_CHANNEL_HAMBURG_ID:
        return "TradeGround Hamburg (послуги)"
    if chat_id == TRADE_SERVICES_CHANNEL_GERMANY_ID:
        return "TradeGround Germany (послуги)"
    return f"канал {chat_id}"


def format_services_channels_labels(chat_ids: list[int]) -> str:
    seen: set[int] = set()
    labels: list[str] = []
    for chat_id in chat_ids:
        if chat_id in seen:
            continue
        seen.add(chat_id)
        labels.append(services_channel_label(chat_id))
    return " + ".join(labels)


# ── Publish ──────────────────────────────────

def _default_channel_photo_path() -> Optional[str]:
    bot_dir = Path(__file__).resolve().parent.parent.parent
    candidates = (
        bot_dir / "Content" / "tgground.jpg",
        bot_dir.parent / "Content" / "tgground.jpg",
    )
    for p in candidates:
        if p.is_file():
            return str(p)
    logger.warning("Дефолтне фото каналу не знайдено: %s", candidates[0])
    return None


def _channel_photo_inputs_from_images_web(images_web: list) -> list:
    out: list = []
    base = (WEBAPP_URL or "").rstrip("/")
    project_root = Path(__file__).resolve().parent.parent.parent.parent
    for img in (images_web or [])[:10]:
        if not img or not isinstance(img, str):
            continue
        s = img.strip()
        if s.startswith("http://") or s.startswith("https://"):
            out.append(s)
            continue
        if not s.startswith("/") or not base:
            continue
        rel = s.lstrip("/")
        local = project_root / "app" / "public" / rel
        if local.is_file():
            out.append(FSInputFile(str(local)))
        else:
            out.append(f"{base}{s}")
    return out


def _services_channel_price_text(user_id_for_lang: int, item: dict) -> str:
    negotiable_text = t(user_id_for_lang, "moderation.negotiable")
    is_free = bool(item.get("is_free"))
    price_str = str(item.get("price") or "").strip()
    currency = (item.get("currency") or "EUR").strip()
    price_display = item.get("price_display")
    if isinstance(price_display, str):
        price_display = price_display.strip() or None

    if is_free:
        return t(user_id_for_lang, "common.free")
    if price_display:
        if price_display in (
            negotiable_text,
            "Договірна",
            "Договорная",
            "Negotiable",
            "negotiable",
        ):
            return negotiable_text
        if "/год" in price_display or "/час" in price_display:
            return html.escape(price_display)
        return f"{html.escape(price_display)} {html.escape(currency)}"
    if price_str in ("Договірна", "Договорная", "Negotiable", "negotiable"):
        return negotiable_text
    if price_str:
        return f"{html.escape(price_str)} {html.escape(currency)}"
    return negotiable_text


async def _send_services_post(
    bot: Bot,
    chat_id: int,
    *,
    text_with_bot: str,
    keyboard: InlineKeyboardMarkup,
    photo_inputs: list,
    listing_id: int,
) -> bool:
    try:
        if len(photo_inputs) == 1:
            await bot.send_photo(
                chat_id=chat_id,
                photo=photo_inputs[0],
                caption=text_with_bot,
                parse_mode="HTML",
                reply_markup=keyboard,
            )
        elif len(photo_inputs) > 1:
            media = []
            for i, ph in enumerate(photo_inputs):
                cap = text_with_bot if i == 0 else None
                pmode = "HTML" if i == 0 else None
                media.append(InputMediaPhoto(media=ph, caption=cap, parse_mode=pmode))
            await bot.send_media_group(chat_id=chat_id, media=media)
        else:
            default_path = _default_channel_photo_path()
            if default_path:
                await bot.send_photo(
                    chat_id=chat_id,
                    photo=FSInputFile(default_path),
                    caption=text_with_bot,
                    parse_mode="HTML",
                    reply_markup=keyboard,
                )
            else:
                await bot.send_message(
                    chat_id=chat_id,
                    text=text_with_bot,
                    parse_mode="HTML",
                    disable_web_page_preview=False,
                )
        logger.info(
            "Listing %s опубліковано в %s (chat_id=%s)",
            listing_id,
            services_channel_label(chat_id),
            chat_id,
        )
        return True
    except TelegramBadRequest as e:
        err = str(e).lower()
        if "can't parse entities" in err or "unclosed start tag" in err:
            safe_text = truncate_telegram_html(text_with_bot, 1024)
            if safe_text != text_with_bot:
                logger.warning(
                    "Telegram HTML caption invalid for listing %s — retry safe truncate",
                    listing_id,
                )
                try:
                    if len(photo_inputs) == 1:
                        await bot.send_photo(
                            chat_id=chat_id,
                            photo=photo_inputs[0],
                            caption=safe_text,
                            parse_mode="HTML",
                            reply_markup=keyboard,
                        )
                    elif len(photo_inputs) > 1:
                        media = []
                        for i, ph in enumerate(photo_inputs):
                            cap = safe_text if i == 0 else None
                            pmode = "HTML" if i == 0 else None
                            media.append(
                                InputMediaPhoto(media=ph, caption=cap, parse_mode=pmode)
                            )
                        await bot.send_media_group(chat_id=chat_id, media=media)
                    else:
                        default_path = _default_channel_photo_path()
                        if default_path:
                            await bot.send_photo(
                                chat_id=chat_id,
                                photo=FSInputFile(default_path),
                                caption=safe_text,
                                parse_mode="HTML",
                                reply_markup=keyboard,
                            )
                        else:
                            await bot.send_message(
                                chat_id=chat_id,
                                text=safe_text,
                                parse_mode="HTML",
                                disable_web_page_preview=False,
                            )
                    logger.info(
                        "Listing %s опубліковано в %s після safe truncate",
                        listing_id,
                        services_channel_label(chat_id),
                    )
                    return True
                except Exception as retry_err:
                    logger.warning(
                        "Retry publish listing %s у %s failed: %s",
                        listing_id,
                        chat_id,
                        retry_err,
                    )
        logger.warning(
            "Telegram: не вдалося опублікувати listing %s у %s: %s",
            listing_id,
            chat_id,
            e,
        )
    except Exception as e:
        logger.warning(
            "Помилка публікації listing %s у %s: %s",
            listing_id,
            chat_id,
            e,
            exc_info=True,
        )
    return False


async def publish_services_listing_to_channel(
    bot: Bot,
    item: dict,
    listing_id: int,
    marketplace_description: str,
    images_web: list,
    *,
    marketplace_listing_id: int | None = None,
    force_channel_ids: list[int] | None = None,
) -> list[int]:
    """
    listing_id — id parsed_items (для логів).
    marketplace_listing_id — id Listing на маркетплейсі (deep link); якщо None — channel-only.
    force_channel_ids — якщо задано, публікуємо лише в ці канали (група модерації).
    """
    channel_ids = list(force_channel_ids) if force_channel_ids else resolve_services_trade_channel_ids(item)
    logger.info(
        "Listing %s → канали послуг %s (location=%r, source_city=%r)",
        listing_id,
        channel_ids,
        item.get("location"),
        item.get("source_city"),
    )

    try:
        user_id_for_lang = int(item.get("author_id") or 0)
    except (TypeError, ValueError):
        user_id_for_lang = 0

    title = (item.get("title") or "").strip()
    title_style = f"<b>{html.escape(title)}</b>"
    raw_desc = strip_original_post_link_block((marketplace_description or "").strip())
    raw_desc = re.sub(r"(?:^|\n)\s*👤\s*Автор:.*", "", raw_desc)
    raw_desc = re.sub(
        r"(?:^|\n)\s*🔗\s*(?:Оригінальне|Оригинальное|Original).*",
        "",
        raw_desc,
        flags=re.IGNORECASE,
    )
    raw_desc = re.sub(r"\n{3,}", "\n\n", raw_desc).strip()

    description_parts: list[str] = []
    if raw_desc:
        description_parts.append(html.escape(raw_desc))
    original_link_html = format_original_post_link_html(item)
    if original_link_html:
        description_parts.append(original_link_html)
    description_html = "\n\n".join(description_parts)

    category = (item.get("category") or "services_work").strip()
    subcategory = item.get("subcategory")
    category_text = html.escape(get_category_label(category, subcategory))

    condition = item.get("condition") or ""
    condition_map = {
        "new": t(user_id_for_lang, "listing.details.condition_new"),
        "used": t(user_id_for_lang, "listing.details.condition_used"),
    }
    condition_text = html.escape(str(condition_map.get(condition, condition or "—")))

    location = _effective_service_location(item)
    from utils.location_normalization import normalize_city_name

    location = normalize_city_name(location) or location
    location_esc = html.escape(location)

    price_text = _services_channel_price_text(user_id_for_lang, item)

    hashtags = build_channel_hashtags(category, subcategory, location)

    seller_label = t(user_id_for_lang, "listing.details.seller_channel")
    author_username = (item.get("author_username") or "").strip().lstrip("@")
    author_id = item.get("author_id")
    msg_link = parsed_item_message_link(item)

    seller_default_name = (
        t(user_id_for_lang, "listing.details.seller_channel")
        .replace("<b>", "")
        .replace("</b>", "")
        .replace(":", "")
        .strip()
    )

    bot_username = (os.getenv("BOT_USERNAME") or BOT_USERNAME or "TradeGroundBot").lstrip("@")
    bot_link = f"https://t.me/{bot_username}"
    listing_open_url = (
        listing_miniapp_url(marketplace_listing_id) if marketplace_listing_id else None
    )

    if author_username:
        seller_full_name = f"@{author_username}"
        seller_href = html.escape(f"https://t.me/{author_username}", quote=True)
        seller_text = (
            f"{seller_label} "
            f"<a href=\"{seller_href}\">"
            f"{html.escape(seller_full_name)}</a>"
        )
    elif msg_link:
        lang = detect_lang(f"{item.get('title') or ''}\n{item.get('description') or ''}")
        link_label = "Оригінал оголошення" if lang == "uk" else "Оригинал объявления"
        safe_link = html.escape(msg_link, quote=True)
        seller_text = f"{seller_label} <a href=\"{safe_link}\">{html.escape(link_label)}</a>"
    else:
        try:
            aid = int(author_id) if author_id is not None else 0
        except (TypeError, ValueError):
            aid = 0
        if aid:
            seller_full_name = t(user_id_for_lang, "common.user")
            seller_link = f"tg://user?id={aid}"
            seller_text = f"{seller_label} <a href=\"{seller_link}\">{html.escape(seller_full_name)}</a>"
        else:
            seller_text = f"{seller_label} {html.escape(seller_default_name)}"

    safe_bot_link = html.escape(bot_link, quote=True)
    bot_text = f"\n\n{t(user_id_for_lang, 'listing.submit_ad_text', bot_link=safe_bot_link)}"

    footer = f"""{t(user_id_for_lang, 'listing.details.price_channel')} {price_text}
{t(user_id_for_lang, 'listing.details.category_channel')} {category_text}
{t(user_id_for_lang, 'listing.details.location_channel')} {location_esc}
{seller_text}

{t(user_id_for_lang, 'listing.details.hashtag')} {hashtags}{bot_text}"""

    text_with_bot = assemble_telegram_caption(
        title_html=title_style,
        description_html=description_html,
        footer_html=footer,
        max_len=1024,
    )

    submit_btn = t(user_id_for_lang, "listing.submit_ad_button")
    keyboard_rows: list[list[InlineKeyboardButton]] = []
    if listing_open_url:
        view_btn = t(user_id_for_lang, "my_listings.view_listing_button")
        keyboard_rows.append([InlineKeyboardButton(text=view_btn, url=listing_open_url)])
    elif msg_link:
        view_btn = t(user_id_for_lang, "my_listings.view_listing_button")
        keyboard_rows.append([InlineKeyboardButton(text=view_btn, url=msg_link)])
    keyboard_rows.append([InlineKeyboardButton(text=submit_btn, url=bot_link)])
    keyboard = InlineKeyboardMarkup(inline_keyboard=keyboard_rows)

    photo_inputs = _channel_photo_inputs_from_images_web(list(images_web) if images_web else [])

    published: list[int] = []
    for chat_id in channel_ids:
        if await _send_services_post(
            bot,
            chat_id,
            text_with_bot=text_with_bot,
            keyboard=keyboard,
            photo_inputs=photo_inputs,
            listing_id=listing_id,
        ):
            published.append(chat_id)

    if len(published) > 1:
        logger.info(
            "Listing %s опубліковано в обидва канали: %s",
            listing_id,
            format_services_channels_labels(published),
        )
    return published
