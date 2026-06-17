"""Налаштування модерації парсованих оголошень."""

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")

WEBAPP_URL: str = os.getenv("WEBAPP_URL", "https://allyouneed.de")
BOT_USERNAME: str = (os.getenv("BOT_USERNAME") or "").lstrip("@")
TRADE_SERVICES_CHANNEL_ID_RAW: str = (os.getenv("TRADE_SERVICES_CHANNEL_ID") or "").strip()
PARSER_BOT_TELEGRAM_ID: int = int(os.getenv("PARSER_BOT_TELEGRAM_ID", "0"))
PARSER_SERVICES_BOT_TELEGRAM_ID: int = int(
    os.getenv("PARSER_SERVICES_BOT_TELEGRAM_ID", "5587484547")
)
PARSER_SERVICES_BOT_USERNAME: str = (
    os.getenv("PARSER_SERVICES_BOT_USERNAME") or "tradeground_seller2"
)

PARSER_API_ID: int = int(os.getenv("PARSER_API_ID", "0"))
PARSER_API_HASH: str = os.getenv("PARSER_API_HASH", "")
PARSER_PHONE: str = os.getenv("PARSER_PHONE", "")
PARSER_SERVICES_API_ID: int = int(os.getenv("PARSER_SERVICES_API_ID", "0"))
PARSER_SERVICES_API_HASH: str = os.getenv("PARSER_SERVICES_API_HASH", "")
PARSER_SERVICES_PHONE: str = os.getenv("PARSER_SERVICES_PHONE", "")

PARSER_SESSION_PATH = Path(__file__).resolve().parent.parent / "parser_session"
PARSER_SERVICES_SESSION_PATH = Path(__file__).resolve().parent.parent / "parser_services_session"

NOTIFY_AUTHOR_TEXT_RU = (
    "Привет! 👋\n\n"
    "Мы нашли ваше объявление «{title}» и добавили его на наш маркетплейс "
    "<b>Trade Ground</b> — площадку для украино- и русскоязычных в Германии.\n\n"
    "🔗 Ваше объявление: <a href=\"{listing_url}\">открыть в мини-приложении бота</a>\n\n"
    "Если хотите внести изменения или удалить объявление — напишите нам."
)
