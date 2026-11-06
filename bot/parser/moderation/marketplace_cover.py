"""
Растрова обкладинка як у маркетплейсі (ListingAutoCover, темна тема).

Колір стабільний від id оголошення, іконка — від ключових слів і категорії,
текст — скорочена назва. Файл кешується і віддається в канал, коли фото немає.
"""

from __future__ import annotations

import hashlib
import logging
import math
import re
import tempfile
from pathlib import Path

logger = logging.getLogger(__name__)

_BOT_DIR = Path(__file__).resolve().parents[2]
_FONT_PATH = _BOT_DIR / "assets" / "fonts" / "NotoSans-SemiBold.ttf"
_ICON_DIR = _BOT_DIR / "assets" / "cover_icons"
_CACHE_DIR = Path(tempfile.gettempdir()) / "allyouneed-marketplace-covers"

_SIZE = 1080
_MAX_TITLE = 40

# Той самий набір, що LISTING_COVER_SCHEMES у app/lib/listings/autoCover.ts (dark).
_SCHEMES: tuple[tuple[int, str, str, str, str], ...] = (
    (148, "#243020", "#2F3F28", "#1A2418", "#E8F0E0"),
    (162, "#2A3A1C", "#3A4E28", "#1C2814", "#C8E6A0"),
    (200, "#3F5331", "#4A6140", "#2A3824", "#EAF4DC"),
    (185, "#1A2C18", "#284024", "#101C10", "#B8D49A"),
    (135, "#2A2E20", "#3A4030", "#1C2018", "#E2E8D0"),
    (120, "#1A3028", "#28483C", "#102018", "#B8E8D4"),
    (210, "#283818", "#3A5024", "#182410", "#D0ECA0"),
    (95, "#2C3218", "#3E4624", "#1C2010", "#E4ECB8"),
    (175, "#1A2E2C", "#284440", "#101E1C", "#B8E0D8"),
    (220, "#1A2C3A", "#243E52", "#101C28", "#B8DCF0"),
    (155, "#203430", "#2E4840", "#142420", "#D0E8E0"),
    (190, "#1C2218", "#2A3424", "#101410", "#C8E6A0"),
    (110, "#1E3A1C", "#2E5228", "#122814", "#B8E8A8"),
    (140, "#2A2820", "#3A3830", "#1C1A16", "#E8E4D4"),
    (168, "#223822", "#324E30", "#142414", "#C4E8B8"),
    (205, "#141C12", "#24301E", "#0A100A", "#C8E6A0"),
)

_SUBCATEGORY_TO_ICON = {
    "beauty_health": "beauty_wellness",
    "beauty_services": "beauty_wellness",
    "auto_services": "auto",
    "repair_installation": "home",
    "cleaning": "home",
    "transportation": "auto",
    "photo_video": "electronics",
    "it_design_websites": "electronics",
    "education_tutors": "services_work",
    "translations": "services_work",
    "consultations": "services_work",
    "other_services": "services_work",
    "services": "services_work",
    "vacancies": "services_work",
    "part_time": "services_work",
    "looking_for_work": "services_work",
    "other_work": "services_work",
    "smartphones": "electronics",
    "computers_laptops": "electronics",
    "tv_audio": "electronics",
    "games_consoles": "electronics",
    "large_appliances": "appliances",
    "small_appliances": "appliances",
    "kitchen_appliances": "appliances",
    "sofas_chairs": "furniture",
    "wardrobes_chests": "furniture",
    "tables_chairs": "furniture",
    "beds_mattresses": "furniture",
    "women_clothing": "fashion",
    "women_shoes": "fashion",
    "men_clothing": "fashion",
    "men_shoes": "fashion",
    "accessories": "fashion",
    "hats": "fashion",
}

_KNOWN_CATEGORIES = {
    "fashion",
    "beauty_wellness",
    "furniture",
    "electronics",
    "appliances",
    "kids",
    "home",
    "auto",
    "hobby_sports",
    "pets",
    "realestate",
    "services_work",
    "free",
    "food_gastro",
    "all_categories",
}

