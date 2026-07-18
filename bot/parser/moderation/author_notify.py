"""Сповіщення автора оголошення через Pyrogram (round-robin акаунтів)."""

from __future__ import annotations

import asyncio
import html
import logging
import time
from typing import Any

from parser.core.account_pool import (
    PyrogramAccount,
    extract_flood_wait_seconds,
    is_flood_limit_error,
    list_accounts_round_robin,
)
from parser.core.telegram_meta import resolve_pyrogram_chat_ref
from parser.moderation.formatting import listing_miniapp_url
from parser.storage import parser_accounts_db as accounts_db

logger = logging.getLogger(__name__)

NOTIFY_AUTHOR_TEXT_RU = (
    "Привет! 👋\n\n"
    "Мы нашли ваше объявление «{title}» и добавили его на наш маркетплейс "
    "<b>Trade Ground</b> — площадку для украино- и русскоязычных в Германии.\n\n"
    "🔗 Ваше объявление: <a href=\"{listing_url}\">открыть в мини-приложении бота</a>\n\n"
    "Если хотите внести изменения или удалить объявление — напишите нам."
)

NOTIFY_AUTHOR_CHANNEL_TEXT_RU = (
    "Привет! 👋\n\n"
    "Мы нашли ваше объявление «{title}» и опубликовали его в нашем канале "
    "<b>Trade Ground — услуги</b> для украино- и русскоязычных в Германии.\n\n"
    "Если хотите внести изменения — напишите нам."
)

_DM_SESSION_TIMEOUT = 25.0


def _is_peer_or_privacy_error(err: BaseException) -> bool:
    err_s = str(err).upper()
    return any(
        token in err_s
        for token in (
            "PEER_ID_INVALID",
            "USER_ID_INVALID",
            "USERNAME_INVALID",
            "USERNAME_NOT_OCCUPIED",
            "USER_PRIVACY_RESTRICTED",
            "INPUT_USER_DEACTIVATED",
            "USER_IS_BLOCKED",
            "CHAT_WRITE_FORBIDDEN",
        )
    )


def _is_session_busy(err: BaseException) -> bool:
    return isinstance(err, RuntimeError) and "зайнята" in str(err).lower()


def _username_target(item: dict) -> str | None:
    username = (item.get("author_username") or "").strip().lstrip("@")
    if username:
        return f"@{username}"
    return None


async def _peer_from_source_message(app: Any, item: dict) -> str | int | None:
    """Резолв автора через оригінальний пост у групі (parser уже в чаті)."""
    source_channel = (item.get("source_channel") or "").strip()
    message_id = item.get("message_id")
    if not source_channel or message_id is None:
        return None
    try:
        ref = resolve_pyrogram_chat_ref(source_channel)
        chat = await app.get_chat(ref)
        msg = await app.get_messages(chat.id, int(message_id))
        if not msg:
            return None
        user = getattr(msg, "from_user", None)
        if user is None or getattr(user, "is_bot", False):
            return None
        if getattr(user, "username", None):
            return f"@{user.username}"
        return int(user.id)
    except Exception as e:
        logger.info(
            "resolve author via %s/%s: %s",
            source_channel,
            message_id,
            e,
        )
        return None


async def _warm_peer_via_source_chat(app: Any, item: dict, user_id: int) -> None:
    """Завантажує peer через групу-джерело (спільний чат з автором)."""
    source_channel = (item.get("source_channel") or "").strip()
    message_id = item.get("message_id")
    if not source_channel:
        return
    ref = resolve_pyrogram_chat_ref(source_channel)
    chat = await app.get_chat(ref)
    if message_id is not None:
        await app.get_messages(chat.id, int(message_id))
        return
    await app.get_chat_member(chat.id, user_id)


async def _resolve_dm_target(app: Any, item: dict) -> str | int | None:
    """
    Ціль для DM:
    1) @username з parsed_items (найнадійніше)
    2) from_user оригінального поста в групі
    3) author_id лише після warm через source chat
    """
    username = _username_target(item)
    if username:
        return username

    from_message = await _peer_from_source_message(app, item)
    if from_message:
        return from_message

    author_id = item.get("author_id")
    if author_id is None:
        return None
    try:
        uid = int(author_id)
    except (TypeError, ValueError):
        return None
    if uid <= 0:
        return None

    try:
        await _warm_peer_via_source_chat(app, item, uid)
    except Exception as e:
        logger.info("warm peer %s via source chat: %s", uid, e)

    try:
        user = await app.get_users(uid)
        if getattr(user, "username", None):
            return f"@{user.username}"
        return uid
    except Exception as e:
        logger.info("get_users(%s) failed: %s", uid, e)
        return None


