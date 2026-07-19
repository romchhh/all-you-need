import asyncio
import html
import logging
import re

from aiogram import F, Router, types
from aiogram.filters import Command

from utils.filters import IsAdmin
from parser.core.session_lock import GLOBAL_PARSER_RUN_LOCK

router = Router()
logger = logging.getLogger(__name__)

_PARSE_CMD = re.compile(r"^/parse(?P<limit>\d+)?(?:@\w+)?$", re.IGNORECASE)
_PARSE_SERVICES_CMD = re.compile(
    r"^/parse_services(?:_ai)?(?P<limit>\d+)?(?:@\w+)?$",
    re.IGNORECASE,
)


def _has_parser_accounts() -> bool:
    try:
        from parser.core.account_pool import list_parser_accounts
        from parser.storage.connection import ensure_parser_storage

        ensure_parser_storage()
        return bool(list_parser_accounts())
    except Exception:
        return False


def _parse_lookback(message: types.Message) -> int | None:
    """
    /parse — останні PARSER_ROLLING_LOOKBACK постів (за замовч. 100).
    /parse10 або /parse 10 — останні N постів.
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
    """Аліас /parse_services → той самий єдиний парсинг."""
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


def _format_parser_stats(stats: dict | None) -> str:
    from parser.notify.report import format_parser_stats

    return format_parser_stats(stats, scheduled=False)


async def _run_unified_parser(message: types.Message, *, lookback: int | None):
    if not _has_parser_accounts():
        await message.answer(
            "❌ <b>Парсер не налаштовано</b>\n\n"
            "Додайте акаунт у адмін-панелі: <b>Парсер акаунти</b>.",
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
            f"🔍 <b>Парсинг усіх груп: останні {lookback} постів</b>\n\n"
            "Унікальні оголошення → групи модерації (дедуп увімкнено)."
        )
    else:
        from parser.config.settings import PARSER_ROLLING_LOOKBACK

        lb = PARSER_ROLLING_LOOKBACK or 100
        status_text = (
            f"🔍 <b>Запускаю парсинг усіх груп…</b>\n\n"
            f"Останні <b>{lb}</b> постів на канал (нові message_id → модерація).\n"
            "💡 <code>/parse200</code> — глибший catch-up"
        )
    status_msg = await message.answer(status_text, parse_mode="HTML")

    async def _run():
        try:
            from parser.scheduler import run_parser_cycle

            stats = await run_parser_cycle(fetch_limit=lookback)
            await status_msg.edit_text(
                _format_parser_stats(stats),
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
    """Ручний запуск: /parse або /parse10 — усі групи."""
    await _run_unified_parser(message, lookback=_parse_lookback(message))


@router.message(IsAdmin(), Command("parser", "run_parser"))
async def manual_parser_run_aliases(message: types.Message):
    """Аліаси /parser та /run_parser — інкрементальний парсинг усіх груп."""
    await _run_unified_parser(message, lookback=None)


@router.message(IsAdmin(), F.func(_is_parse_services_message))
async def manual_services_parser_run_alias(message: types.Message):
    """Аліас /parse_services → той самий єдиний парсинг."""
    await _run_unified_parser(message, lookback=_parse_services_lookback(message))
