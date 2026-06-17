"""
Пакет парсера Telegram-каналів.

Структура:
  config/     — канали, .env
  core/       — парсинг тексту та каналів
  storage/    — SQLite parsed_items + маркетплейс
  moderation/ — підтвердження модератором
  ai_enrich/  — AI-покращення при approve (ai_enrich.py)
"""

from parser.core.runner import parse_channel, run_all_channels
from parser.moderation.router import router as confirm_router
from parser.scheduler import register_parser_job, run_parser_cycle

__all__ = [
    "confirm_router",
    "parse_channel",
    "register_parser_job",
    "run_all_channels",
    "run_parser_cycle",
]
