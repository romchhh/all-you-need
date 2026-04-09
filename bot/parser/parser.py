"""
Основний модуль парсера оголошень з Telegram-каналів через Pyrogram.

Публічні канали задаються у CHANNELS (username → місто/регіон).
Додаткові пари можна передати в .env: PARSER_EXTRA_CHANNELS=user:City,user2:City2

Приватні групи з посиланнями t.me/+...: акаунт парсера має бути учасником; далі можна
вказати у PARSER_EXTRA_CHANNELS публічний @username супергрупи, якщо з’явиться, або
numeric chat id (експериментально) після першого join.
"""

import asyncio
import re
import logging
import os
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────
# Конфігурація каналів: username -> місто
# ──────────────────────────────────────────────

CHANNELS: dict[str, str] = {
    # Berlin
    "baraholkaberlin": "Berlin",
    "kaufberli": "Berlin",
    "beauty_berlin_ua": "Berlin",
    # Leipzig
    "Leipzig_Flohmarkt": "Leipzig",
    # Hamburg
    "secondhand_hh": "Hamburg",
    "HamburgBeauty": "Hamburg",
    # Munich / Bayern
    "Flohmark11": "Munich",
    # Düsseldorf, Essen, NRW
    "komissionkaDusseldorf": "Düsseldorf",
    "komissionkaEssen": "Essen",
    "BeautyNRW": "NRW",
    "BeautyDusseldorf": "Düsseldorf",
    # Stuttgart
    "BaraholkaStuttgart": "Stuttgart",
    "UaStuttgart": "Stuttgart",
    # Cologne
    "keln3": "Cologne",
    # Misc / multi-city UA communities
    "ukraineingermany": "Germany",
    # Приватні запрошення: акаунт парсера має бути в групі; peer — повне посилання t.me/+...
    "https://t.me/+u9VcbxuhKik1M2My": "Dülmen",
    "https://t.me/+Yeu9vchwu6llZmYy": "NRW",
}


def _channels_from_env() -> dict[str, str]:
    raw = (os.getenv("PARSER_EXTRA_CHANNELS") or "").strip()
    if not raw:
        return {}
    extra: dict[str, str] = {}
    for part in raw.split(","):
        part = part.strip()
        if ":" not in part:
            continue
        u, city = part.rsplit(":", 1)
        u = u.strip().lstrip("@")
        city = city.strip()
        if u and city:
            extra[u] = city
    return extra


CHANNELS = {**CHANNELS, **_channels_from_env()}

# Канали з переважно послугами (краса): більше емодзі та інколи без фото — м’якші правила
BEAUTY_SERVICE_CHANNELS: frozenset[str] = frozenset({
    "beauty_berlin_ua",
    "BeautyNRW",
    "BeautyDusseldorf",
    "HamburgBeauty",
})

# Скільки останніх повідомлень перевіряти за один прохід
FETCH_LIMIT: int = int(os.getenv("PARSER_FETCH_LIMIT", "100"))

# ──────────────────────────────────────────────
# Допоміжні регулярні вирази
# ──────────────────────────────────────────────

PRICE_RE = re.compile(
    r"(\d[\d\s]*(?:[.,]\d+)?)\s*(?:[€$£]|євро|евро|эвро|euro|eur\b|грн|uah)"
    r"|(?:[€$£])\s*(\d[\d\s]*(?:[.,]\d+)?)"
    r"|(?:ціна|цiна|цена|price)\s*[:\s]*(\d[\d\s]*(?:[.,]\d+)?)\s*(?:[€$£]|євро|евро|эвро|euro|eur\b|грн|uah)?",
    re.IGNORECASE,
)

FREE_GIVEAWAY_RE = re.compile(
    r"\b(віддам|отдам|подарую|даром|віддаю|отдаю)\b"
    r"|^\s*(free|безкоштовно|бесплатно)\s*[:\s]"
    r"|\b(free|безкоштовно|бесплатно)\s*$",
    re.IGNORECASE,
)

