"""
AI-фільтр парсованих оголошень: сміття, дублі, збагачення title/desc/category.

Один виклик AI на пост (на етапі парсингу перед insert + модерацією).
"""

from __future__ import annotations

import json
import logging
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

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
    from parser.config.tuning import PARSER_AI_SCREEN_ENABLED

    return PARSER_AI_SCREEN_ENABLED


def _title_quality_score(title: str, raw_text: str = "") -> int:
    """Вищий бал = кращий marketplace title."""
    from parser.core.patterns import GENERIC_LISTING_TITLE_RE, GREETING_TITLE_RE, PRICE_RE, is_greeting_only

    t = (title or "").strip()
    if not t or len(t) < 4:
        return -30
    score = 8
    if GENERIC_LISTING_TITLE_RE.match(t):
        score -= 25
    if PRICE_RE.search(t):
        score -= 12
    if GREETING_TITLE_RE.match(t) or is_greeting_only(t) or re.search(
        r"(?i)^(меня\s+зовут|мене\s+звати|здравствуй|добр|привет|вітаю)", t
    ):
        score -= 15
    if re.search(
        r"(?i)^(продам|продаю|отдам|віддам|куплю|ищу|шукаю|предлагаю|пропоную)\b",
        t,
    ):
        score -= 8
    low = t.lower()
    if low in (
        "объявление",
        "оголошення",
        "listing",
        "товар",
        "авто",
        "машина",
        "услуга",
        "послуга",
    ):
        score -= 20
    if 8 <= len(t) <= 70:
        score += 4
    if 8 <= len(t) <= 45:
        score += 3  # короткий brand/model title кращий за рядок-опис
    if len(t) > 90:
        score -= 4
    # Бренд / латиниця з моделлю — сильний сигнал якісного title
    if re.search(
        r"(?i)\b(?:iphone|samsung|xiaomi|nike|adidas|bmw|audi|mercedes|nissan|"
        r"toyota|volkswagen|macbook|playstation|xbox|lego|айфон)\b",
        t,
    ):
        score += 12
    if re.search(r"[A-Za-z]{2,}", t) and re.search(r"[а-яёіїєґА-ЯЁІЇЄҐ]", t):
        score += 2
    # Не тягнути в title шматок опису («состояние как новый, батарея…»)
    if re.search(
        r"(?i)\b(?:состояние|стан\b|батаре|аккумулятор|акумулятор|город|місто|"
        r"самовывоз|самовивіз|коробк)\b",
        t,
    ):
        score -= 10
    if t.count(",") >= 1 and len(t) > 40:
        score -= 4
    # Трансліт/обрізані stubs на кшталт «17про макс… г»
    if re.search(r"(?i)\d+\s*про\b|про\s*макс|\d+\s*гб\b", t) and not re.search(
        r"(?i)\b(?:iphone|айфон|samsung|xiaomi)\b", t
    ):
        score -= 14
    if re.search(r"(?i)\bкак\s+нов\w*\s+[a-zа-яёіїєґ]$", t) or re.search(
        r"\s[a-zа-яёіїєґ]$", t
    ):
        score -= 8
    if re.search(r"(?i)^половин\w*\s+(?:сво\w+\s+)?гардероб", t):
        score -= 10
    # Title має перетинатися з raw (не вигаданий)
    if raw_text:
        raw_l = raw_text.lower()
        tokens = [w for w in re.findall(r"[a-zа-яёіїєґ0-9]{3,}", t.lower()) if w]
        hits = sum(1 for w in tokens if w in raw_l)
        if tokens and hits == 0:
            score -= 10
        elif tokens and hits >= max(1, len(tokens) // 2):
            score += 3
        # У raw є iPhone, а в title лише «17про» — штрафуємо
        if re.search(r"(?i)\b(?:iphone|айфон)\b", raw_l) and not re.search(
            r"(?i)\b(?:iphone|айфон)\b", t
        ):
            score -= 10
    return score


def _pick_best_title(ai_title: str, item: dict, raw_text: str) -> str:
    """AI title vs recovery з raw — беремо якісніший."""
    candidates = [
        clean_title(ai_title or "", raw_text),
        clean_title(str(item.get("title") or ""), raw_text),
        clean_title(raw_text.split("\n", 1)[0] if raw_text else "", raw_text),
        clean_title("", raw_text),  # stub recovery з усього raw
    ]
    best = ""
    best_score = -999
    for cand in candidates:
        if not cand:
            continue
        sc = _title_quality_score(cand, raw_text)
        if sc > best_score:
            best_score = sc
            best = cand
    return best


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

    return f"""You moderate AND enrich Telegram flea-market posts for Trade Ground (Germany; RU/UK/DE).

POST TEXT:
{raw_text}

Parser hints (UNTRUSTED — often wrong stubs; rebuild from POST TEXT):
- title: {item.get("title") or ""}
- description: {(item.get("description") or "")[:800]}
- suggested category: {item.get("category")}/{item.get("subcategory")}
- channel: {item.get("source_channel")}
- channel city: {channel_city} ({channel_scope})

ALREADY IN MODERATION QUEUE (reject duplicates):
{pending_block}

ALREADY LIVE ON MARKETPLACE (recent; reject duplicates):
{active_block}

Allowed marketplace category / subcategory ids ONLY:
{marketplace_taxonomy_for_ai()}

══════════════════════════════════════
ACCEPT / REJECT
══════════════════════════════════════
ACCEPT (accept=true) when there is a REAL offer:
- GOODS: concrete item (phone, car, sofa, shoes, appliance…) with price and/or sell/give wording,
  or a typical flea caption like "iPhone 13 300€" / "Диван, самовывоз"
- SHORT but real: item + price/size is enough — e.g. "Яйцевартка 15€", "Размер 68, 50€",
  "Учебник исписан, 5€", "Шкаф 330/220". Accept these; do NOT mark junk/not_listing.
- SERVICE: provider offers a service (nails, tattoo, repair, cleaning, tutoring…)

REJECT (accept=false):
- news / police / ROADPOL / weather / laws
- chat, polls, memes, “who knows…”, no offer
- channel meta / subscribe / pins
- jobs, hiring, salary, vacancy bots, MLM, “$150/day”
- wanted-only (“куплю / ищу”) with no own offer
- currency exchange / “грн на карте → cash €” / cigarette wholesale spam
- empty / spam
If unsure NEWS/JOB vs listing → reject. If item+price is obvious → accept.
Duplicates vs queues above → accept=false, is_duplicate=true, reject_reason="duplicate".

══════════════════════════════════════
ENRICHMENT (only if accept=true) — marketplace auto-publish quality
══════════════════════════════════════

LANGUAGE (critical):
- Keep the ORIGINAL language of the post for BOTH title and description.
- Ukrainian post → Ukrainian title+description. Russian → Russian. German → German.
- NEVER translate UK↔RU (or to English). Brand/model names (iPhone, BMW) stay as usual.

TITLE (critical):
- Same language as the post, 4–80 chars. Name the ITEM or SERVICE: brand + model + key spec OR service type.
- FORBIDDEN in title: price, €, city, PLZ, greetings, “продам/продаю/отдам”, emoji spam, hashtags.
- NEVER leave stubs: «авто», «машина», «товар», «объявление», «Акційний товар», «телефон».
- Rebuild stubs from POST TEXT (brand/model lines) in the same language.

TITLE EXAMPLES:
✗ "авто" / "Продам авто 5500€ Stuttgart"  → ✓ "Nissan Pulsar 1.5 Diesel"
✗ "Продам телефон" / "iPhone 13 Pro 450€ Köln" → ✓ "iPhone 13 Pro 256GB"
✗ "Меня зовут Женя я тату мастер" → ✓ "Тату-мастер"
✗ "Nike Air Force 1 80€" → ✓ "Nike Air Force 1"
✗ "Лазерная эпиляция Hamburg" → ✓ "Лазерная эпиляция"
✗ "Акційний товар" → rebuild from text (brand/model) in Ukrainian if post is UK
✗ "17про макс на 512гб как новый г" → ✓ "iPhone 17 Pro Max 512GB"
✗ "Половину своего гардероба за" → ✓ "Одежда из гардероба"
✗ UK post "Прибирання квартир Гамбург" → title "Прибирання квартир" (NOT Russian)

DESCRIPTION (critical):
- SAME language as the original post (do not translate). 2–8 short paragraphs/sentences.
- Keep ALL useful facts from POST TEXT: specs, size, year, mileage, condition, pickup, extras.
- Do NOT start with the same words as title. Do NOT invent facts not in the post.
- Strip: subscribe spam, channel ads, endless emoji, “пиши в лс” fluff is ok once if that is the CTA.
- Short posts: expand into a clean readable blurb from the same facts (still no invention).
- Long posts: keep substance (800–2000 chars ok); do not crush to one line.

DESCRIPTION EXAMPLES:
Post: "Продам авто\\nNissan Pulsar 1,5 Diesel\\n5500€ Stuttgart"
→ title "Nissan Pulsar 1.5 Diesel"
→ description "Продается Nissan Pulsar, двигатель 1.5 Diesel. Цена 5500€. Город Stuttgart. Самовывоз."

Post: "iPhone 13 Pro 256GB батарея 88% коробка есть 450€ Köln"
→ title "iPhone 13 Pro 256GB"
→ description "iPhone 13 Pro, память 256GB, состояние батареи 88%, коробка в комплекте. Цена 450€. Самовывоз Köln."

Post (Ukrainian): "Прибирання квартир у Гамбурзі, 25€/год"
→ title "Прибирання квартир"
→ description "Пропоную прибирання квартир у Гамбурзі. Ціна 25€/год." (stay Ukrainian)

CATEGORY / SUBCATEGORY (critical):
- Use ONLY ids from the Allowed list above. NEVER invent: transport, vehicles, car, cars, clothing, phone…
- Decide from FULL POST TEXT meaning, ignore stub parser hints.
- subcategory is required when the category has sub-ids.

CATEGORY MAP (memorize):
• Car for sale (Nissan/BMW/VW/Toyota…, “продам авто”, diesel/petrol, mileage) → auto / cars
  (NOT tires_wheels unless the post is ONLY about tires/rims)
• Tires / rims / R16–R19 → auto / tires_wheels
• iPhone / Samsung phone / Xiaomi → electronics / smartphones
• MacBook / laptop / iPad → electronics / computers_laptops
• PS5 / Xbox / Nintendo → electronics / games_consoles
• Nike / Adidas / New Balance / sneakers → fashion / men_shoes or women_shoes
• Sofa / шкаф / комод / wardrobe furniture → furniture / …
• Clothing from «гардероб» («половину гардероба», куртки/вещи) → fashion / women_clothing or men_clothing (NOT furniture)
• Fridge / washing machine → appliances / …
• Bicycle / e-bike (Centurion, Shimano, frame size, brakes) → hobby_sports / bikes_scooters
  (NOT electronics — Bosch motor on a bike is still a bicycle)
• Nails / brows / lashes / cosmetologist / laser epilation / шугаринг / tattoo / piercing
  → services_work / beauty_health (NOT it_design_websites, NOT fashion, NOT home)
• Plumber / electrician / appliance repair → services_work / repair_installation
• Cleaning → services_work / cleaning
• Website / WordPress developer offer → services_work / it_design_websites ONLY if making sites
• NEVER use vacancies | looking_for_work | part_time for marketplace goods/services

PRICE / LOCATION / CONDITION:
- price: numeric string "5500" or null; if no price in post → null (stored as negotiable/Договорная)
- currency EUR unless грн explicit
- is_free: true ONLY if clearly free with NO price (бесплатно/даром/«віддам диван»).
  «отдам/віддам за 200€» → price="200", is_free=false (sale, NOT free)
- {location_hint}
- goods: condition new|used from text; services_work: ALWAYS condition="new"
- services with no price → price=null, is_free=false

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
    "You are the listing quality engine for Trade Ground marketplace (Germany). "
    "For each Telegram flea-market post: (1) accept only real goods/service offers; "
    "(2) write a marketplace-ready title in the SAME language as the post "
    "(UK stays UK, RU stays RU — never translate; brand/model/service; never stubs like "
    "«авто»/«товар», never price/city in title); "
    "(3) write a complete factual description in the SAME language as the post (no invention); "
    "(4) assign category/subcategory ONLY from the allowed id list "
    "(cars → auto/cars; phones → electronics/smartphones; tattoo/nails → "
    "services_work/beauty_health). Never invent category ids. JSON only."
)


async def ai_screen_parsed_listing(item: dict) -> AiScreenResult:
    """Фільтр + збагачення. При помилці API — fail-closed, з вузьким fail-open на явному офері."""
    from parser.core.quality import has_listing_offer_signal
    from parser.core.text import format_listing_description

    raw_preview = str(item.get("raw_text") or item.get("description") or "")

    if not is_ai_screen_enabled():
        if not has_listing_offer_signal(raw_preview):
            return AiScreenResult(accept=False, reason="немає оферу")
        logger.warning("AI screen вимкнено — оголошення без enrich (approve спробує знову)")
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
            max_tokens=2800,
            timeout=75,
        )
    except Exception as e:
        if has_listing_offer_signal(raw_preview):
            logger.warning(
                "AI screen failed (пропускаємо без enrich; approve повторить): %s", e
            )
            return AiScreenResult(accept=True)
        logger.warning("AI screen failed (відхиляємо): %s", e)
        return AiScreenResult(accept=False, reason="ai помилка")

    raw = (response.choices[0].message.content or "").strip()
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        logger.error("AI screen invalid JSON: %s", raw[:400])
        if has_listing_offer_signal(raw_preview):
            return AiScreenResult(accept=True)
        return AiScreenResult(accept=False, reason="ai помилка")

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
    title = _pick_best_title(str(data.get("title") or ""), item, raw_text)

    description = _prefer_full_description(
        str(data.get("description") or ""),
        str(item.get("description") or ""),
        raw_text,
        title,
    )
    description = format_listing_description(description)
    # Якщо AI дав лише title-дубль — підтягнути факти з raw
    if title and description and description.strip().lower() == title.strip().lower():
        description = format_listing_description(
            _prefer_full_description("", str(item.get("description") or ""), raw_text, title)
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
