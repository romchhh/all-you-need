"""Сповіщення автора оголошення через Pyrogram (round-robin акаунтів)."""

from __future__ import annotations

import asyncio
import html
import logging
import time

from parser.core.account_pool import (
    PyrogramAccount,
    extract_flood_wait_seconds,
    is_flood_limit_error,
    list_accounts_round_robin,
)
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


def _dm_targets(item: dict) -> list[str | int]:
    """Username першим — надійніше для cold DM; потім numeric id."""
    targets: list[str | int] = []
    username = (item.get("author_username") or "").strip().lstrip("@")
    author_id = item.get("author_id")
    if username:
        targets.append(f"@{username}")
    if author_id is not None:
        try:
            uid = int(author_id)
            if uid > 0 and uid not in targets:
                targets.append(uid)
        except (TypeError, ValueError):
            pass
    return targets


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
    targets: list[str | int],
    plain_text: str,
) -> None:
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
            last_error: Exception | None = None
            for target in targets:
                try:
                    if isinstance(target, int):
                        await app.get_users(target)
                    await app.send_message(
                        target,
                        plain_text,
                        parse_mode=ParseMode.HTML,
                        disable_web_page_preview=False,
                    )
                    logger.info(
                        "Pyrogram[%s …%s]: DM надіслано автору (target=%s)",
                        acc.label,
                        acc.phone_tail,
                        target,
                    )
                    return
                except Exception as e:
                    last_error = e
                    if _is_peer_or_privacy_error(e):
                        logger.info(
                            "Pyrogram[%s]: peer %s недоступний (%s) — інший target",
                            acc.label,
                            target,
                            type(e).__name__,
                        )
                        continue
                    raise
            if last_error:
                raise last_error


async def try_notify_author_via_pyrogram(
    item: dict,
    listing_id: int,
    use_services_sender: bool = False,
    channel_only: bool = False,
):
    item_id = item.get("id")
    targets = _dm_targets(item)

    if not targets:
        logger.info(
            "Автор оголошення %s невідомий — пропускаємо DM (author_id/username порожні)",
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
        "DM автору item %s listing %s: targets=%s accounts=%s",
        item_id,
        listing_id,
        targets,
        [a.label for a in order],
    )

    for acc in order:
        try:
            await _send_author_dm(acc, targets, plain_text)
            accounts_db.mark_dm_result(acc.id, ok=True)
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
                    "Peer недоступний через %s — пробуємо інший акаунт",
                    acc.label,
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