SPAM_RE = re.compile(
    r"підробіток|подработка|робота на один день"
    r"|терміново куплю|срочно куплю"
    r"|шукаю перевізника|шукаю водія"
    r"|доставити.*з україни|привезти з україни"
    r"|сигарет|стики.*glo|glo.*стики"
    r"|куплю авто|куплю автомобіль",
    re.IGNORECASE,
)

NOT_LISTING_RE = re.compile(
    r"набір\s+на\s+урок|урок[иі]\s+німецької|індивідуальні\s+урок|1\s*:\s*1\s+онлайн|онлайн-школа"
    r"|магазин\w*\s+эксклюзивного|магазин\s+чаю|магазин\s+чая|эксклюзивного чая"
    r"|аниматор|аніматор|розваг[иі]\s+для\s+події|развлечен|fantasy\s*friends"
    r"|дати\s+виїзду|даты\s+выезда|трансфер\s|бронювання|бронирование"
    r"|люксембург\s+(як|как)|мюллерталь|вианден|поездк|поїздк\s+в\s+европ"
    r"|пасажирські\s+перевезення|пасажирские\s+перевозки|перевізник|перевозчик"
    r"|офіційний\s+ліцензійний\s+перевізник|адресна\s+доставка\s+посилок"
    r"|медикамент|отдать\s+в\s+больницу|в\s+любую\s+больницу|віддати\s+в\s+лікарню"
    r"|антидепрессант|противосудорожн|лекарств.*отдать|отдать.*лекарств",
    re.IGNORECASE,
)

GENERIC_TITLE_RE = re.compile(
    r"^[\s\U0001F300-\U0001F9FF\u2600-\u27BF]*"
    r"(продам|продаю|куплю|продажа|продаж|verkaufe|sell)\s*$",
    re.IGNORECASE,
)

_ONE_EMOJI = (
    r"[\U0001F300-\U0001F9FF\U0001F600-\U0001F64F\U0001F680-\U0001F6FF"
    r"\U00002600-\U000026FF\U00002700-\U000027BF]\uFE0F?"
)
TOO_MANY_EMOJI_RE = re.compile(f"({_ONE_EMOJI}){{5,}}")
ONE_EMOJI_RE = re.compile(_ONE_EMOJI)

SERVICE_AD_HINT_RE = re.compile(
    r"косметолог|перукар|перукарн|манікюр|маникюр|педикюр"
    r"|ін['\u2019]?єкц|инъекц|ботулін|ботулин|біоревітал|биоревитал"
    r"|контурн\w*\s+пластик|мезотерап|пілінг|пилинг|філер|филлер|прайс|запис\s+на"
    r"|послуг[иі]\b|услуг[иі]\b|виконую\s+такі\s+процедур|выполняю\s+такие\s+процедур"
    r"|процедур[иы]|прийом\s|прием\s|beauty\s|lash|brow\s|візаж|визаж",
    re.IGNORECASE,
)


# ──────────────────────────────────────────────
# Утиліти обробки тексту
# ──────────────────────────────────────────────

def _to_plain_str(s) -> str:
    if s is None:
        return ""
    return str(s).encode("utf-8", errors="replace").decode("utf-8")


def detect_lang(text: str) -> str:
    t = text.lower()
    uk = len(re.findall(r"[іїєґ']", t))
    ru = len(re.findall(r"[ыэё]", t))
    return "uk" if uk >= ru else "ru"


def message_link(channel: str, message_id: int) -> str:
    clean = re.sub(r"^https?://(?:www\.)?t\.me/", "", channel.strip().rstrip("/"))
    clean = clean.lstrip("@").split("/")[0]
    return f"https://t.me/{clean}/{message_id}"


