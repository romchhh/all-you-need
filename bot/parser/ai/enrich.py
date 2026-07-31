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

load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")

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


def _prefer_full_description(
    ai_desc: str,
    parser_desc: str,
    raw_text: str,
    title: str,
) -> str:
    """
    Якщо AI сильно обрізав опис — беремо довший осмислений варіант з парсера/raw.
    """
    from parser.core.patterns import GREETING_TITLE_RE

    def _sanitize(text: str) -> str:
        t = (text or "").strip()
        t = GREETING_TITLE_RE.sub("", t, count=1).strip()
        t = re.sub(r"https?://t\.me/\S+", "", t, flags=re.I)
        t = re.sub(r"(?i)\b(?:підпишіть?ся|подпишитесь|subscribe)\b[^\n]*", "", t)
        t = re.sub(r"\n{3,}", "\n\n", t)
        return t.strip()

    ai = _sanitize(ai_desc)
    parser = _sanitize(parser_desc)
    raw = _sanitize(raw_text)

    raw_body = raw
    t = (title or "").strip()
    if t and raw_body.lower().startswith(t.lower()[:40].lower()):
        raw_body = raw_body[len(t):].lstrip(" .,\n")

    candidates = [c for c in (ai, parser, raw_body, raw) if c]
    if not candidates:
        return ai or parser or raw

    baseline = max(len(raw_body), len(parser), 1)
    if ai and len(ai) >= max(180, int(baseline * 0.55)):
        return ai

    best = max(candidates, key=len)
    if best is raw or best is raw_body:
        if len(best) > 3500:
            best = best[:3500].rsplit("\n", 1)[0].strip() or best[:3500]
    return best.strip()


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


def _validate_location(
    location: str,
    channel_city: str,
    text: str,
    *,
    source_channel: str | None = None,
) -> str:
    from parser.core.location import resolve_parsed_location

    return resolve_parsed_location(
        channel_city=channel_city,
        source_channel=source_channel,
        suggested=location,
        text=text,
    )


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
    from parser.core.location import is_local_source_city

    channel_city = item.get("source_city") or item.get("location") or ""
    raw_text = (item.get("raw_text") or "")[:4000]
    parser_cat = item.get("category") or ""
    parser_sub = item.get("subcategory") or ""
    local_channel = is_local_source_city(str(channel_city))

    if local_channel:
        location_rule = (
            f'7. location MUST be exactly "{channel_city}" '
            "(local flea-market channel). Do not change it based on post text."
        )
    else:
        location_rule = (
            "7. location — city of sale/service FROM THE TEXT "
            '(e.g. "в Гамбурге", Berlin, Köln) as German canonical name '
            "(Hamburg, München, Köln, …). If no city in text → \"Germany\"."
        )

    scope = "LOCAL city channel" if local_channel else "Germany-wide channel"

    return f"""Enrich a Telegram flea-market listing for Trade Ground (Germany; RU/UK/DE audience).
Use ONLY the text below — no photos.

Listing text (raw_text):
{raw_text}

Parser hints (may be wrong — do not copy blindly):
- title: {item.get("title") or ""}
- description: {item.get("description") or ""}
- category/sub: {parser_cat}/{parser_sub}
- price: {item.get("price") or ""} {item.get("currency") or ""}
- is_free: {bool(item.get("is_free"))}
- channel city: {channel_city} ({scope})
- condition: {item.get("condition") or ""}
- channel: {item.get("source_channel") or ""}

Marketplace category ids only (category / subcategory):
{marketplace_taxonomy_for_ai()}

Canonical cities: {", ".join(GERMAN_CITIES[:40])}, …

Rules:
1. title — Russian, 4–80 chars. Item/service essence: brand, model, service type.
   FORBIDDEN in title: price (€/EUR/currency numbers), city, PLZ,
   greetings (“Здравствуйте”, “Добрый день”), “selling/for sale/giving away”, emoji, hashtags.
   Services: short essence (“Маникюр гель-лак”, “Ремонт стиральных машин”) —
   do not copy a greeting first line.
2. description — Russian (translate from Ukrainian if needed). Keep all important info
   from raw_text: terms, prices, details, experience. Do not over-truncate
   (800–2000 chars ok for long posts). No channel promo links, no “DM me” spam/hashtags,
   do not repeat title as the first line.
3. category/subcategory — from FULL raw_text meaning only (brand, model, what is offered).
   Ignore stub titles (“Акційний товар”, “Товар”, “Sale”). Use taxonomy ids only; subcategory required.
   Examples:
   - New Balance / Nike / Adidas / sneakers → fashion + men_shoes (or women_shoes if clearly women’s). NOT home/decor.
   - iPhone / Samsung Galaxy / Xiaomi → electronics + smartphones. NOT home.
   - sofa / wardrobe → furniture; nails / cosmetologist → services_work + beauty_health.
   - jobs / “looking for work” are NOT marketplace listings — do not classify as fashion.
   Parser category hints may be wrong — do not copy them.
4. price — numeric string ("25" or "25.50"); no price → null (negotiable).
5. is_free — true ONLY if text clearly says free/віддам/даром/free. Services without price → is_free=false.
6. currency — EUR by default; UAH only if грн is explicit.
{location_rule}
8. condition — "new" or "used" for goods; for services_work ALWAYS "new".

JSON only:
{{
  "title": "string",
  "description": "string",
  "category": "string",
  "subcategory": "string or null",
  "price": "string or null",
  "currency": "EUR|USD|UAH|null",
  "is_free": false,
  "location": "string",
  "condition": "new|used|null",
  "changes_summary": "short note in Russian"
}}"""


