"""
AI-збагачення парсованих оголошень при підтвердженні модератором (OpenAI).

Аналізує лише текст і повертає:
  - заголовок, опис (російською)
  - категорію / підкатегорію (id маркетплейсу)
  - ціну (або «Договорная»)
  - місто
  - стан (new/used)

.env:
  OPENAI_API_KEY    — обовʼязково для AI
  OPENAI_MODEL      — за замовч. gpt-4o-mini
  PARSER_AI_ENABLED — 1/0 (за замовч. 1 якщо є ключ)
"""

from __future__ import annotations

import json
import logging
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional

from dotenv import load_dotenv

from parser.marketplace_categories import (
    clean_title,
    marketplace_taxonomy_for_ai,
    resolve_marketplace_category,
)

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

logger = logging.getLogger(__name__)

OPENAI_API_KEY = (os.getenv("OPENAI_API_KEY") or "").strip()
OPENAI_MODEL = (os.getenv("OPENAI_MODEL") or "gpt-4o-mini").strip()

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


def _normalize_price_fields(
    price_raw: Any,
    currency_raw: Any,
    is_free_raw: Any,
    text_hint: str,
    *,
    category: str | None = None,
) -> tuple[Optional[str], Optional[str], bool]:
    """
    Free — лише при явних маркерах у тексті.
    Для services_work без числової ціни — завжди «Договорная».
    """
    price_s = str(price_raw or "").strip()
    currency = (str(currency_raw or "").strip().upper() or None)
    if currency not in ("EUR", "USD", "UAH"):
        currency = "EUR" if price_s else None

    lower = (text_hint or "").lower()
    explicit_free = bool(
        re.search(r"\b(безкоштовно|бесплатно|віддам|отдам|даром|free)\b", lower)
    )
    is_services = (category or "").strip().lower() == "services_work"

    # Не довіряємо голому is_free від AI без текстових маркерів (особливо для послуг).
    if bool(is_free_raw) and explicit_free:
        return "Free", None, True
    if explicit_free and (not price_s or price_s.lower() in NEGOTIABLE_PRICES or "free" in price_s.lower()):
        return "Free", None, True

    if not price_s or price_s.lower() in NEGOTIABLE_PRICES or price_s.lower() in ("free", "0"):
        if is_services or not explicit_free:
            return "Договорная", None, False
        return "Договорная", None, False

    cleaned = price_s.replace(" ", "").replace(",", ".")
    if cleaned.lower() in NEGOTIABLE_PRICES or cleaned.lower() == "free":
        return "Договорная", None, False

    m = re.search(r"(\d+(?:[.,]\d+)?)", cleaned)
    if not m:
        return "Договорная", None, False

    num = m.group(1).replace(",", ".")
    try:
        if float(num) <= 0:
            return "Договорная", None, False
    except ValueError:
        return "Договорная", None, False
    return num, currency or "EUR", False


def _validate_location(location: str, channel_city: str, text: str) -> str:
    from utils.location_normalization import normalize_city_name

    loc = (location or "").strip()
    if loc:
        normalized = normalize_city_name(loc)
        if normalized:
            return normalized
    if channel_city:
        return normalize_city_name(channel_city) or channel_city
    combined = f"{text}\n{channel_city}"
    lower = combined.lower()
    for city in GERMAN_CITIES:
        if city.lower() in lower or city.replace("ü", "u").replace("ö", "o").lower() in lower:
            return city
    return normalize_city_name(channel_city) or channel_city or "Germany"


def _validate_condition(condition: Any, category: str) -> Optional[str]:
    cat = (category or "").strip().lower()
    if cat == "services_work":
        return "new"
    if cat in ("realestate", "free"):
        return None
    c = str(condition or "").strip().lower()
    if c in ("new", "used"):
        return c
    return "used"


