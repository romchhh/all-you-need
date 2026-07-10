"""Утиліти обробки тексту оголошень."""

import re
from typing import Optional

from parser.config.channels import CHANNELS_STRIP_TRAILING_LINK, normalize_channel_key
from parser.core.patterns import (
    FREE_GIVEAWAY_RE,
    GENERIC_TITLE_RE,
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


def detect_condition(text: str, category: str) -> Optional[str]:
    if category == "services_work":
        return "new"
    if category == "realestate":
        return None
    lower = text.lower()
    if re.search(r"\bнов(ий|ая|ое|і)\b|brand.?new|у коробці|в упаковке|запечатан", lower):
        return "new"
    return "used"