def _build_notify_text(item: dict, listing_id: int, *, channel_only: bool) -> str:
    title = html.escape(str(item.get("title") or "").strip() or "объявление")
    if channel_only:
        return NOTIFY_AUTHOR_CHANNEL_TEXT_RU.format(title=title)
    return NOTIFY_AUTHOR_TEXT_RU.format(
        title=title,
        listing_url=html.escape(listing_miniapp_url(listing_id), quote=True),
    )


async def _send_author_dm(
    acc: PyrogramAccount,
    item: dict,
    plain_text: str,
) -> str | int:
    from pyrogram import Client
    from pyrogram.enums import ParseMode

    from parser.core.pyrogram_accounts import PYROGRAM_SLEEP_THRESHOLD
    from parser.core.session_lock import pyrogram_session_guard

    app = Client(
        name=str(acc.session_path),
        api_id=acc.api_id,
        api_hash=acc.api_hash,
        phone_number=acc.phone,
        sleep_threshold=PYROGRAM_SLEEP_THRESHOLD,
    )
    async with pyrogram_session_guard(acc.session_path, timeout=_DM_SESSION_TIMEOUT):
        async with app:
            target = await _resolve_dm_target(app, item)
            if target is None:
                raise ValueError("author peer not resolved")

            if isinstance(target, int):
                try:
                    await _warm_peer_via_source_chat(app, item, target)
                except Exception as e:
                    logger.debug("warm peer before send %s: %s", target, e)

            await app.send_message(
                target,
                plain_text,
                parse_mode=ParseMode.HTML,
                disable_web_page_preview=False,
            )
            logger.info(
                "Pyrogram[%s …%s]: DM надіслано автору (target=%s, item=%s)",
                acc.label,
                acc.phone_tail,
                target,
                item.get("id"),
            )
            return target


async def try_notify_author_via_pyrogram(
    item: dict,
    listing_id: int,
    use_services_sender: bool = False,
    channel_only: bool = False,
):
    item_id = item.get("id")
    has_username = bool(_username_target(item))
    has_source = bool(item.get("source_channel")) and item.get("message_id") is not None
    has_author_id = bool(item.get("author_id"))

    if not has_username and not has_source and not has_author_id:
        logger.info(
            "Автор оголошення %s невідомий — пропускаємо DM",
            item_id,
        )
        return

    order = list_accounts_round_robin(for_dm=True)
    if not order:
        logger.warning(
            "Немає активних Pyrogram-акаунтів — DM автору item %s не надіслано",
            item_id,
        )
        return

    plain_text = _build_notify_text(item, listing_id, channel_only=channel_only)
    last_error: Exception | None = None

    logger.info(
        "DM автору item %s listing %s: username=%r author_id=%r source=%s/%s accounts=%s",
        item_id,
        listing_id,
        item.get("author_username"),
        item.get("author_id"),
        item.get("source_channel"),
        item.get("message_id"),
        [a.label for a in order],
    )

    for acc in order:
        try:
            target = await _send_author_dm(acc, item, plain_text)
            accounts_db.mark_dm_result(acc.id, ok=True)
            logger.info(
                "DM автору item %s успішно через %s → %s",
                item_id,
                acc.label,
                target,
            )
            return
        except ValueError as e:
            last_error = e
            logger.info("DM item %s: %s", item_id, e)
            return
        except Exception as e:
            last_error = e
            accounts_db.mark_dm_result(acc.id, ok=False, error=str(e))
            if is_flood_limit_error(e):
                wait_sec = extract_flood_wait_seconds(e) or 3600
                accounts_db.set_flood_until(acc.id, time.time() + wait_sec)
                logger.warning(
                    "Ліміт DM на %s (…%s) — пробуємо інший акаунт",
                    acc.label,
                    acc.phone_tail,
                )
                continue
            if _is_session_busy(e):
                logger.info(
                    "Сесія %s зайнята парсером — пробуємо інший акаунт",
                    acc.label,
                )
                continue
            if _is_peer_or_privacy_error(e):
                logger.info(
                    "Peer недоступний через %s (%s) — пробуємо інший акаунт",
                    acc.label,
                    type(e).__name__,
                )
                continue
            logger.warning(
                "Pyrogram[%s]: не вдалося надіслати автору item %s: %s",
                acc.label,
                item_id,
                e,
            )
            continue

    if last_error:
        logger.warning(
            "DM автору item %s: не вдалося з жодного акаунта (%s: %s)",
            item_id,
            type(last_error).__name__,
            last_error,
        )


def schedule_author_notify(
    item: dict,
    listing_id: int,
    *,
    use_services_sender: bool = False,
    channel_only: bool = False,
) -> None:
    """Фонове сповіщення з логуванням необроблених помилок task."""

    async def _run() -> None:
        try:
            await try_notify_author_via_pyrogram(
                item,
                listing_id,
                use_services_sender=use_services_sender,
                channel_only=channel_only,
            )
        except Exception:
            logger.exception(
                "Критична помилка DM автору item %s listing %s",
                item.get("id"),
                listing_id,
            )

    asyncio.create_task(_run())