def parse_price(text: str) -> tuple[Optional[str], Optional[str], bool]:
    """Повертає (price_str, currency, is_free)."""
    m = PRICE_RE.search(text)
    if m:
        raw = (m.group(1) or m.group(2) or m.group(3) or "").strip().replace(" ", "").replace(",", ".")
        if raw:
            window = text[max(0, m.start() - 2): m.end() + 8]
            if re.search(r"грн|uah", window, re.IGNORECASE):
                currency = "UAH"
            elif re.search(r"\$|usd", window, re.IGNORECASE):
                currency = "USD"
            else:
                currency = "EUR"
            return raw, currency, False

    lower = text.lower()
    if re.search(r"договір|договор|торг\b|по домовленост", lower):
        return "Договірна", None, False

    if FREE_GIVEAWAY_RE.search(text):
        return "Free", None, True

    return None, None, False


def _is_generic_title(title: str) -> bool:
    t = (title or "").strip()
    return len(t) < 25 and bool(GENERIC_TITLE_RE.match(t))


def extract_title(text: str) -> str:
    text = text.strip()
    first = re.split(r"[\n!?]|(?<=[.])\s", text, maxsplit=1)[0].strip()
    if _is_generic_title(first):
        rest = text[len(first):].lstrip()
        for line in re.split(r"\n+", rest):
            line = line.strip()
            if len(line) >= 2 and not _is_generic_title(line) and len(line) <= 200:
                first = line
                break
    return first[:97].rstrip() + "…" if len(first) > 100 else first


def extract_description(text: str, title: str) -> str:
    clean = title.rstrip("…")
    desc = text.strip()
    if desc.lower().startswith(clean.lower()):
        desc = desc[len(clean):].lstrip(" .,\n")
    return desc.strip() or text.strip()


def enrich_description(title: str, description: str) -> str:
    """
    Якщо опис порожній, дублює заголовок або складається лише з рядка з ціною —
    додаємо назву зверху, щоб картка не виглядала «голою».
    """
    t = (title or "").strip()
    d = (description or "").strip()
    if not d:
        return t
    d_flat = " ".join(d.split())
    t_flat = " ".join(t.split())
    if d_flat.lower() == t_flat.lower():
        return t
    lines = [x.strip() for x in d.splitlines() if x.strip()]
    if len(lines) == 1:
        line = lines[0]
        if len(line) < 120 and (
            PRICE_RE.search(line)
            or re.match(r"^[\d\s.,]+[\s€$£eur]*$", line, re.IGNORECASE)
        ):
            return f"{t}\n\n{line}".strip() if t else line
    if len(d) < 25 and t:
        return f"{t}\n\n{d}".strip()
    return d


def detect_condition(text: str, category: str) -> Optional[str]:
    if category in ("services_work", "realestate"):
        return None
    lower = text.lower()
    if re.search(r"\bнов(ий|ая|ое|і)\b|brand.?new|у коробці|в упаковке|запечатан", lower):
        return "new"
    return "used"


def get_sender_username(msg) -> Optional[str]:
    origin = getattr(msg, "forward_origin", None)
    if origin is not None:
        sender = getattr(origin, "sender_user", None)
        if sender is not None and getattr(sender, "username", None):
            return sender.username
    if getattr(msg, "from_user", None) and getattr(msg.from_user, "username", None):
        return msg.from_user.username
    return None


def get_sender_id(msg) -> Optional[int]:
    origin = getattr(msg, "forward_origin", None)
    if origin is not None:
        sender = getattr(origin, "sender_user", None)
        if sender is not None:
            return getattr(sender, "id", None)
    if getattr(msg, "from_user", None):
        return getattr(msg.from_user, "id", None)
    return None


def is_likely_service_ad(text: str) -> bool:
    return bool(SERVICE_AD_HINT_RE.search(text or ""))


def is_quality(text: str, has_photo: bool, relaxed: bool = False) -> tuple[bool, str]:
    t = text.strip()
    if relaxed:
        if len(t) < 25:
            return False, "замало тексту"
        if not has_photo and len(t) < 80:
            return False, "немає фото"
        if SPAM_RE.search(t):
            return False, "спам"
        return True, ""
    if not has_photo:
        return False, "немає фото"
    if len(t) < 20:
        return False, "замало тексту"
    if SPAM_RE.search(t):
        return False, "спам"
    return True, ""


