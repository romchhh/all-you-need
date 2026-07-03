"""
Шедулер для автоматичного парсингу Telegram-каналів через Pyrogram.

Запускається як окремий процес поряд з основним aiogram-ботом.
Сесії Pyrogram: bot/parser/parser_session та bot/parser/parser_services_session.

Налаштування в .env:
  PARSER_API_ID       — api_id з my.telegram.org (акаунт 1)
  PARSER_API_HASH     — api_hash акаунта 1
  PARSER_PHONE        — телефон акаунта 1
  PARSER_SERVICES_API_ID / PARSER_SERVICES_API_HASH / PARSER_SERVICES_PHONE — акаунт 2 (опційно)
  PARSER_GROUP_ID     — ID групи куди надсилаються оголошення для модерації
  PARSER_INTERVAL_MIN — інтервал перевірки в хвилинах (за замовч. 30)
  PARSER_BOT_TELEGRAM_ID — telegram_id системного користувача-бота
  BOT_TOKEN           — токен основного aiogram-бота (для надсилання в групу)
  PARSER_EXTRA_CHANNELS — додаткові канали: userOrLink:Місто,... (див. parser.py)
  PARSER_SERVICES_AI_CHANNELS — групи послуг для AI→канал: userOrLink:Місто,...
  PARSER_SERVICES_AI_MODERATION_CHANNEL_ID — модерація (за замовч. -1003901841142)
  PARSER_SERVICES_AI_INTERVAL_MIN — інтервал AI-парсера послуг (за замовч. = PARSER_INTERVAL_MIN)
  TRADE_SERVICES_CHANNEL_HAMBURG_ID — канал послуг Hamburg (за замовч. -1003627644062)
  TRADE_SERVICES_CHANNEL_GERMANY_ID — канал послуг Germany (за замovch. -1003857694156)
  OPENAI_API_KEY — AI при підтвердженні модератором
"""

import asyncio
import logging
import os
import traceback
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

logger = logging.getLogger(__name__)

PARSER_API_ID: int = int(os.getenv("PARSER_API_ID", "0"))
PARSER_API_HASH: str = os.getenv("PARSER_API_HASH", "")
PARSER_PHONE: str = os.getenv("PARSER_PHONE", "")
PARSER_INTERVAL_MIN: float = float(os.getenv("PARSER_INTERVAL_MIN", "30"))
PARSER_SERVICES_AI_INTERVAL_MIN: float = float(
    os.getenv("PARSER_SERVICES_AI_INTERVAL_MIN", os.getenv("PARSER_INTERVAL_MIN", "30"))
)
BOT_TOKEN: str = os.getenv("TOKEN", "")


# ──────────────────────────────────────────────
# Основна функція одного циклу парсингу
# ──────────────────────────────────────────────

async def run_parser_cycle() -> dict | None:
    """Один повний цикл парсингу всіх каналів. Повертає stats або None при помилці."""
    if not BOT_TOKEN:
        logger.error("TOKEN не встановлено в .env — парсер не може сповіщати адмінів")
        return None

    from aiogram import Bot
    from parser.admin_notify import (
        notify_admin_group,
        notify_parser_channel_errors,
        notify_parser_error_admins,
    )
    from parser.core.pyrogram_accounts import list_parser_accounts
    from parser.session_lock import GLOBAL_PARSER_RUN_LOCK

    aiogram_bot = Bot(token=BOT_TOKEN)

    async def _notify_error(title: str, details: str) -> None:
        try:
            await notify_parser_error_admins(aiogram_bot, title, details)
        except Exception as notify_err:
            logger.warning("Не вдалося сповістити адмінів про помилку парсера: %s", notify_err)

    try:
        accounts = list_parser_accounts()
        if not accounts:
            msg = "PARSER_API_ID / PARSER_API_HASH / PARSER_PHONE не встановлено в .env"
            logger.error(msg)
            await _notify_error("налаштування", msg)
            return None

        from parser.core.runner import run_all_channels

        async def notify_callback(item_data: dict):
            await notify_admin_group(aiogram_bot, item_data)

        stats: dict | None = None
        try:
            async with GLOBAL_PARSER_RUN_LOCK:
                logger.info(
                    "🔍 Починаємо парсинг каналів (%s Telegram-акаунт(ів))…",
                    len(accounts),
                )
                stats = await run_all_channels(notify_callback)
                logger.info(
                    "✅ Парсинг завершено: +%s нових, пропущено %s",
                    stats["added"],
                    stats["skipped"],
                )
                channel_errors = stats.get("errors") or []
                if channel_errors:
                    await notify_parser_channel_errors(aiogram_bot, channel_errors)
        except RuntimeError as e:
            logger.error("Сесія парсера зайнята: %s", e, exc_info=True)
            await _notify_error("сесія зайнята", str(e))
        except Exception as e:
            logger.error("Критична помилка в циклі парсингу: %s", e, exc_info=True)
            await _notify_error(
                "критична помилка циклу",
                f"{type(e).__name__}: {e}\n\n{traceback.format_exc()[-3000:]}",
            )
        return stats
    finally:
        await aiogram_bot.session.close()


