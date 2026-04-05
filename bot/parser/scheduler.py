"""
Шедулер для автоматичного парсингу Telegram-каналів через Pyrogram.

Запускається як окремий процес поряд з основним aiogram-ботом.
Сесія Pyrogram зберігається у bot/parser/parser_session.

Налаштування в .env:
  PARSER_API_ID       — api_id з my.telegram.org
  PARSER_API_HASH     — api_hash з my.telegram.org
  PARSER_PHONE        — номер телефону аккаунту-парсера
  PARSER_GROUP_ID     — ID групи куди надсилаються оголошення для модерації
  PARSER_INTERVAL_MIN — інтервал перевірки в хвилинах (за замовч. 30)
  PARSER_BOT_TELEGRAM_ID — telegram_id системного користувача-бота
  BOT_TOKEN           — токен основного aiogram-бота (для надсилання в групу)
"""

import asyncio
import logging
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

logger = logging.getLogger(__name__)

PARSER_API_ID: int = int(os.getenv("PARSER_API_ID", "0"))
PARSER_API_HASH: str = os.getenv("PARSER_API_HASH", "")
PARSER_PHONE: str = os.getenv("PARSER_PHONE", "")
PARSER_INTERVAL_MIN: float = float(os.getenv("PARSER_INTERVAL_MIN", "30"))
BOT_TOKEN: str = os.getenv("TOKEN", "")

SESSION_PATH = Path(__file__).resolve().parent / "parser_session"


# ──────────────────────────────────────────────
# Основна функція одного циклу парсингу
# ──────────────────────────────────────────────

async def run_parser_cycle():
    """Один повний цикл парсингу всіх каналів."""
    if not PARSER_API_ID or not PARSER_API_HASH or not PARSER_PHONE:
        logger.error(
            "PARSER_API_ID / PARSER_API_HASH / PARSER_PHONE не встановлено в .env"
        )
        return

    try:
        from pyrogram import Client
    except ImportError:
        logger.error("Pyrogram не встановлено. Запусти: pip install pyrogram tgcrypto")
        return

    from aiogram import Bot
    from parser.parser import run_all_channels
    from parser.admin_notify import notify_admin_group

    aiogram_bot = Bot(token=BOT_TOKEN)

    async def notify_callback(item_data: dict):
        await notify_admin_group(aiogram_bot, item_data)

    pyrogram_client = Client(
        name=str(SESSION_PATH),
        api_id=PARSER_API_ID,
        api_hash=PARSER_API_HASH,
        phone_number=PARSER_PHONE,
    )

    try:
        async with pyrogram_client:
            logger.info("🔍 Починаємо парсинг каналів...")
            stats = await run_all_channels(pyrogram_client, notify_callback)
            logger.info(
                f"✅ Парсинг завершено: +{stats['added']} нових, пропущено {stats['skipped']}"
            )
    except Exception as e:
        logger.error(f"Критична помилка в циклі парсингу: {e}", exc_info=True)
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
        misfire_grace_time=60,
        max_instances=1,
    )
    logger.info(f"✅ Parser scheduler зареєстровано (інтервал: {PARSER_INTERVAL_MIN} хв)")


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
