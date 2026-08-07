"""Утиліти обробки тексту оголошень."""

import re
from typing import Optional

from parser.config.channels import CHANNELS_STRIP_TRAILING_LINK, normalize_channel_key
from parser.core.patterns import (
    FREE_GIVEAWAY_RE,
    GENERIC_TITLE_RE,
    ONE_EMOJI_RE,
    PRICE_RE,
)


def to_plain_str(s) -> str:
    if s is None:
        return ""
    return str(s).encode("utf-8", errors="replace").decode("utf-8")


def detect_lang(text: str) -> str:
    t = text.lower()
    uk = len(re.findall(r"[іїєґ']", t))
    ru = len(re.findall(r"[ыэё]", t))
    return "uk" if uk >= ru else "ru"


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
    from parser.core.patterns import GREETING_TITLE_RE, PRICE_RE
    from parser.marketplace_categories import clean_title

    text = text.strip()
    lines = [ln.strip() for ln in re.split(r"\n+", text) if ln.strip()]
    candidates: list[str] = []

    first = re.split(r"[\n!?]|(?<=[.])\s", text, maxsplit=1)[0].strip()
    if first:
        candidates.append(first)
    candidates.extend(lines[:8])

    for cand in candidates:
        stripped = GREETING_TITLE_RE.sub("", cand).strip()
        if not stripped or _is_generic_title(stripped) or _is_generic_title(cand):
            continue
        # Рядок = майже лише ціна
        without_price = PRICE_RE.sub("", stripped).strip(" -–—,.")
        if len(without_price) < 4:
            continue
        cleaned = clean_title(cand, text)
        if cleaned and len(cleaned) >= 4:
            return cleaned[:97].rstrip() + "…" if len(cleaned) > 100 else cleaned

    cleaned = clean_title(first or (lines[0] if lines else ""), text)
    if cleaned and len(cleaned) >= 4:
        return cleaned[:97].rstrip() + "…" if len(cleaned) > 100 else cleaned
    return cleaned or ""


def extract_description(text: str, title: str) -> str:
    clean = title.rstrip("…")
    desc = text.strip()
    if desc.lower().startswith(clean.lower()):
        desc = desc[len(clean):].lstrip(" .,\n")
    return desc.strip() or text.strip()


def clean_channel_post_text(text: str, channel: str) -> str:
    channel_key = normalize_channel_key(channel)
    if channel_key.startswith("t.me/"):
        username = channel_key.rsplit("/", 1)[-1].lower()
    else:
        username = channel_key.lower().split("/")[0].lstrip("@")

    pattern = CHANNELS_STRIP_TRAILING_LINK.get(username)
    if pattern:
        text = pattern.sub("", text).rstrip()
    return text


def enrich_description(title: str, description: str) -> str:
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


_AUTHOR_IN_BODY_RE = re.compile(
    r"(?:^|\n)\s*👤\s*(?:Автор|Author)\s*:\s*@?\w+.*$",
    re.IGNORECASE | re.MULTILINE,
)
_LEADING_PRICE_RE = re.compile(
    r"^(?:\s*(?:ціна|цена|price)\s*[:\s]*)?"
    r"\d{1,6}(?:[.,]\d{1,2})?\s*(?:€|eur|euro|євро|евро|\$|грн|uah)\s*",
    re.IGNORECASE,
)


def strip_listing_body_metadata(text: str) -> str:
    """Прибрати з опису ціну на початку, автора, emoji-алерти (ціна — окреме поле)."""
    t = (text or "").strip()
    if not t:
        return ""
    t = _AUTHOR_IN_BODY_RE.sub("", t).strip()
    t = re.sub(r"(?:^|\n)\s*@[a-zA-Z0-9_]{4,32}\s*$", "", t, flags=re.MULTILINE)
    # Алерти на кшталт 🚨 на початку
    while True:
        m = re.match(rf"^\s*(?:{ONE_EMOJI_RE.pattern}\s*)+", t)
        if not m:
            break
        t = t[m.end() :].strip()
    for _ in range(3):
        nxt = _LEADING_PRICE_RE.sub("", t, count=1).strip()
        if nxt == t:
            break
        t = nxt
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t.strip()


def _description_looks_unpolished(desc: str, title: str) -> bool:
    d = (desc or "").strip()
    if not d or len(d) < 12:
        return True
    if _LEADING_PRICE_RE.match(d) or PRICE_RE.fullmatch(d.strip()):
        return True
    if _AUTHOR_IN_BODY_RE.search(d):
        return True
    if title and d.lower().strip() == title.lower().strip():
        return True
    # Один рядок-перелік без нормальних речень
    if "\n" not in d and len(d) < 160 and not re.search(r"[.!?…]\s", d):
        if d.count(",") >= 1 or len(d.split()) >= 6:
            return True
    return False