async def run_services_ai_parser_cycle() -> dict | None:
    """Цикл парсингу груп послуг → модерація → публікація лише в Telegram-канал."""
    from parser.config.services_ai_channels import services_ai_parser_enabled

    if not services_ai_parser_enabled():
        logger.debug("Services AI parser вимкнено або немає SERVICE_CHANNELS у CHANNELS")
        return {"added": 0, "skipped": 0, "errors": [{"error": "parser disabled"}], "channels": 0}

    if not BOT_TOKEN:
        logger.error("TOKEN не встановлено — services AI parser не може сповіщати модераторів")
        return None

    from aiogram import Bot
    from parser.admin_notify import (
        notify_admin_group,
        notify_parser_channel_errors,
        notify_parser_error_admins,
    )
    from parser.core.pyrogram_accounts import list_parser_accounts
    from parser.session_lock import GLOBAL_PARSER_RUN_LOCK

    aiogram_bot = Bot(token=BOT_TOKEN)

    async def _notify_error(title: str, details: str) -> None:
        try:
            await notify_parser_error_admins(aiogram_bot, title, details)
        except Exception as notify_err:
            logger.warning("Не вдалося сповістити адмінів про помилку services AI parser: %s", notify_err)

    try:
        accounts = list_parser_accounts()
        if not accounts:
            msg = "PARSER_API_ID / PARSER_API_HASH / PARSER_PHONE не встановлено в .env"
            logger.error(msg)
            await _notify_error("services AI — налаштування", msg)
            return None

        from parser.core.services_ai_runner import run_services_ai_channels

        async def notify_callback(item_data: dict):
            await notify_admin_group(aiogram_bot, item_data)

        stats: dict | None = None
        try:
            async with GLOBAL_PARSER_RUN_LOCK:
                logger.info(
                    "🔍 Починаємо парсинг груп послуг (AI → канал, %s акаунт(ів))…",
                    len(accounts),
                )
                stats = await run_services_ai_channels(notify_callback)
                logger.info(
                    "✅ Services AI parser: +%s нових, пропущено %s",
                    stats["added"],
                    stats["skipped"],
                )
                channel_errors = stats.get("errors") or []
                if channel_errors:
                    await notify_parser_channel_errors(aiogram_bot, channel_errors)
        except RuntimeError as e:
            logger.error("Services AI parser — сесія зайнята: %s", e, exc_info=True)
            await _notify_error("services AI — сесія зайнята", str(e))
        except Exception as e:
            logger.error("Критична помилка services AI parser: %s", e, exc_info=True)
            await _notify_error(
                "services AI — критична помилка",
                f"{type(e).__name__}: {e}\n\n{traceback.format_exc()[-3000:]}",
            )
        return stats
    finally:
        await aiogram_bot.session.close()


# ──────────────────────────────────────────────
# Реєстрація задачі в apscheduler (для інтеграції з main.py)
# ──────────────────────────────────────────────

def register_parser_job(scheduler):
    """
    Реєструє задачу парсингу в apscheduler.
    Передай scheduler з main.py.

    Використання в main.py:
        from parser.scheduler import register_parser_job
        register_parser_job(scheduler)
    """
    scheduler.add_job(
        run_parser_cycle,
        trigger="interval",
        minutes=PARSER_INTERVAL_MIN,
        id="telegram_parser",
        replace_existing=True,
        misfire_grace_time=max(60, int(PARSER_INTERVAL_MIN * 60)),
        max_instances=1,
    )
    logger.info(f"✅ Parser scheduler зареєстровано (інтервал: {PARSER_INTERVAL_MIN} хв)")


def register_services_ai_parser_job(scheduler):
    """Реєструє парсер послуг (AI → канал TradeGround, без маркетплейсу)."""
    from parser.config.services_ai_channels import services_ai_parser_enabled

    if not services_ai_parser_enabled():
        logger.info(
            "Services AI parser не зареєстровано "
            "(PARSER_SERVICES_AI_ENABLED=0 або порожній SERVICE_CHANNELS)"
        )
        return

    scheduler.add_job(
        run_services_ai_parser_cycle,
        trigger="interval",
        minutes=PARSER_SERVICES_AI_INTERVAL_MIN,
        id="telegram_services_ai_parser",
        replace_existing=True,
        misfire_grace_time=max(60, int(PARSER_SERVICES_AI_INTERVAL_MIN * 60)),
        max_instances=1,
    )
    logger.info(
        "✅ Services AI parser scheduler зареєстровано (інтервал: %s хв)",
        PARSER_SERVICES_AI_INTERVAL_MIN,
    )


# ──────────────────────────────────────────────
# Запуск як самостійного скрипту (python -m parser.scheduler)
# ──────────────────────────────────────────────

async def _standalone_loop():
    """Нескінченний цикл для самостійного запуску."""
    interval_sec = PARSER_INTERVAL_MIN * 60
    logger.info(
        f"🚀 Парсер запущено в standalone-режимі. Інтервал: {PARSER_INTERVAL_MIN} хв."
    )
    while True:
        await run_parser_cycle()
        logger.info(f"⏳ Наступний запуск через {PARSER_INTERVAL_MIN} хвилин...")
        await asyncio.sleep(interval_sec)


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )
    asyncio.run(_standalone_loop())
