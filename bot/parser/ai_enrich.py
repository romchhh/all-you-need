"""
AI-збагачення парсованих оголошень при підтвердженні модератором (OpenAI).

Аналізує текст + фото і повертає:
  - заголовок, опис
  - категорію / підкатегорію
  - ціну (або «Договірна»)
  - місто
  - стан (new/used)

.env:
  OPENAI_API_KEY          — обовʼязково для AI
  OPENAI_MODEL            — за замовч. gpt-4o-mini
  PARSER_AI_ENABLED       — 1/0 (за замовч. 1 якщо є ключ)
  PARSER_AI_MAX_IMAGES    — скільки фото надсилати в vision (за замовч. 3)
"""

from __future__ import annotations

import base64
import json
import logging
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent.parent.parent
PHOTOS_DIR = BASE_DIR / "database" / "parsed_photos"
PUBLIC_DIR = BASE_DIR / "app" / "public"

OPENAI_API_KEY = (os.getenv("OPENAI_API_KEY") or "").strip()
OPENAI_MODEL = (os.getenv("OPENAI_MODEL") or "gpt-4o-mini").strip()
PARSER_AI_MAX_IMAGES = max(0, min(5, int(os.getenv("PARSER_AI_MAX_IMAGES", "3"))))

GERMAN_CITIES = [
    "Berlin", "Hamburg", "München", "Köln", "Frankfurt", "Stuttgart",
    "Düsseldorf", "Leipzig", "Dortmund", "Essen", "Bremen", "Dresden",
    "Hannover", "Nürnberg", "Duisburg", "Bochum", "Wuppertal", "Bielefeld",
    "Bonn", "Münster", "Karlsruhe", "Mannheim", "Augsburg", "Wiesbaden",
    "Aachen", "Mönchengladbach", "Gelsenkirchen", "Braunschweig", "Kiel",
    "Freiburg im Breisgau", "Lübeck", "Erfurt", "Rostock", "Mainz", "Kassel",
    "Potsdam", "Heidelberg", "Darmstadt", "Regensburg", "Würzburg", "Ulm",
    "Dülmen", "NRW", "Germany",
]

NEGOTIABLE_PRICES = frozenset({
    "договірна", "договорная", "negotiable", "договірна ціна", "по договоренности",
})


@dataclass
class AiEnrichmentResult:
    title: str
    description: str
    category: str
    subcategory: Optional[str]
    price: Optional[str]
    currency: Optional[str]
    is_free: bool
    location: str
    condition: Optional[str]
    applied: bool = True
    summary: str = ""


def is_ai_enrich_enabled() -> bool:
    if not OPENAI_API_KEY:
        return False
    raw = (os.getenv("PARSER_AI_ENABLED") or "1").strip().lower()
    return raw not in ("0", "false", "no", "off")


def _category_taxonomy() -> str:
    from parser.category_keywords import CATEGORY_KEYWORDS

    lines: list[str] = []
    for cat, subs in CATEGORY_KEYWORDS.items():
        sub_ids = [s for s in subs.keys() if s and not s.startswith("other_")]
        lines.append(f"- {cat}: [{', '.join(sub_ids) or '—'}]")
    return "\n".join(lines)


def _resolve_local_image_path(rel: str) -> Optional[Path]:
    if not rel or not isinstance(rel, str):
        return None
    s = rel.strip().lstrip("/")
    if s.startswith("http://") or s.startswith("https://"):
        return None
    candidates = [
        BASE_DIR / s,
        PHOTOS_DIR / Path(s).name,
        PUBLIC_DIR / s.removeprefix("public/"),
    ]
    for p in candidates:
        if p.is_file():
            return p
    return None


def _image_to_data_url(path: Path) -> Optional[str]:
    try:
        raw = path.read_bytes()
        if len(raw) > 4_500_000:
            return None
        b64 = base64.standard_b64encode(raw).decode("ascii")
        return f"data:image/jpeg;base64,{b64}"
    except Exception as e:
        logger.warning("AI enrich: не вдалося прочитати фото %s: %s", path, e)
        return None


