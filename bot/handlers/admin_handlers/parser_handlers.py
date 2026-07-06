import asyncio
import html
import logging
import os
import re

from aiogram import F, Router, types
from aiogram.filters import Command

from utils.filters import IsAdmin
from parser.session_lock import GLOBAL_PARSER_RUN_LOCK

router = Router()
logger = logging.getLogger(__name__)

_PARSE_CMD = re.compile(r"^/parse(?P<limit>\d+)?(?:@\w+)?$", re.IGNORECASE)
_PARSE_SERVICES_CMD = re.compile(
    r"^/parse_services(?:_ai)?(?P<limit>\d+)?(?:@\w+)?$",
    re.IGNORECASE,
)


def _parse_lookback(message: types.Message) -> int | None:
    """
    /parse — інкрементально (cursor).
    /parse10 або /parse 10 — останні N постів без cursor, dedup вимк.
    """
    text = (message.text or "").strip()
    if not text:
        return None
    head = text.split()[0]
    m = _PARSE_CMD.match(head)
    if not m:
        return None
    if m.group("limit"):
        return max(1, min(500, int(m.group("limit"))))
    parts = text.split()
    if len(parts) >= 2 and parts[1].isdigit():
        return max(1, min(500, int(parts[1])))
    return None


def _is_parse_message(message: types.Message) -> bool:
    head = (message.text or "").strip().split()[0] if message.text else ""
    return bool(_PARSE_CMD.match(head))


def _parse_services_lookback(message: types.Message) -> int | None:
    """
    /parse_services — інкрементально (cursor).
    /parse_services100 або /parse_services 100 — останні N постів без cursor.
    """
    text = (message.text or "").strip()
    if not text:
        return None
    head = text.split()[0]
    m = _PARSE_SERVICES_CMD.match(head)
    if not m:
        return None
    if m.group("limit"):
        return max(1, min(500, int(m.group("limit"))))
    parts = text.split()
    if len(parts) >= 2 and parts[1].isdigit():
        return max(1, min(500, int(parts[1])))
    return None


def _is_parse_services_message(message: types.Message) -> bool:
    head = (message.text or "").strip().split()[0] if message.text else ""
    return bool(_PARSE_SERVICES_CMD.match(head))


def _format_parser_stats(stats: dict | None, *, services: bool = False) -> str:
    if not stats:
        return "❌ <b>Парсинг не виконано</b>\n\nПеревір логи бота або .env (PARSER_API_ID, TOKEN)."

    added = int(stats.get("added") or 0)
    skipped = int(stats.get("skipped") or 0)
    channels = stats.get("channels")
    errors = stats.get("errors") or []
    reasons = stats.get("reasons") or {}
    lookback = stats.get("lookback")

    title = "✅ <b>Парсинг послуг завершено</b>" if services else "✅ <b>Парсинг завершено</b>"
    lines = [
        title,
        "",
        f"➕ Нових: <b>{added}</b>",
        f"⏭ Пропущено: <b>{skipped}</b>",
    ]
    if lookback:
        if services:
            lines.append(f"📥 Останні <b>{lookback}</b> постів на канал (cursor ігноровано)")
        else:
            lines.append(
                f"📥 Останні <b>{lookback}</b> постів на канал (cursor ігноровано, AI+dedup)"
            )
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
            "AI-фільтр: мусор і дублі відсікаються на парсингу.\n"
            "Модерація (два окремі чати на кожен пост):\n"
            "• <code>PARSER_SERVICES_MODERATION_CHANNEL_ID</code> → ✅ лише маркетплейс\n"
            "• <code>PARSER_SERVICES_AI_MODERATION_CHANNEL_ID</code> → ✅ лише Telegram-канал\n"
            "Канали публікації: Hamburg — <code>TRADE_SERVICES_CHANNEL_HAMBURG_ID</code>, "
            "інші — <code>TRADE_SERVICES_CHANNEL_GERMANY_ID</code>\n\n"
            "💡 <code>/parse_services100</code> — останні 100 постів без cursor"
        )
    elif added == 0:
        lines.append("")
        lines.append("Якщо очікували нові оголошення — можливо вони вже в БД або канал без нових постів.")
    else:
        lines.append("")
        lines.append("💡 <code>/parse10</code> — останні 10 постів без cursor")

    return "\n".join(lines)


async def _run_marketplace_parser(message: types.Message, *, lookback: int | None):
    if not os.getenv("PARSER_API_ID"):
        await message.answer(
            "❌ <b>Парсер не налаштовано</b>\n\n"
            "У <code>.env</code> немає <code>PARSER_API_ID</code>.",
            parse_mode="HTML",
        )
        return

    if GLOBAL_PARSER_RUN_LOCK.locked():
        await message.answer(
            "⏳ <b>Парсер вже працює</b>\n\n"
            "Зачекайте завершення поточного циклу.",
            parse_mode="HTML",
        )
        return

    if lookback:
        status_text = (
            f"🔍 <b>Парсинг маркетплейсу: останні {lookback} постів</b>\n\n"
            "Cursor ігноровано, AI-фільтр + dedup увімкнено.\n"
            "Канали послуг — <code>/parse_services</code>."
        )
    else:
        status_text = (
            "🔍 <b>Запускаю парсинг каналів (маркетплейс)…</b>\n\n"
            "Канали послуг обробляє <code>/parse_services</code>.\n"
            "💡 <code>/parse10</code> — примусово останні 10 постів"
        )
    status_msg = await message.answer(status_text, parse_mode="HTML")

    async def _run():
        try:
            from parser.scheduler import run_parser_cycle

            stats = await run_parser_cycle(fetch_limit=lookback)
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


@router.message(IsAdmin(), F.func(_is_parse_message))
async def manual_parser_run(message: types.Message):
    """Ручний запуск: /parse або /parse10."""
    await _run_marketplace_parser(message, lookback=_parse_lookback(message))


@router.message(IsAdmin(), Command("parser", "run_parser"))
async def manual_parser_run_aliases(message: types.Message):
    """Аліаси /parser та /run_parser — інкрементальний парсинг."""
    await _run_marketplace_parser(message, lookback=None)


@router.message(IsAdmin(), F.func(_is_parse_services_message))
async def manual_services_ai_parser_run(message: types.Message):
    """Ручний запуск: /parse_services або /parse_services100."""
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

    if GLOBAL_PARSER_RUN_LOCK.locked():
        await message.answer(
            "⏳ <b>Парсер вже працює</b>\n\n"
            "Зачекайте завершення поточного циклу.",
            parse_mode="HTML",
        )
        return

    lookback = _parse_services_lookback(message)
    channel_list = ", ".join(f"@{html.escape(k)}" for k in list(SERVICES_AI_CHANNELS.keys())[:6])

    if lookback:
        status_text = (
            f"🔍 <b>Парсинг послуг: останні {lookback} постів</b>\n\n"
            f"Cursor ігноровано. Канали: {channel_list}"
        )
    else:
        status_text = (
            "🔍 <b>Запускаю парсинг послуг (інкрементально)…</b>\n\n"
            f"Канали: {channel_list}\n"
            "💡 <code>/parse_services100</code> — примусово останні 100 постів"
        )
    status_msg = await message.answer(status_text, parse_mode="HTML")

    async def _run():
        try:
            from parser.scheduler import run_services_ai_parser_cycle

            stats = await run_services_ai_parser_cycle(fetch_limit=lookback)
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
