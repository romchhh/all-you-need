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

from parser.ai.enrich import (
    AiEnrichmentResult,
    _normalize_price_fields,
    _prefer_full_description,
    _validate_condition,
    _validate_location,
    is_ai_enrich_enabled,
    merge_enrichment_into_item,
)
from parser.marketplace_categories import clean_title, resolve_marketplace_category
from parser.storage.listing_dedup import recent_listings_for_ai_context

load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")

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
    from parser.core.location import is_local_source_city
    from parser.marketplace_categories import marketplace_taxonomy_for_ai

    raw_text = (item.get("raw_text") or "")[:4000]
    pending = context.get("pending_titles") or []
    active = context.get("active_listings") or []
    channel_city = str(item.get("source_city") or "")
    local_channel = is_local_source_city(channel_city)

    pending_block = "\n".join(f"- {t}" for t in pending[:12]) or "(none)"
    active_block = "\n".join(
        f"- #{row.get('id')} {row.get('title')} ({row.get('location') or '?'})"
        for row in active[:15]
    ) or "(none)"

    if local_channel:
        location_hint = (
            f'location MUST be "{channel_city}" (local city channel). '
            "Do not override from the post text."
        )
    else:
        location_hint = (
            "location = city mentioned in the POST TEXT (Hamburg, München, Köln, …). "
            'If no city is mentioned, use "Germany".'
        )

    channel_scope = "LOCAL city channel" if local_channel else "Germany-wide channel"

    return f"""You moderate Telegram flea-market posts for Trade Ground (Germany; RU/UK/DE text).

POST TEXT:
{raw_text}

Parser hints (untrusted — do NOT treat as ground truth):
- title: {item.get("title") or ""}
- description: {(item.get("description") or "")[:800]}
- suggested category: {item.get("category")}/{item.get("subcategory")}
- channel: {item.get("source_channel")}
- channel city: {channel_city} ({channel_scope})

ALREADY IN MODERATION QUEUE (reject duplicates):
{pending_block}

ALREADY LIVE ON MARKETPLACE (recent; reject duplicates):
{active_block}

Allowed marketplace category ids only:
{marketplace_taxonomy_for_ai()}

DECISION RULES (strict):
Default: accept=false. When unsure, reject.

ACCEPT (accept=true) only if the post is a REAL listing with a clear offer:
- GOODS: selling / giving away / swapping a specific item, OR
- SERVICE: a provider offering a service to a client (nails, repair, cleaning, tutoring, etc.)
There must be a concrete subject (what is sold or which service is offered).

REJECT (accept=false) for everything else, including:
- news / info alerts (police, speed cameras, ROADPOL, weather, laws, “attention drivers”)
- chat / questions (“who knows…”, “any tips…”, polls, memes, discussion with no offer)
- channel meta (rules, welcome, “subscribe”, pins, channel ads)
- jobs / hiring / employers / salary / “join the team” / side gigs / vacancy bots
- form templates (“Employer name, city, employment type, schedule, salary…”)
- earn-money schemes / MLM / “$150 per day — write to the bot”
- wanted-only posts (“buying / looking for…”) with no own goods or service offer
- empty, spam, or unrelated content
A price number alone does NOT make a job/news post a listing.
Channel theme (e.g. beauty) and parser category hints do NOT make a post a listing.

Duplicates: if the same item/service already appears in the queues above →
accept=false, is_duplicate=true, reject_reason="duplicate".

If accept=true, also enrich fields:
- title: Russian, 4–80 chars; what is offered; NO price, city, greetings, or “selling”
  If the parser title is a stub (“Акційний товар”), take brand/model from the full text
- description: Russian; keep full meaning (800–2000 chars ok); do not truncate important details
- category/subcategory: from FULL TEXT meaning only; never vacancies / looking_for_work / part_time
  Examples: sneakers/New Balance → fashion/men_shoes|women_shoes (NOT home/decor);
  iPhone → electronics/smartphones; master services → services_work + fitting subcategory
- price / currency / is_free / location / condition
  {location_hint}
  Services without a stated price → price=null, is_free=false; condition for services is always "new"

Respond with JSON only:
{{
  "accept": false,
  "is_duplicate": false,
  "reject_reason": "junk|duplicate|not_listing|spam|empty|job|wanted|news|chat|null",
  "title": "string",
  "description": "string",
  "category": "string",
  "subcategory": "string or null",
  "price": "string or null",
  "currency": "EUR or null",
  "is_free": false,
  "location": "string",
  "condition": "new|used|null",
  "changes_summary": "short note"
}}"""