def _normalize_price_fields(
    price_raw: Any,
    currency_raw: Any,
    is_free_raw: Any,
    text_hint: str,
) -> tuple[Optional[str], Optional[str], bool]:
    is_free = bool(is_free_raw)
    if is_free:
        return "Free", None, True

    price_s = str(price_raw or "").strip()
    currency = (str(currency_raw or "").strip().upper() or None)
    if currency not in ("EUR", "USD", "UAH"):
        currency = "EUR" if price_s else None

    lower = (text_hint or "").lower()
    if not price_s or price_s.lower() in NEGOTIABLE_PRICES:
        if re.search(r"\b(безкоштовно|бесплатно|віддам|отдам|free)\b", lower):
            return "Free", None, True
        return "Договірна", None, False

    cleaned = price_s.replace(" ", "").replace(",", ".")
    if cleaned.lower() in NEGOTIABLE_PRICES:
        return "Договірна", None, False

    m = re.search(r"(\d+(?:[.,]\d+)?)", cleaned)
    if not m:
        return "Договірна", None, False

    num = m.group(1).replace(",", ".")
    return num, currency or "EUR", False


def _validate_category(category: str, subcategory: Optional[str]) -> tuple[str, Optional[str]]:
    from parser.category_keywords import CATEGORY_KEYWORDS

    cat = (category or "other").strip().lower()
    if cat not in CATEGORY_KEYWORDS:
        cat = "other"
        sub = None
    else:
        subs = CATEGORY_KEYWORDS[cat]
        sub = (subcategory or "").strip() or None
        if sub and sub not in subs:
            sub = next((k for k in subs if k.startswith("other_")), None)
    if cat in ("services_work", "realestate"):
        return cat, sub
    return cat, sub


def _validate_location(location: str, channel_city: str, text: str) -> str:
    from utils.location_normalization import normalize_city_name

    loc = (location or "").strip()
    if loc:
        normalized = normalize_city_name(loc)
        if normalized:
            return normalized
    if channel_city:
        return channel_city
    combined = f"{text}\n{channel_city}"
    lower = combined.lower()
    for city in GERMAN_CITIES:
        if city.lower() in lower or city.replace("ü", "u").replace("ö", "o").lower() in lower:
            return city
    return channel_city or "Germany"


def _validate_condition(condition: Any, category: str) -> Optional[str]:
    if category in ("services_work", "realestate"):
        return None
    c = str(condition or "").strip().lower()
    if c in ("new", "used"):
        return c
    return "used"


def _build_prompt(item: dict) -> str:
    channel_city = item.get("source_city") or item.get("location") or ""
    return f"""Проаналізуй оголошення з Telegram-барахолки (Німеччина, UA/RU аудиторія).

Поточні дані парсера (можуть бути неточними):
- title: {item.get("title") or ""}
- description: {item.get("description") or ""}
- category: {item.get("category") or ""}
- subcategory: {item.get("subcategory") or ""}
- price: {item.get("price") or ""}
- currency: {item.get("currency") or ""}
- is_free: {bool(item.get("is_free"))}
- location/channel city: {channel_city}
- condition: {item.get("condition") or ""}
- raw_text: {(item.get("raw_text") or "")[:2500]}

Канал-джерело: {item.get("source_channel") or ""}

Дозволені категорії та підкатегорії (використовуй ТІЛЬКИ ці id):
{_category_taxonomy()}

Міста (канонічні назви): {", ".join(GERMAN_CITIES[:40])}, …

Правила:
1. title — короткий, зрозумілий, до 100 символів, без «продам/продаю» на початку якщо можна.
2. description — чистий опис товару/послуги українською або російською (як у оригіналі), без посилань на канал, без хештегів сміття.
3. category/subcategory — найточніші id зі списку вище.
4. price — число як рядок (напр. "25" або "25.50"); якщо ціни немає — price null і is_free false (договірна).
5. is_free — true лише якщо безкоштовно віддають.
6. currency — EUR за замовчуванням у Німеччині; UAH лише якщо явно грн.
7. location — місто з тексту або {channel_city}; німецькі назви (München, Köln, Frankfurt).
8. condition — "new" або "used" для товарів; null для services_work і realestate.

Поверни ТІЛЬКИ JSON:
{{
  "title": "...",
  "description": "...",
  "category": "...",
  "subcategory": "... або null",
  "price": "... або null",
  "currency": "EUR|USD|UAH|null",
  "is_free": false,
  "location": "...",
  "condition": "new|used|null",
  "changes_summary": "коротко українською що виправлено"
}}"""


