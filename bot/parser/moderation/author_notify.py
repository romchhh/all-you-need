"""Сповіщення автора оголошення через Pyrogram (round-robin акаунтів)."""

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


async def _send_author_dm(acc: PyrogramAccount, target, plain_text: str) -> None:
    from pyrogram import Client

    from parser.core.pyrogram_accounts import PYROGRAM_SLEEP_THRESHOLD
    from parser.core.session_lock import pyrogram_session_guard

    app = Client(
        name=str(acc.session_path),
        api_id=acc.api_id,
        api_hash=acc.api_hash,
        phone_number=acc.phone,
        sleep_threshold=PYROGRAM_SLEEP_THRESHOLD,
    )
    async with pyrogram_session_guard(acc.session_path, timeout=120):
        async with app:
            await app.send_message(target, plain_text)
            logger.info(
                "Pyrogram[%s …%s]: надіслано сповіщення автору %s",
                acc.label,
                acc.phone_tail,
                target,
            )


async def try_notify_author_via_pyrogram(
    item: dict,
    listing_id: int,
    use_services_sender: bool = False,
    channel_only: bool = False,
):
    author_id = item.get("author_id")
    author_username = item.get("author_username")
    title = item.get("title", "")

    if not author_id and not author_username:
        logger.info("Автор оголошення %s невідомий — пропускаємо сповіщення", item["id"])
        return

    order = list_accounts_round_robin(for_dm=True)
    if not order:
        logger.info("Pyrogram не налаштовано — пропускаємо сповіщення автору")
        return

    if channel_only:
        plain_text = NOTIFY_AUTHOR_CHANNEL_TEXT_RU.format(title=title)
    else:
        plain_text = NOTIFY_AUTHOR_TEXT_RU.format(
            title=title,
            listing_url=listing_miniapp_url(listing_id),
        )

    target = author_id or f"@{author_username}"
    last_error: Exception | None = None

    for acc in order:
        try:
            await _send_author_dm(acc, target, plain_text)
            accounts_db.mark_dm_result(acc.id, ok=True)
            return
        except Exception as e:
            last_error = e
            accounts_db.mark_dm_result(acc.id, ok=False, error=str(e))
            err_s = str(e)
            if is_flood_limit_error(e):
                wait_sec = extract_flood_wait_seconds(e) or 3600
                accounts_db.set_flood_until(acc.id, time.time() + wait_sec)
                logger.warning(
                    "Ліміт DM на %s (…%s) — пробуємо інший акаунт",
                    acc.label,
                    acc.phone_tail,
                )
                continue
            if use_services_sender and (
                "PEER_ID_INVALID" in err_s or "peer id" in err_s.lower()
            ):
                logger.info("Peer невідомий на %s — пробуємо інший акаунт", acc.label)
                continue
            logger.warning(
                "Pyrogram[%s]: не вдалося надіслати автору сповіщення: %s",
                acc.label,
                e,
            )
            continue

    if last_error:
        logger.warning(
            "DM автору item %s: не вдалося з жодного акаунта (%s)",
            item.get("id"),
            last_error,
        )