def _build_prompt(item: dict) -> str:
    channel_city = item.get("source_city") or item.get("location") or ""
    raw_text = (item.get("raw_text") or "")[:2500]
    parser_cat = item.get("category") or ""
    parser_sub = item.get("subcategory") or ""

    return f"""Проанализируй объявление с Telegram-барахолки (Германия, рус/укр аудитория).
Используй ТОЛЬКО текст ниже — фото нет.

Текст объявления (raw_text):
{raw_text}

Подсказки парсера (могут быть неточными, не копируй слепо):
- title: {item.get("title") or ""}
- description: {item.get("description") or ""}
- category/sub (парсер): {parser_cat}/{parser_sub}
- price: {item.get("price") or ""} {item.get("currency") or ""}
- is_free: {bool(item.get("is_free"))}
- город канала: {channel_city}
- condition: {item.get("condition") or ""}
- канал: {item.get("source_channel") or ""}

Категории маркетплейса — используй ТОЛЬКО эти id (category / subcategory):
{marketplace_taxonomy_for_ai()}

Города (канонические): {", ".join(GERMAN_CITIES[:40])}, …

Правила:
1. title — на РУССКОМ, до 80 символов. Конкретное название товара/услуги: бренд, модель, тип.
   НЕ начинай с «продам/продаю/отдам», без эмодзи и хештегов. Не копируй первую строку поста дословно.
2. description — на РУССКОМ (переведи с украинского если нужно). Чистый текст: что продаётся,
   состояние, комплектация, цена если есть. Без ссылок на канал, без «пишите в лс», без хештегов.
3. category/subcategory — самые точные id из списка маркетплейса выше.
   Обязательно укажи подкатегорию (subcategory), не оставляй только category.
   Услуги (маникюр, ремонт, репетитор) → services_work + нужная подкатегория.
   Товары → соответствующий раздел (electronics, fashion, kids, furniture и т.д.) + подкатегория.
4. price — число строкой ("25" или "25.50"); если цены нет → null (договорная).
5. is_free — true ТОЛЬКО если в тексте явно «бесплатно/віддам/даром/free». Для услуг без цены is_free=false.
6. currency — EUR по умолчанию; UAH только если явно грн.
7. location — город НЕМЕЦКИМ оригиналом (Hamburg, München, Köln…), не перевод.
8. condition — "new" или "used" для товаров; для services_work ВСЕГДА "new".

Верни ТОЛЬКО JSON:
{{
  "title": "...",
  "description": "...",
  "category": "...",
  "subcategory": "... или null",
  "price": "... или null",
  "currency": "EUR|USD|UAH|null",
  "is_free": false,
  "location": "...",
  "condition": "new|used|null",
  "changes_summary": "коротко по-русски что исправлено"
}}"""


async def enrich_parsed_item_with_ai(item: dict) -> Optional[AiEnrichmentResult]:
    """Викликає OpenAI (лише текст); при помилці повертає None (fallback на дані парсера)."""
    if not is_ai_enrich_enabled():
        return None

    try:
        from openai import AsyncOpenAI
    except ImportError:
        logger.error("openai не встановлено. pip install openai")
        return None

    client = AsyncOpenAI(api_key=OPENAI_API_KEY)
    try:
        response = await client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Ты модератор маркетплейса Trade Ground для рус/укр аудитории в Германии. "
                        "Улучшай объявления с барахолок: точный заголовок на русском, описание на русском, "
                        "правильная категория из списка id, цена, город. "
                        "Отвечай только валидным JSON без markdown."
                    ),
                },
                {"role": "user", "content": _build_prompt(item)},
            ],
            response_format={"type": "json_object"},
            temperature=0.15,
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

    raw_text = str(item.get("raw_text") or "")
    title = clean_title(str(data.get("title") or ""), raw_text)
    if not title or title == "Объявление":
        title = clean_title(str(item.get("title") or ""), raw_text)

    description = str(data.get("description") or item.get("description") or "").strip()

    category, subcategory = resolve_marketplace_category(
        str(data.get("category") or ""),
        data.get("subcategory"),
        item,
    )
    logger.info(
        "AI enrich cat: ai=%s/%s → marketplace=%s/%s (parser was %s/%s)",
        data.get("category"),
        data.get("subcategory"),
        category,
        subcategory,
        item.get("category"),
        item.get("subcategory"),
    )

    channel_city = item.get("source_city") or item.get("location") or "Germany"
    location = _validate_location(
        str(data.get("location") or ""),
        channel_city,
        f"{title}\n{description}\n{raw_text}",
    )
    price, currency, is_free = _normalize_price_fields(
        data.get("price"),
        data.get("currency"),
        data.get("is_free"),
        f"{description}\n{raw_text}",
        category=category,
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