async def enrich_parsed_item_with_ai(
    item: dict,
    local_image_paths: Optional[list[str]] = None,
) -> Optional[AiEnrichmentResult]:
    """Викликає OpenAI; при помилці повертає None (fallback на дані парсера)."""
    if not is_ai_enrich_enabled():
        return None

    try:
        from openai import AsyncOpenAI
    except ImportError:
        logger.error("openai не встановлено. pip install openai")
        return None

    user_content: list[dict[str, Any]] = [
        {"type": "text", "text": _build_prompt(item)},
    ]

    added = 0
    for rel in local_image_paths or []:
        if added >= PARSER_AI_MAX_IMAGES:
            break
        p = _resolve_local_image_path(rel)
        if not p:
            continue
        data_url = _image_to_data_url(p)
        if data_url:
            user_content.append({"type": "image_url", "image_url": {"url": data_url}})
            added += 1

    client = AsyncOpenAI(api_key=OPENAI_API_KEY)
    try:
        response = await client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Ти модератор маркетплейсу Trade Ground для українців/росіян у Німеччині. "
                        "Покращуй оголошення з барахолок: точний заголовок, категорія, ціна, місто. "
                        "Відповідай лише валідним JSON без markdown."
                    ),
                },
                {"role": "user", "content": user_content},
            ],
            response_format={"type": "json_object"},
            temperature=0.2,
            max_tokens=1200,
            timeout=60,
        )
    except Exception as e:
        logger.error("OpenAI enrich failed: %s", e, exc_info=True)
        return None

    raw = (response.choices[0].message.content or "").strip()
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        logger.error("OpenAI enrich: invalid JSON: %s", raw[:500])
        return None

    title = str(data.get("title") or item.get("title") or "").strip()[:200]
    description = str(data.get("description") or item.get("description") or "").strip()
    if not title:
        title = str(item.get("title") or "Оголошення")[:100]

    category, subcategory = _validate_category(
        str(data.get("category") or ""),
        data.get("subcategory"),
    )
    channel_city = item.get("source_city") or item.get("location") or "Germany"
    location = _validate_location(
        str(data.get("location") or ""),
        channel_city,
        f"{title}\n{description}\n{item.get('raw_text') or ''}",
    )
    price, currency, is_free = _normalize_price_fields(
        data.get("price"),
        data.get("currency"),
        data.get("is_free"),
        f"{description}\n{item.get('raw_text') or ''}",
    )
    condition = _validate_condition(data.get("condition"), category)
    summary = str(data.get("changes_summary") or "").strip()

    return AiEnrichmentResult(
        title=title,
        description=description or str(item.get("description") or ""),
        category=category,
        subcategory=subcategory,
        price=price,
        currency=currency,
        is_free=is_free,
        location=location,
        condition=condition,
        applied=True,
        summary=summary,
    )


def merge_enrichment_into_item(item: dict, enriched: AiEnrichmentResult) -> dict:
    """Повертає копію item з полями після AI."""
    out = dict(item)
    out["title"] = enriched.title
    out["description"] = enriched.description
    out["category"] = enriched.category
    out["subcategory"] = enriched.subcategory
    out["price"] = enriched.price
    out["currency"] = enriched.currency
    out["is_free"] = enriched.is_free
    out["location"] = enriched.location
    out["condition"] = enriched.condition
    return out
