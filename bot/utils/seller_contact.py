"""Шаблон повідомлення покупця продавцю (кнопка «Написати» / нік у каналі)."""

from __future__ import annotations

from urllib.parse import quote


def _lang_code(lang: str | None) -> str:
    return "uk" if (lang or "").strip().lower().startswith("uk") else "ru"


def build_seller_contact_message(
    listing_title: str,
    listing_url: str,
    *,
    lang: str | None = "ru",
    image_url: str | None = None,
) -> str:
    title = (listing_title or "").strip() or ("Оголошення" if _lang_code(lang) == "uk" else "Объявление")
    link = (listing_url or "").strip()
    photo = (image_url or "").strip()
    open_in_marketplace = (
        "Відкрити в маркетплейсі" if _lang_code(lang) == "uk" else "Открыть в маркетплейс"
    )

    # Порядок лінків важливий: перший URL = превʼю в Telegram → спочатку фото.
    if _lang_code(lang) == "uk":
        lines = ["Вітаю!", "Знайшов(ла) ваше оголошення:", title]
        closing = "Пропозиція ще актуальна?"
    else:
        lines = ["Здравствуйте!", "Нашел(а) ваше объявление:", title]
        closing = "Предложение ещё актуально?"

    if photo:
        lines.append(photo)

    lines.append(open_in_marketplace)
    if link:
        lines.append(link)

    lines.append(closing)
    return "\n".join(lines)


def build_seller_telegram_url(
    username: str,
    listing_title: str,
    listing_url: str,
    *,
    lang: str | None = "ru",
    image_url: str | None = None,
) -> str:
    clean = (username or "").strip().lstrip("@")
    text = build_seller_contact_message(
        listing_title,
        listing_url,
        lang=lang,
        image_url=image_url,
    )
    return f"https://t.me/{quote(clean, safe='')}?text={quote(text)}"