_CATEGORY_LUCIDE = {
    "fashion": "Shirt",
    "furniture": "Sofa",
    "electronics": "Smartphone",
    "appliances": "Home",
    "kids": "Baby",
    "home": "Home",
    "auto": "Car",
    "pets": "PawPrint",
    "realestate": "Home",
    "beauty_wellness": "Sparkles",
    "services_work": "Briefcase",
    "free": "Sparkles",
    "hobby_sports": "Sparkles",
}

_ICON_RULES: tuple[tuple[str, tuple[re.Pattern[str], ...]], ...] = (
    ("Hand", (re.compile(r"маникюр|манікюр|педикюр|ногт|нігт|гель[\s-]?лак|nail", re.I),)),
    ("Eye", (re.compile(r"ресниц|вії|вій\b|ламинир|ламінув|наращиван.*ресн|наращуван.*вій|lash", re.I),)),
    ("Scissors", (re.compile(r"кератин|ботокс\s*волос|стрижк|перук|парикмах|волос|hair|ботокс.*вол", re.I),)),
    ("HeartPulse", (re.compile(r"массаж|масаж|массажист|масажист|massage", re.I),)),
    ("Paintbrush", (re.compile(r"макияж|макіяж|визажист|візажист|makeup|make[\s-]?up", re.I),)),
    ("SprayCan", (re.compile(r"уборк|прибиран|клининг|клінінг|cleaning|haushalt", re.I),)),
    ("Languages", (re.compile(r"переводчик|перекладач|перевод[ыі]|переклад[ии]|dolmetsch|translator", re.I),)),
    ("Laptop", (re.compile(r"сайт|разработк|розробк|smm|web[\s-]?design|программист|програміст|frontend|backend", re.I),)),
    ("Wrench", (re.compile(r"ремонт|монтаж|сантехн|электрик|електрик|мастер\s*на\s*час|майстер\s*на\s*час", re.I),)),
    (
        "Truck",
        (re.compile(r"перевозк|перевезен|грузоперевоз|вантажоперевез|транспорт|умз[уу]г|umzug|lieferung", re.I),),
    ),
    ("GraduationCap", (re.compile(r"репетитор|обучен|навчан|урок|tutor|nachhilfe|школ", re.I),)),
    ("HeartHandshake", (re.compile(r"сиделк|догляд|уход\s*за\s*пожил|pflege|betreu", re.I),)),
    ("Camera", (re.compile(r"фото|видео|відео|съ[её]мк|зйомк|photographer|video", re.I),)),
    ("Car", (re.compile(r"автосервис|автосервіс|шиномонтаж|СТО\b|тюнинг|авто\s*мастер", re.I),)),
    ("Briefcase", (re.compile(r"ваканс|ищу\s*работ|шукаю\s*робот|подработ|підробіт|job\b|stelle", re.I),)),
)


def _to_int32(value: int) -> int:
    value &= 0xFFFFFFFF
    if value >= 0x80000000:
        value -= 0x100000000
    return value


def hash_listing_id(listing_id) -> int:
    """FNV-1a, як hashListingId у autoCover.ts (Math.imul + >>> 0)."""
    text = "0" if listing_id is None else str(listing_id)
    hashed = 2166136261
    for char in text:
        hashed = _to_int32(hashed) ^ ord(char)
        hashed = _to_int32(_to_int32(hashed) * 16777619)
    return hashed & 0xFFFFFFFF


def cover_scheme_index(listing_id) -> int:
    return hash_listing_id(listing_id) % len(_SCHEMES)


def cover_gradient_angle(listing_id) -> int:
    angle, *_colors = _SCHEMES[cover_scheme_index(listing_id)]
    shift = (hash_listing_id(listing_id) >> 8) % 49
    return (angle + shift) % 360


