"""
AI-фільтр парсованих оголошень: сміття, дублі, попереднє збагачення.

Викликається на етапі парсингу перед insert + модерацією.
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional

from dotenv import load_dotenv

from parser.ai_enrich import (
    AiEnrichmentResult,
    _normalize_price_fields,
    _validate_condition,
    _validate_location,
    is_ai_enrich_enabled,
    merge_enrichment_into_item,
)
from parser.marketplace_categories import clean_title, resolve_marketplace_category
from parser.storage.listing_dedup import recent_listings_for_ai_context

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

logger = logging.getLogger(__name__)

OPENAI_MODEL = (os.getenv("OPENAI_MODEL") or "gpt-4o-mini").strip()


@dataclass
class AiScreenResult:
    accept: bool
    reason: str = ""
    enrichment: Optional[AiEnrichmentResult] = None


def is_ai_screen_enabled() -> bool:
    if not is_ai_enrich_enabled():
        return False
    raw = (os.getenv("PARSER_AI_SCREEN_ENABLED") or "1").strip().lower()
    return raw not in ("0", "false", "no", "off")


def _build_screen_prompt(item: dict, context: dict) -> str:
    from parser.marketplace_categories import marketplace_taxonomy_for_ai

    raw_text = (item.get("raw_text") or "")[:2800]
    pending = context.get("pending_titles") or []
    active = context.get("active_listings") or []

    pending_block = "\n".join(f"- {t}" for t in pending[:12]) or "(немає)"
    active_block = "\n".join(
        f"- #{row.get('id')} {row.get('title')} ({row.get('location') or '?'})"
        for row in active[:15]
    ) or "(немає)"

    return f"""Проанализируй пост с Telegram-барахолки (Германия, рус/укр).

ТЕКСТ ПОСТА:
{raw_text}

Подсказки парсера:
- title: {item.get("title") or ""}
- description: {(item.get("description") or "")[:400]}
- category: {item.get("category")}/{item.get("subcategory")}
- канал: {item.get("source_channel")}, город: {item.get("source_city")}

УЖЕ В ОЧЕРЕДИ МОДЕРАЦИИ (не дублируй):
{pending_block}

УЖЕ НА МАРКЕТПЛЕЙСЕ (активные, последние дни):
{active_block}

Категории маркетплейса (только эти id):
{marketplace_taxonomy_for_ai()}

ЗАДАЧА:
1. accept=false если: реклама канала, правила, поздравления, вакансии без товара,
   спам, пустой пост, не объявление о продаже/услуге, мусор.
2. accept=false, is_duplicate=true если тот же товар/услуга уже в списках выше
   (другой пост, но тот же iPhone/диван/маникюр — дубль).
3. accept=true только для нормального объявления.
4. Если accept=true — улучши title (рус, до 80 симв), description (рус, чистый текст),
   category/subcategory, price, location, condition.

JSON:
{{
  "accept": true,
  "is_duplicate": false,
  "reject_reason": "junk|duplicate|not_listing|spam|empty или null",
  "title": "...",
  "description": "...",
  "category": "...",
  "subcategory": "... или null",
  "price": "... или null",
  "currency": "EUR|null",
  "is_free": false,
  "location": "...",
  "condition": "new|used|null",
  "changes_summary": "коротко"
}}"""


async def ai_screen_parsed_listing(item: dict) -> AiScreenResult:
    """Фільтр + попереднє збагачення. При помилці API — пропускаємо (accept)."""
    if not is_ai_screen_enabled():
        return AiScreenResult(accept=True)

    try:
        from openai import AsyncOpenAI
    except ImportError:
        return AiScreenResult(accept=True)

    context = recent_listings_for_ai_context(
        title=str(item.get("title") or ""),
        location=str(item.get("source_city") or item.get("location") or ""),
    )

    client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY", "").strip())
    try:
        response = await client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Ты фильтр маркетплейса Trade Ground. Отсекаешь мусор и дубли. "
                        "Отвечай только JSON."
                    ),
                },
                {"role": "user", "content": _build_screen_prompt(item, context)},
            ],
            response_format={"type": "json_object"},
            temperature=0.1,
            max_tokens=1100,
            timeout=55,
        )
    except Exception as e:
        logger.warning("AI screen failed (пропускаємо): %s", e)
        return AiScreenResult(accept=True)

    raw = (response.choices[0].message.content or "").strip()
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        logger.error("AI screen invalid JSON: %s", raw[:400])
        return AiScreenResult(accept=True)

    if not data.get("accept", True):
        reason = str(data.get("reject_reason") or "ai відхилено").strip().lower()
        if data.get("is_duplicate") or "duplicate" in reason or "дубл" in reason:
            return AiScreenResult(accept=False, reason="дублікат (ai)")
        if "spam" in reason:
            return AiScreenResult(accept=False, reason="спам (ai)")
        if "not_listing" in reason or "не оголош" in reason:
            return AiScreenResult(accept=False, reason="не оголошення (ai)")
        return AiScreenResult(accept=False, reason="мусор (ai)")

    if data.get("is_duplicate"):
        return AiScreenResult(accept=False, reason="дублікат (ai)")

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
    )
    condition = _validate_condition(data.get("condition"), category)

    enrichment = AiEnrichmentResult(
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
        summary=str(data.get("changes_summary") or "AI").strip(),
    )
    return AiScreenResult(accept=True, enrichment=enrichment)


def apply_screen_enrichment(item: dict, enrichment: AiEnrichmentResult) -> dict:
    return merge_enrichment_into_item(item, enrichment)
