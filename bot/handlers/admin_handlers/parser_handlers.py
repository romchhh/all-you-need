import asyncio
import html
import logging
import os

from aiogram import Router, types
from aiogram.filters import Command

from utils.filters import IsAdmin
from parser.session_lock import PARSER_SESSION_LOCK

router = Router()
logger = logging.getLogger(__name__)


def _format_parser_stats(stats: dict | None, *, services: bool = False) -> str:
    if not stats:
        return "❌ <b>Парсинг не виконано</b>\n\nПеревір логи бота або .env (PARSER_API_ID, TOKEN)."

    added = int(stats.get("added") or 0)
    skipped = int(stats.get("skipped") or 0)
    channels = stats.get("channels")
    errors = stats.get("errors") or []
    reasons = stats.get("reasons") or {}

    title = "✅ <b>Парсинг послуг завершено</b>" if services else "✅ <b>Парсинг завершено</b>"
    lines = [
        title,
        "",
        f"➕ Нових: <b>{added}</b>",
        f"⏭ Пропущено: <b>{skipped}</b>",
    ]
    if channels is not None:
        lines.append(f"📢 Каналів у черзі: <b>{channels}</b>")

    if reasons:
        lines.append("")
        lines.append("<b>Причини пропуску:</b>")
        for reason, count in sorted(reasons.items(), key=lambda x: -x[1])[:8]:
            lines.append(f"• {html.escape(reason)}: {count}")

    if errors:
        lines.append("")
        lines.append(f"⚠️ Помилок каналів: <b>{len(errors)}</b>")
        for err in errors[:3]:
            ch = html.escape(str(err.get("channel", "?")))
            msg = html.escape(str(err.get("error", ""))[:120])
            lines.append(f"• {ch}: <code>{msg}</code>")

    if services:
        lines.append("")
        lines.append(
            "Модерація: <code>PARSER_SERVICES_AI_MODERATION_CHANNEL_ID</code>\n"
            "Після ✅ → публікація в <code>TRADE_SERVICES_CHANNEL_ID</code>"
        )
    elif added == 0:
        lines.append("")
        lines.append("Якщо очікували нові оголошення — можливо вони вже в БД або канал без нових постів.")

    return "\n".join(lines)


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
        "🔍 <b>Запускаю парсинг каналів (маркетплейс)…</b>\n\n"
        "Канали послуг обробляє <code>/parse_services</code>.",
        parse_mode="HTML",
    )

    async def _run():
        try:
            from parser.scheduler import run_parser_cycle

            stats = await run_parser_cycle()
            await status_msg.edit_text(
                _format_parser_stats(stats, services=False),
                parse_mode="HTML",
            )
        except Exception as e:
            logger.exception("Manual parser run failed: %s", e)
            try:
                await status_msg.edit_text(
                    f"❌ <b>Помилка парсера</b>\n\n<code>{type(e).__name__}: {html.escape(str(e))}</code>",
                    parse_mode="HTML",
                )
            except Exception:
                pass

    asyncio.create_task(_run())


@router.message(IsAdmin(), Command("parse_services", "parse_services_ai"))
async def manual_services_ai_parser_run(message: types.Message):
    """Ручний запуск парсера послуг (AI → канал TradeGround)."""
    from parser.config.services_ai_channels import (
        SERVICES_AI_CHANNELS,
        services_ai_parser_enabled,
    )

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

    channel_list = ", ".join(f"@{html.escape(k)}" for k in list(SERVICES_AI_CHANNELS.keys())[:6])
    status_msg = await message.answer(
        "🔍 <b>Запускаю парсинг послуг (AI → канал)…</b>\n\n"
        f"Канали: {channel_list}",
        parse_mode="HTML",
    )

    async def _run():
        try:
            from parser.scheduler import run_services_ai_parser_cycle

            stats = await run_services_ai_parser_cycle()
            await status_msg.edit_text(
                _format_parser_stats(stats, services=True),
                parse_mode="HTML",
            )
        except Exception as e:
            logger.exception("Manual services AI parser run failed: %s", e)
            try:
                await status_msg.edit_text(
                    f"❌ <b>Помилка парсера послуг</b>\n\n<code>{type(e).__name__}: {html.escape(str(e))}</code>",
                    parse_mode="HTML",
                )
            except Exception:
                pass

    asyncio.create_task(_run())