def has_too_many_emojis(description: str) -> bool:
    if TOO_MANY_EMOJI_RE.search(description or ""):
        return True
    return len(ONE_EMOJI_RE.findall(description or "")) > 4


def is_likely_not_listing(title: str, description: str) -> bool:
    text = ((title or "") + " " + (description or "")).lower()
    return bool(NOT_LISTING_RE.search(text))


# ──────────────────────────────────────────────
# Завантаження фото з повідомлення
# ──────────────────────────────────────────────

PHOTOS_DIR = Path(__file__).resolve().parent.parent.parent / "database" / "parsed_photos"
PHOTOS_DIR.mkdir(parents=True, exist_ok=True)


async def download_photos(app, messages_with_photos: list, base_name: str, max_photos: int = 3) -> list[str]:
    """
    Завантажує фото в PHOTOS_DIR та повертає список відносних шляхів.
    Шляхи відносно BASE_DIR (database/parsed_photos/...).
    """
    paths = []
    limit = max_photos if max_photos > 0 else len(messages_with_photos)
    for i, m in enumerate(messages_with_photos[:limit]):
        suffix = f"_{i + 1}" if len(messages_with_photos) > 1 else ""
        filename = f"{base_name}{suffix}.jpg"
        photo_path = PHOTOS_DIR / filename
        try:
            await app.download_media(m, file_name=str(photo_path))
            paths.append(f"database/parsed_photos/{filename}")
        except Exception as e:
            logger.warning(f"Не вдалося завантажити фото [{m.id}]: {e}")
    return paths


# ──────────────────────────────────────────────
# Основна функція парсингу одного каналу
# ──────────────────────────────────────────────

