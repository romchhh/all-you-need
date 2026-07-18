"""
Шедулер для автоматичного парсингу Telegram-каналів через Pyrogram.

Запускається як окремий процес поряд з основним aiogram-ботом.
Сесії: bot/parser/parser_account_1.session … parser_account_3.session

Налаштування в .env:
  PARSER_MOD_SERVICES_HAMBURG_ID / PARSER_MOD_SERVICES_GERMANY_ID / PARSER_MOD_GOODS_ID
  PARSER_INTERVAL_MIN, TOKEN, OPENAI_API_KEY
  TRADE_SERVICES_CHANNEL_HAMBURG_ID / TRADE_SERVICES_CHANNEL_GERMANY_ID
"""

import asyncio
import logging
import os
import traceback
from pathlib import Path

from dotenv import load_dotenv

from parser.config.settings import (
    PARSER_INTERVAL_MIN,
)

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

logger = logging.getLogger(__name__)

BOT_TOKEN: str = os.getenv("TOKEN", "")


# ──────────────────────────────────────────────
# Основна функція одного циклу парсингу
# ──────────────────────────────────────────────

async def run_parser_cycle(
    *,
    fetch_limit: int | None = None,
    ignore_cursor: bool = False,
) -> dict | None:
    """Один повний цикл парсингу всіх каналів. Повертає stats або None при помилці."""
    if not BOT_TOKEN:
        logger.error("TOKEN не встановлено в .env — парсер не може сповіщати адмінів")
        return None

    from parser.core.pyrogram_photo_patch import apply_pyrogram_photo_size_patch

    apply_pyrogram_photo_size_patch()

    from aiogram import Bot
    from parser.notify.admin import (
        notify_admin_group,
        notify_parser_channel_errors,
        notify_parser_error_admins,
    )
    from parser.core.account_pool import list_parser_accounts
    from parser.core.session_lock import GLOBAL_PARSER_RUN_LOCK

    aiogram_bot = Bot(token=BOT_TOKEN)

    async def _notify_error(title: str, details: str) -> None:
        try:
            await notify_parser_error_admins(aiogram_bot, title, details)
        except Exception as notify_err:
            logger.warning("Не вдалося сповістити адмінів про помилку парсера: %s", notify_err)

    try:
        accounts = list_parser_accounts()
        if not accounts:
            msg = "Немає активних акаунтів парсера (Адмін → Парсер акаунти)"
            logger.error(msg)
            await _notify_error("налаштування", msg)
            return None

        from parser.core.runner import ParseRunConfig, parse_run, run_all_channels
        from parser.core.services_ai_runner import ServicesParseRunConfig, services_parse_run
        from parser.storage.connection import ensure_parser_storage, parser_db_cycle

        async def notify_callback(item_data: dict):
            await notify_admin_group(aiogram_bot, item_data)

        stats: dict | None = None
        run_cfg = None
        services_cfg = None
        if fetch_limit is not None:
            run_cfg = ParseRunConfig(
                fetch_limit=fetch_limit,
                ignore_cursor=True,
                dedup_enabled=False,
            )
            services_cfg = ServicesParseRunConfig(fetch_limit=fetch_limit, ignore_cursor=True)
        elif ignore_cursor:
            run_cfg = ParseRunConfig(ignore_cursor=True, dedup_enabled=False)
            services_cfg = ServicesParseRunConfig(ignore_cursor=True)
        try:
            async with GLOBAL_PARSER_RUN_LOCK:
                with parser_db_cycle():
                    await asyncio.to_thread(ensure_parser_storage)
                    if fetch_limit:
                        logger.info(
                            "🔍 Парсинг усіх груп (lookback %s постів, cursor ігноровано)…",
                            fetch_limit,
                        )
                    else:
                        logger.info(
                            "🔍 Починаємо парсинг усіх груп (%s Telegram-акаунт(ів))…",
                            len(accounts),
                        )
                    async with parse_run(run_cfg):
                        async with services_parse_run(services_cfg):
                            stats = await run_all_channels(notify_callback)
                logger.info(
                    "✅ Парсинг завершено: +%s нових, пропущено %s, груп %s",
                    stats["added"],
                    stats["skipped"],
                    stats.get("channels", "?"),
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


async def run_services_ai_parser_cycle(
    *,
    fetch_limit: int | None = None,
    ignore_cursor: bool = False,
) -> dict | None:
    """Зворотна сумісність — той самий єдиний цикл парсингу."""
    return await run_parser_cycle(fetch_limit=fetch_limit, ignore_cursor=ignore_cursor)


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
    logger.info(f"✅ Parser scheduler зареєстровано (усі групи, інтервал: {PARSER_INTERVAL_MIN} хв)")


def register_services_ai_parser_job(scheduler):
    """Застаріло: один job `telegram_parser` парсить усі групи."""
    logger.debug("register_services_ai_parser_job: пропуск (єдиний telegram_parser)")


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
