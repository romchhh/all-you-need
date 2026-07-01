import asyncio
import logging
import os

from aiogram import Router, types
from aiogram.filters import Command

from utils.filters import IsAdmin
from parser.session_lock import PARSER_SESSION_LOCK

router = Router()
logger = logging.getLogger(__name__)


@router.message(IsAdmin(), Command("parse", "parser", "run_parser"))
async def manual_parser_run(message: types.Message):
    """Ручний запуск циклу парсера (лише для адмінів)."""
    if not os.getenv("PARSER_API_ID"):
        await message.answer(
            "❌ <b>Парсер не налаштовано</b>\n\n"
            "У <code>.env</code> немає <code>PARSER_API_ID</code>.",
            parse_mode="HTML",
        )
        return

    if PARSER_SESSION_LOCK.locked():
        await message.answer(
            "⏳ <b>Парсер вже працює</b>\n\n"
            "Зачекайте завершення поточного циклу.",
            parse_mode="HTML",
        )
        return

    status_msg = await message.answer(
        "🔍 <b>Запускаю парсинг каналів…</b>\n\n"
        "Це може зайняти кілька хвилин. Нові оголошення з’являться у групі модерації.",
        parse_mode="HTML",
    )

    async def _run():
        try:
            from parser.scheduler import run_parser_cycle

            await run_parser_cycle()
            await status_msg.edit_text(
                "✅ <b>Парсинг завершено</b>\n\n"
                "Перевір групу модерації. При помилках адміни отримують окреме сповіщення.",
                parse_mode="HTML",
            )
        except Exception as e:
            logger.exception("Manual parser run failed: %s", e)
            try:
                await status_msg.edit_text(
                    f"❌ <b>Помилка парсера</b>\n\n<code>{type(e).__name__}: {e}</code>",
                    parse_mode="HTML",
                )
            except Exception:
                pass

    asyncio.create_task(_run())


@router.message(IsAdmin(), Command("parse_services", "parse_services_ai"))
async def manual_services_ai_parser_run(message: types.Message):
    """Ручний запуск парсера послуг (AI → канал TradeGround)."""
    from parser.config.services_ai_channels import services_ai_parser_enabled

    if not os.getenv("PARSER_API_ID"):
        await message.answer(
            "❌ <b>Парсер не налаштовано</b>\n\n"
            "У <code>.env</code> немає <code>PARSER_API_ID</code>.",
            parse_mode="HTML",
        )
        return

    if not services_ai_parser_enabled():
        await message.answer(
            "❌ <b>Services AI parser не налаштовано</b>\n\n"
            "Перевірте <code>SERVICE_CHANNELS</code> у <code>parser/config/channels.py</code> "
            "або <code>PARSER_SERVICES_AI_ENABLED=1</code>.",
            parse_mode="HTML",
        )
        return

    if PARSER_SESSION_LOCK.locked():
        await message.answer(
            "⏳ <b>Парсер вже працює</b>\n\n"
            "Зачекайте завершення поточного циклу.",
            parse_mode="HTML",
        )
        return

    status_msg = await message.answer(
        "🔍 <b>Запускаю парсинг послуг (AI → канал)…</b>\n\n"
        "Нові оголошення з’являться у каналі модерації послуг.",
        parse_mode="HTML",
    )

    async def _run():
        try:
            from parser.scheduler import run_services_ai_parser_cycle

            await run_services_ai_parser_cycle()
            await status_msg.edit_text(
                "✅ <b>Парсинг послуг завершено</b>\n\n"
                "Перевір канал модерації. Після підтвердження оголошення з’являться в каналі TradeGround.",
                parse_mode="HTML",
            )
        except Exception as e:
            logger.exception("Manual services AI parser run failed: %s", e)
            try:
                await status_msg.edit_text(
                    f"❌ <b>Помилка парсера послуг</b>\n\n<code>{type(e).__name__}: {e}</code>",
                    parse_mode="HTML",
                )
            except Exception:
                pass

    asyncio.create_task(_run())