_SCREEN_SYSTEM_PROMPT = (
    "You are a strict listing filter for the Trade Ground marketplace. "
    "Default to reject. Accept ONLY real goods or master-service listings with a clear offer. "
    "Reject news, jobs, templates, chat, wanted-only posts, spam, and anything without an offer. "
    "Channel topic is not an offer. Reply with JSON only."
)


async def ai_screen_parsed_listing(item: dict) -> AiScreenResult:
    """Фільтр + попереднє збагачення. При помилці API — відхиляємо (fail-closed)."""
    from parser.core.quality import has_listing_offer_signal

    raw_preview = str(item.get("raw_text") or item.get("description") or "")

    if not is_ai_screen_enabled():
        # Без AI — лише пости з явним офером (ціна/продаж/послуга)
        if not has_listing_offer_signal(raw_preview):
            return AiScreenResult(accept=False, reason="немає оферу")
        return AiScreenResult(accept=True)

    try:
        from openai import AsyncOpenAI
    except ImportError:
        logger.warning("AI screen: openai не встановлено — відхиляємо")
        return AiScreenResult(accept=False, reason="ai недоступний")

    context = recent_listings_for_ai_context(
        title=str(item.get("title") or ""),
        location=str(item.get("source_city") or item.get("location") or ""),
    )

    client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY", "").strip())
    try:
        response = await client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {"role": "system", "content": _SCREEN_SYSTEM_PROMPT},
                {"role": "user", "content": _build_screen_prompt(item, context)},
            ],
            response_format={"type": "json_object"},
            temperature=0.0,
            max_tokens=2200,
            timeout=70,
        )
    except Exception as e:
        logger.warning("AI screen failed (відхиляємо): %s", e)
        return AiScreenResult(accept=False, reason="ai помилка")

    raw = (response.choices[0].message.content or "").strip()
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        logger.error("AI screen invalid JSON: %s", raw[:400])
        return AiScreenResult(accept=False, reason="ai помилка")

    # За замовчуванням reject, якщо accept не true явно
    if data.get("accept") is not True:
        reason = str(data.get("reject_reason") or "ai відхилено").strip().lower()
        if data.get("is_duplicate") or "duplicate" in reason or "дубл" in reason:
            return AiScreenResult(accept=False, reason="дублікат (ai)")
        if "spam" in reason:
            return AiScreenResult(accept=False, reason="спам (ai)")
        if any(k in reason for k in ("job", "ваканс", "подработ", "підробіт")):
            return AiScreenResult(accept=False, reason="вакансія (ai)")
        if any(k in reason for k in ("wanted", "куплю", "ищу", "шукаю")):
            return AiScreenResult(accept=False, reason="пошук/куплю (ai)")
        if any(k in reason for k in ("news", "chat", "мем", "опрос", "опит")):
            return AiScreenResult(accept=False, reason="не товар/послуга (ai)")
        if "not_listing" in reason or "не оголош" in reason or "empty" in reason:
            return AiScreenResult(accept=False, reason="не оголошення (ai)")
        return AiScreenResult(accept=False, reason="мусор (ai)")

    if data.get("is_duplicate"):
        return AiScreenResult(accept=False, reason="дублікат (ai)")

    raw_text = str(item.get("raw_text") or "")
    title = clean_title(str(data.get("title") or ""), raw_text)
    if not title or title == "Объявление":
        title = clean_title(str(item.get("title") or ""), raw_text)

    description = _prefer_full_description(
        str(data.get("description") or ""),
        str(item.get("description") or ""),
        raw_text,
        title,
    )
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
