"""Сповіщення автора оголошення через Pyrogram."""

import logging

from parser.moderation.config import (
    NOTIFY_AUTHOR_CHANNEL_TEXT_RU,
    NOTIFY_AUTHOR_TEXT_RU,
    PARSER_API_HASH,
    PARSER_API_ID,
    PARSER_PHONE,
    PARSER_SERVICES_API_HASH,
    PARSER_SERVICES_API_ID,
    PARSER_SERVICES_PHONE,
    PARSER_SERVICES_SESSION_PATH,
    PARSER_SESSION_PATH,
)
from parser.moderation.urls import listing_miniapp_url

logger = logging.getLogger(__name__)


def _main_pyrogram_configured() -> bool:
    return bool(PARSER_API_ID and PARSER_API_HASH and PARSER_PHONE)


def _services_pyrogram_configured() -> bool:
    return bool(
        PARSER_SERVICES_API_ID and PARSER_SERVICES_API_HASH and PARSER_SERVICES_PHONE
    )


def _is_peer_flood_error(err_s: str) -> bool:
    low = err_s.lower()
    return (
        "PEER_FLOOD" in err_s
        or "FLOOD_WAIT" in err_s
        or ("flood" in low and "limited" in low)
        or "currently limited" in low
    )


async def try_notify_author_via_pyrogram(
    item: dict,
    listing_id: int,
    use_services_sender: bool = False,
    channel_only: bool = False,
    _retried_main_fallback: bool = False,
    _flood_account_switch_done: bool = False,
):
    author_id = item.get("author_id")
    author_username = item.get("author_username")
    title = item.get("title", "")

    if not author_id and not author_username:
        logger.info("Автор оголошення %s невідомий — пропускаємо сповіщення", item["id"])
        return

    api_id = PARSER_API_ID
    api_hash = PARSER_API_HASH
    phone = PARSER_PHONE
    session_path = PARSER_SESSION_PATH
    sender_label = "main"

    if use_services_sender:
        if PARSER_SERVICES_API_ID and PARSER_SERVICES_API_HASH and PARSER_SERVICES_PHONE:
            api_id = PARSER_SERVICES_API_ID
            api_hash = PARSER_SERVICES_API_HASH
            phone = PARSER_SERVICES_PHONE
            session_path = PARSER_SERVICES_SESSION_PATH
            sender_label = "services"
        else:
            logger.warning(
                "PARSER_SERVICES_API_ID/HASH/PHONE не заповнені — "
                "DM автору через основний parser-акаунт"
            )

    if not api_id or not api_hash or not phone:
        logger.info("Pyrogram не налаштовано — пропускаємо сповіщення автору")
        return

    try:
        from pyrogram import Client
    except ImportError:
        logger.warning("Pyrogram не встановлено — пропускаємо сповіщення автору")
        return

    from parser.session_lock import pyrogram_session_guard

    if channel_only:
        plain_text = NOTIFY_AUTHOR_CHANNEL_TEXT_RU.format(title=title)
    else:
        plain_text = NOTIFY_AUTHOR_TEXT_RU.format(
            title=title,
            listing_url=listing_miniapp_url(listing_id),
        )

    try:
        app = Client(
            name=str(session_path),
            api_id=int(api_id),
            api_hash=api_hash,
            phone_number=phone,
        )
        async with pyrogram_session_guard(session_path, timeout=120):
            async with app:
                target = author_id or f"@{author_username}"
                await app.send_message(target, plain_text)
                logger.info("Pyrogram[%s]: надіслано сповіщення автору %s", sender_label, target)
    except Exception as e:
        err_s = str(e)
        logger.warning(
            "Pyrogram[%s]: не вдалося надіслати автору сповіщення: %s",
            sender_label,
            e,
        )
        if (
            use_services_sender
            and not _retried_main_fallback
            and ("PEER_ID_INVALID" in err_s or "peer id" in err_s.lower())
        ):
            logger.info("Повтор DM автору через основний parser-акаунт (services peer невідомий)")
            await try_notify_author_via_pyrogram(
                item,
                listing_id,
                use_services_sender=False,
                channel_only=channel_only,
                _retried_main_fallback=True,
                _flood_account_switch_done=_flood_account_switch_done,
            )
            return

        if _is_peer_flood_error(err_s) and not _flood_account_switch_done:
            if use_services_sender and _main_pyrogram_configured():
                logger.info(
                    "PEER_FLOOD/ліміт на акаунті послуг — пробуємо основний parser-акаунт"
                )
                await try_notify_author_via_pyrogram(
                    item,
                    listing_id,
                    use_services_sender=False,
                    channel_only=channel_only,
                    _retried_main_fallback=_retried_main_fallback,
                    _flood_account_switch_done=True,
                )
                return
            if not use_services_sender and _services_pyrogram_configured():
                logger.info(
                    "PEER_FLOOD/ліміт на основному parser — пробуємо акаунт послуг (Pyrogram)"
                )
                await try_notify_author_via_pyrogram(
                    item,
                    listing_id,
                    use_services_sender=True,
                    channel_only=channel_only,
                    _retried_main_fallback=_retried_main_fallback,
                    _flood_account_switch_done=True,
                )