_ENRICH_SYSTEM_PROMPT = (
    "You enrich Trade Ground marketplace listings for auto-publish quality. "
    "Choose category/subcategory from the full text meaning only "
    "(brand, model, goods/service type) — never from stub titles like “Акційний товар”. "
    "Sneakers/New Balance/Nike → fashion/men_shoes|women_shoes (NOT home); "
    "iPhone → electronics/smartphones (NOT home); master services → services_work. "
    "Title: Russian, no price/city/greeting. Description: complete, factual. JSON only."
)


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
                {"role": "system", "content": _ENRICH_SYSTEM_PROMPT},
                {"role": "user", "content": _build_prompt(item)},
            ],
            response_format={"type": "json_object"},
            temperature=0.15,
            max_tokens=2500,
            timeout=90,
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
    if not title or len(title) < 4:
        title = clean_title(str(item.get("title") or ""), raw_text)
    if not title or len(title) < 4:
        title = clean_title(raw_text.split("\n", 1)[0] if raw_text else "", raw_text)

    description = _prefer_full_description(
        str(data.get("description") or ""),
        str(item.get("description") or ""),
        raw_text,
        title,
    )

    resolve_item = {
        **item,
        "title": title,
        "description": description,
        "raw_text": raw_text,
    }
    category, subcategory = resolve_marketplace_category(
        str(data.get("category") or ""),
        data.get("subcategory"),
        resolve_item,
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
        source_channel=str(item.get("source_channel") or "") or None,
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
    from parser.core.location import resolve_parsed_location

    out = dict(item)
    out["title"] = enriched.title
    out["description"] = enriched.description
    out["category"] = enriched.category
    out["subcategory"] = enriched.subcategory
    out["price"] = enriched.price
    out["currency"] = enriched.currency
    out["is_free"] = enriched.is_free
    out["location"] = resolve_parsed_location(
        channel_city=str(item.get("source_city") or ""),
        source_channel=str(item.get("source_channel") or "") or None,
        suggested=enriched.location,
        text=f"{enriched.title}\n{enriched.description}\n{item.get('raw_text') or ''}",
    )
    out["condition"] = enriched.condition
    return out
