"""
Пакет парсера Telegram-каналів.

Структура:
  config/     — .env, канали, акаунти
  core/       — fetch, pipeline, runners, accounts, dedup, session locks
  ai/         — AI screen + enrich
  notify/     — сповіщення груп модерації
  moderation/ — approve / reject / publish
  storage/    — SQLite + marketplace
  scripts/    — CLI (authorize_session, cleanup)
"""

from parser.core.runner import parse_channel, run_all_channels
from parser.moderation.router import router as confirm_router
from parser.scheduler import (
    register_parser_job,
    register_services_ai_parser_job,
    run_parser_cycle,
    run_services_ai_parser_cycle,
)

__all__ = [
    "confirm_router",
    "parse_channel",
    "register_parser_job",
    "register_services_ai_parser_job",
    "run_all_channels",
    "run_parser_cycle",
    "run_services_ai_parser_cycle",
]