def shorten_cover_title(title: str, max_len: int = _MAX_TITLE) -> str:
    base = re.sub(r"\s+", " ", title or "").strip()
    if not base:
        return "—"
    if len(base) <= max_len:
        return base
    sliced = base[: max_len + 1]
    cut = sliced.rfind(" ")
    word_safe = sliced[:cut] if cut > max_len * 0.45 else base[:max_len]
    word_safe = re.sub(r"[,\-–—:;]+$", "", word_safe).strip()
    return f"{word_safe}…"


def resolve_cover_icon_category(category: str | None, subcategory: str | None) -> str:
    sub = (subcategory or "").strip().lower()
    if sub and sub in _SUBCATEGORY_TO_ICON:
        return _SUBCATEGORY_TO_ICON[sub]
    if sub and sub in _KNOWN_CATEGORIES:
        return sub
    cat = (category or "").strip().lower()
    if cat in _KNOWN_CATEGORIES:
        return cat
    return "all_categories"


def resolve_cover_icon_name(
    *,
    title: str | None,
    description: str | None,
    category: str | None,
    subcategory: str | None,
) -> str:
    blob = f"{title or ''}\n{(description or '').strip()[:120]}"
    for name, patterns in _ICON_RULES:
        if any(pattern.search(blob) for pattern in patterns):
            return name
    cat_id = resolve_cover_icon_category(category, subcategory)
    return _CATEGORY_LUCIDE.get(cat_id) or cat_id


def _hex(color: str) -> tuple[int, int, int]:
    raw = color.lstrip("#")
    return int(raw[0:2], 16), int(raw[2:4], 16), int(raw[4:6], 16)


def _gradient(angle_deg: int, accent: str, bg: str, deep: str):
    import numpy as np

    rad = math.radians(angle_deg)
    dx = math.sin(rad)
    dy = -math.cos(rad)
    ys, xs = np.mgrid[0:_SIZE, 0:_SIZE]
    cx = (_SIZE - 1) / 2
    cy = (_SIZE - 1) / 2
    proj = (xs - cx) * dx + (ys - cy) * dy
    span = float(proj.max() - proj.min()) or 1.0
    t = (proj - float(proj.min())) / span
    accent_rgb = np.array(_hex(accent), dtype=np.float32)
    bg_rgb = np.array(_hex(bg), dtype=np.float32)
    deep_rgb = np.array(_hex(deep), dtype=np.float32)
    t1 = np.clip(t / 0.42, 0, 1)[..., None]
    t2 = np.clip((t - 0.42) / 0.58, 0, 1)[..., None]
    left = accent_rgb * (1 - t1) + bg_rgb * t1
    right = bg_rgb * (1 - t2) + deep_rgb * t2
    image = np.where(t[..., None] <= 0.42, left, right)

    def glow(cx_frac: float, cy_frac: float, rx_frac: float, ry_frac: float, color: str, alpha: int, fade: float):
        cx_px = cx_frac * (_SIZE - 1)
        cy_px = cy_frac * (_SIZE - 1)
        rx = max(rx_frac * _SIZE, 1)
        ry = max(ry_frac * _SIZE, 1)
        dist = np.sqrt(((xs - cx_px) / rx) ** 2 + ((ys - cy_px) / ry) ** 2)
        mask = np.clip(1 - dist / fade, 0, 1) * (alpha / 255) * 0.18
        return mask[..., None], np.array(_hex(color), dtype=np.float32)

    for mask, color in (
        glow(0.50, 0.20, 0.75, 0.50, accent, 0xAA, 0.70),
        glow(0.50, 1.00, 0.65, 0.40, deep, 0x99, 0.65),
    ):
        image = image * (1 - mask) + color * mask
    return np.clip(image, 0, 255).astype("uint8")


def _load_font(size: int):
    from PIL import ImageFont

    if _FONT_PATH.is_file():
        return ImageFont.truetype(str(_FONT_PATH), size=size)
    for fallback in (
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    ):
        if Path(fallback).is_file():
            return ImageFont.truetype(fallback, size=size)
    return ImageFont.load_default()