def rebuild_description_from_raw(
    *,
    title: str,
    raw_text: str,
    price: str | None = None,
) -> str:
    """
    З сирого поста — читабельний опис (RU), без ціни на початку (ціна окремо).
    """
    blob = strip_listing_body_metadata(raw_text or "")
    blob = PRICE_RE.sub(" ", blob)
    blob = re.sub(r"\s+", " ", blob).strip(" ,.;")
    if not blob:
        return ""

    t = (title or "").strip()
    if t and blob.lower().startswith(t.lower()[: min(len(t), 40)]):
        blob = blob[len(t) :].lstrip(" .,\n-—")

    # Відомі токени товарів → список
    tokens = re.findall(
        r"(?i)(?:холодильник\w*|посудомо(?:й|е)\w*|плит\w*|духов(?:к|ок)\w*|"
        r"мойк\w*|кран\w*|стиральн\w*|диван\w*|кроват\w*|шкаф\w*|"
        r"iphone\s*\d+[^\s,]*|samsung[^\s,]*|nissan[^\s,]*|"
        r"доставк\w+|самовывоз\w*|самовивіз\w*)",
        blob,
    )
    seen: set[str] = set()
    items: list[str] = []
    for tok in tokens:
        key = tok.lower()[:8]
        if key in seen:
            continue
        seen.add(key)
        items.append(tok.strip())

    parts: list[str] = []
    if t:
        parts.append(f"Продаётся {t}.")
    elif items:
        parts.append("Продаётся комплект.")

    if items:
        goods = [i for i in items if not re.search(r"(?i)достав|самов", i)]
        extras = [i for i in items if re.search(r"(?i)достав|самов", i)]
        if goods:
            if len(goods) == 1:
                parts.append(f"В комплекте: {goods[0].capitalize()}.")
            else:
                joined = ", ".join(g.capitalize() for g in goods[:-1])
                parts.append(f"В комплекте: {joined}, {goods[-1].capitalize()}.")
        for ex in extras:
            parts.append(f"{ex.capitalize()}.")

    if not parts and blob:
        parts.append(blob[:500])

    return "\n".join(parts).strip()


def polish_listing_description(
    description: str,
    *,
    raw_text: str = "",
    title: str = "",
    price: str | None = None,
) -> str:
    """Фінальний опис для Listing: без ціни/автора в тілі, з fallback з raw."""
    base = strip_listing_body_metadata(description or "")
    base = format_listing_description(base)
    if _description_looks_unpolished(base, title):
        rebuilt = rebuild_description_from_raw(
            title=title,
            raw_text=raw_text,
            price=price,
        )
        if rebuilt and len(rebuilt) >= len(base or ""):
            base = format_listing_description(rebuilt)
    return base or format_listing_description(strip_listing_body_metadata(raw_text or ""))


def format_listing_description(description: str, *, max_len: int = 1800) -> str:
    """
    Охайний опис для маркетплейсу: прибрати промо, згорнути порожні рядки,
    обрізати надто довгий текст по реченню/абзацу.
    """
    from parser.core.patterns import GREETING_TITLE_RE

    t = (description or "").strip()
    if not t:
        return ""
    t = strip_listing_body_metadata(t)
    t = GREETING_TITLE_RE.sub("", t, count=1).strip()
    t = re.sub(r"https?://t\.me/\S+", "", t, flags=re.I)
    # «Продам авто» як перший рядок, якщо далі є суть (модель) — прибрати заглушку
    t = re.sub(
        r"(?is)^(продам|продаю|отдам|віддам)\s+"
        r"(?:авто|машину|автомобиль|автомобіль|товар)\s*[\n\r]+",
        "",
        t,
        count=1,
    ).strip()
    t = re.sub(
        r"(?im)^(?:підпишіть?ся|подпишитесь|subscribe|реклама\s+канала).*$",
        "",
        t,
    )
    t = re.sub(r"[ \t]+\n", "\n", t)
    t = re.sub(r"\n{3,}", "\n\n", t)
    t = re.sub(r"[ \t]{2,}", " ", t).strip()
    if len(t) <= max_len:
        return t

    cut = t[:max_len]
    for sep in ("\n\n", "\n", ". ", "! ", "? "):
        idx = cut.rfind(sep)
        if idx >= int(max_len * 0.55):
            cut = cut[: idx + (0 if sep.startswith("\n") else 1)].strip()
            break
    return cut.rstrip(" ,;") + "…"


def detect_condition(text: str, category: str) -> Optional[str]:
    if category == "services_work":
        return "new"
    if category == "realestate":
        return None
    lower = text.lower()
    if re.search(r"\bнов(ий|ая|ое|і)\b|brand.?new|у коробці|в упаковке|запечатан", lower):
        return "new"
    return "used"