async def parse_channel(app, channel: str, city: str, notify_callback) -> dict:
    """
    Парсить канал та викликає notify_callback(item_data) для кожного нового оголошення.
    Повертає статистику: {"added": int, "skipped": int, "reasons": dict}.
    """
    from parser.db import (
        parsed_item_exists,
        insert_parsed_item,
        ensure_parsed_items_table,
        fingerprint_parsed_text,
        parsed_item_content_hash_exists,
    )
    from parser.category_keywords import detect_category

    ensure_parsed_items_table()

    stats = {"added": 0, "skipped": 0, "reasons": {}}
    processed_groups: set[str] = set()

    logger.info(f"Парсимо канал {channel} (місто: {city}), ліміт: {FETCH_LIMIT}")

    async for msg in app.get_chat_history(channel, limit=FETCH_LIMIT):
        # ── Альбом (медіа-група) ──
        if getattr(msg, "media_group_id", None):
            gid = str(msg.media_group_id)
            if gid in processed_groups:
                continue
            processed_groups.add(gid)
            try:
                group = await msg.get_media_group()
            except Exception:
                group = [msg]
            first_with_cap = next((m for m in group if (m.text or m.caption)), group[0])
            text = _to_plain_str(first_with_cap.text or first_with_cap.caption or "")
            photos = [m for m in group if m.photo]
            msg_for_link = msg
            effective_message_id = msg.id
        else:
            text = _to_plain_str(msg.text or msg.caption or "")
            photos = [msg] if msg.photo else []
            msg_for_link = msg
            effective_message_id = msg.id

        # ── Дедуплікація за message_id ──
        if parsed_item_exists(channel, effective_message_id):
            stats["skipped"] += 1
            stats["reasons"]["дублікат (бд)"] = stats["reasons"].get("дублікат (бд)", 0) + 1
            continue

        content_hash = fingerprint_parsed_text(text)
        if parsed_item_content_hash_exists(content_hash):
            stats["skipped"] += 1
            stats["reasons"]["дублікат (текст)"] = stats["reasons"].get("дублікат (текст)", 0) + 1
            continue

        pre_category, _ = detect_category(text, skip_free=False)
        relaxed_quality = (
            channel in BEAUTY_SERVICE_CHANNELS
            or pre_category == "services_work"
            or is_likely_service_ad(text)
        )

        # ── Якість ──
        ok, reason = is_quality(text, len(photos) > 0, relaxed=relaxed_quality)
        if not ok:
            stats["skipped"] += 1
            stats["reasons"][reason] = stats["reasons"].get(reason, 0) + 1
            continue

        # ── Парсинг ──
        price_str, currency, is_free = parse_price(text)
        title = extract_title(text)
        description = enrich_description(title, extract_description(text, title))

        if is_likely_not_listing(title, description):
            stats["skipped"] += 1
            stats["reasons"]["не оголошення"] = stats["reasons"].get("не оголошення", 0) + 1
            continue

        if not relaxed_quality and has_too_many_emojis(description):
            stats["skipped"] += 1
            stats["reasons"]["багато емоджі"] = stats["reasons"].get("багато емоджі", 0) + 1
            continue

        category, subcategory = detect_category(text, skip_free=(price_str is not None and not is_free))
        condition = detect_condition(text, category)

        author_username = get_sender_username(msg_for_link)
        author_id = get_sender_id(msg_for_link)
        media_group_id = getattr(msg, "media_group_id", None)
        if media_group_id:
            media_group_id = str(media_group_id)

        # ── Завантаження фото (ASCII ім'я файлу — сумісність з ОС і веб) ──
        chan_slug = re.sub(r"[^a-z0-9]+", "_", channel.lower()).strip("_")[:24] or "ch"
        base_name = f"{chan_slug}_{effective_message_id}"
        images = await download_photos(app, photos, base_name, max_photos=3)

        # ── Збереження в БД ──
        item_id = insert_parsed_item(
            source_channel=channel,
            source_city=city,
            message_id=effective_message_id,
            media_group_id=media_group_id,
            author_username=author_username,
            author_id=author_id,
            title=title,
            description=description,
            price=price_str,
            currency=currency,
            is_free=is_free,
            category=category,
            subcategory=subcategory,
            condition=condition,
            location=city,
            images=images,
            raw_text=text[:4000],
            content_hash=content_hash,
        )

        if item_id:
            item_data = {
                "id": item_id,
                "source_channel": channel,
                "source_city": city,
                "message_id": effective_message_id,
                "author_username": author_username,
                "author_id": author_id,
                "title": title,
                "description": description,
                "price": price_str,
                "currency": currency,
                "is_free": is_free,
                "category": category,
                "subcategory": subcategory,
                "condition": condition,
                "location": city,
                "images": images,
                "raw_text": text[:4000],
                "msg_link": message_link(channel, effective_message_id),
            }
            # Сповіщаємо адміна
            try:
                await notify_callback(item_data)
                # Затримка між оголошеннями щоб не потрапити в flood control
                await asyncio.sleep(3)
            except Exception as e:
                logger.error(f"Помилка сповіщення адміна для item {item_id}: {e}")

            stats["added"] += 1
            logger.info(f"  ✅ [{channel}/{effective_message_id}] {title[:50]}")
        else:
            stats["skipped"] += 1
            stats["reasons"]["дублікат (бд)"] = stats["reasons"].get("дублікат (бд)", 0) + 1

    return stats


# ──────────────────────────────────────────────
# Запуск парсингу всіх каналів
# ──────────────────────────────────────────────

async def run_all_channels(app, notify_callback) -> dict:
    """Парсить всі канали з CHANNELS словника."""
    total = {"added": 0, "skipped": 0}
    for channel, city in CHANNELS.items():
        try:
            stats = await parse_channel(app, channel, city, notify_callback)
            total["added"] += stats["added"]
            total["skipped"] += stats["skipped"]
            logger.info(
                f"Канал {channel}: +{stats['added']} нових, пропущено {stats['skipped']}"
            )
        except Exception as e:
            logger.error(f"Помилка парсингу каналу {channel}: {e}", exc_info=True)
    return total