def _wrap_lines(text: str, font, max_width: int, max_lines: int = 2) -> list[str]:
    words = text.split()
    if not words:
        return ["—"]
    lines: list[str] = []
    index = 0
    while index < len(words) and len(lines) < max_lines:
        line = words[index]
        index += 1
        while index < len(words):
            trial = f"{line} {words[index]}"
            if font.getlength(trial) <= max_width:
                line = trial
                index += 1
            else:
                break
        if len(lines) == max_lines - 1 and index < len(words):
            while " " in line and font.getlength(f"{line}…") > max_width:
                line = line.rsplit(" ", 1)[0]
            line = re.sub(r"[,\-–—:;]+$", "", line).strip() + "…"
        lines.append(line)
    return lines


def _tinted_icon(icon_name: str, color: tuple[int, int, int], size: int):
    from PIL import Image

    path = _ICON_DIR / f"{icon_name}.png"
    if not path.is_file():
        return None
    icon = Image.open(path).convert("RGBA")
    alpha = icon.getchannel("A").point(lambda px: int(px * 0.9))
    tinted = Image.new("RGBA", icon.size, (*color, 255))
    tinted.putalpha(alpha)
    return tinted.resize((size, size), Image.Resampling.LANCZOS)


def render_marketplace_cover(
    *,
    listing_id,
    title: str,
    description: str | None = None,
    category: str | None = None,
    subcategory: str | None = None,
) -> str | None:
    """Повертає шлях до JPEG або None, якщо намалювати не вдалося."""
    try:
        import numpy  # noqa: F401
        from PIL import Image, ImageDraw
    except Exception as exc:
        logger.warning("Авто-обкладинка недоступна (Pillow/numpy): %s", exc)
        return None

    sub = subcategory if isinstance(subcategory, str) else None
    icon_name = resolve_cover_icon_name(
        title=title,
        description=description,
        category=category,
        subcategory=sub,
    )
    display = shorten_cover_title(title)
    digest = hashlib.sha1(
        f"{listing_id}|{display}|{icon_name}|{category or ''}|{sub or ''}".encode("utf-8")
    ).hexdigest()[:12]
    _CACHE_DIR.mkdir(parents=True, exist_ok=True)
    dest = _CACHE_DIR / f"{listing_id}-{digest}.jpg"
    if dest.is_file() and dest.stat().st_size > 1000:
        return str(dest)

    try:
        bg, accent, deep, fg = _SCHEMES[cover_scheme_index(listing_id)][1:]
        angle = cover_gradient_angle(listing_id)
        canvas = Image.fromarray(_gradient(angle, accent, bg, deep), mode="RGB")
        draw = ImageDraw.Draw(canvas)
        fg_rgb = _hex(fg)
        max_width = int(_SIZE * 0.72)
        font_size = 64
        font = _load_font(font_size)
        lines = _wrap_lines(display, font, max_width)
        while font_size > 42 and any(font.getlength(line.rstrip("…")) > max_width for line in lines):
            font_size -= 4
            font = _load_font(font_size)
            lines = _wrap_lines(display, font, max_width)

        icon_size = 250
        icon = _tinted_icon(icon_name, fg_rgb, icon_size)
        line_h = int(font_size * 1.28)
        text_h = line_h * len(lines)
        gap = 42 if icon is not None else 0
        icon_h = icon_size if icon is not None else 0
        group_h = icon_h + gap + text_h
        top = max(48, (_SIZE - group_h) // 2)
        if icon is not None:
            canvas.paste(icon, ((_SIZE - icon_size) // 2, top), icon)
        text_top = top + icon_h + gap
        for index, line in enumerate(lines):
            width = font.getlength(line)
            draw.text(((_SIZE - width) / 2, text_top + index * line_h), line, font=font, fill=fg_rgb)
        canvas.save(dest, format="JPEG", quality=90, optimize=True)
        return str(dest)
    except Exception as exc:
        logger.warning("Не вдалося намалювати авто-обкладинку listing %s: %s", listing_id, exc)
        return None
