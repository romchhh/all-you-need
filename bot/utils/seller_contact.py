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
) -> str:
    title = (listing_title or "").strip() or ("Оголошення" if _lang_code(lang) == "uk" else "Объявление")
    link = (listing_url or "").strip()

    if _lang_code(lang) == "uk":
        return (
            "👋 Вітаю!\n"
            "Знайшов(ла) ваше оголошення:\n\n"
            f"📌 {title}\n"
            f"🔗 {link}\n\n"
            "Пропозиція ще актуальна?"
        )

    return (
        "👋 Здравствуйте!\n"
        "Нашёл(а) ваше объявление:\n\n"
        f"📌 {title}\n"
        f"🔗 {link}\n\n"
        "Предложение ещё актуально?"
    )


def build_seller_telegram_url(
    username: str,
    listing_title: str,
    listing_url: str,
    *,
    lang: str | None = "ru",
) -> str:
    clean = (username or "").strip().lstrip("@")
    text = build_seller_contact_message(listing_title, listing_url, lang=lang)
    return f"https://t.me/{quote(clean, safe='')}?text={quote(text)}"
