"""Маршрутизація approve / notify за 3 групами модерації парсера."""

from __future__ import annotations

from parser.config.settings import (
    PARSER_MOD_GOODS_ID,
    PARSER_MOD_SERVICES_GERMANY_ID,
    PARSER_MOD_SERVICES_HAMBURG_ID,
)

APPROVE_TARGET_MARKETPLACE = "marketplace"
APPROVE_TARGET_SERVICES_BOTH = "services_both"  # Telegram-канал + маркетплейс


def services_moderation_chat_ids() -> frozenset[int]:
    return frozenset({PARSER_MOD_SERVICES_HAMBURG_ID, PARSER_MOD_SERVICES_GERMANY_ID})


def all_parser_moderation_chat_ids() -> frozenset[int]:
    return services_moderation_chat_ids() | {PARSER_MOD_GOODS_ID}


def is_services_moderation_chat(chat_id: int) -> bool:
    return chat_id in services_moderation_chat_ids()


def is_goods_moderation_chat(chat_id: int) -> bool:
    return chat_id == PARSER_MOD_GOODS_ID


def resolve_parser_approve_target(chat_id: int, item: dict | None = None) -> str:
    """
    services_both — група послуг Hamburg/Germany → канал + маркетплейс.
    marketplace — група товарів → лише маркетплейс.
    """
    if is_services_moderation_chat(chat_id):
        return APPROVE_TARGET_SERVICES_BOTH
    return APPROVE_TARGET_MARKETPLACE


def validate_parser_approve_context(chat_id: int, item: dict) -> str | None:
    """None — OK; інакше текст помилки для модератора."""
    stored = item.get("moderation_chat_id") or item.get("notify_chat_id")
    if stored is not None:
        try:
            if int(stored) != int(chat_id):
                return (
                    "❌ Підтвердьте оголошення в тій групі, "
                    "куди воно надійшло з парсера"
                )
        except (TypeError, ValueError):
            pass

    if chat_id not in all_parser_moderation_chat_ids():
        return "❌ Невідома група модерації парсера"

    category = (item.get("category") or "").strip().lower()
    if is_goods_moderation_chat(chat_id) and category == "services_work":
        return "❌ Це послуга — підтверджуйте в групі послуг (Hamburg / Germany)"
    if is_services_moderation_chat(chat_id) and category and category != "services_work":
        # Дозволяємо, якщо AI ще не проставив — але парсер послуг майже завжди services_work
        pass

    return None


def notify_chat_for_parsed_item(item: dict) -> int:
    """
    Куди слати карточку модератору після парсингу.
    Товари → група товарів.
    Послуги Hamburg → група Hamburg.
    Послуги Germany / dual → група Germany.
    """
    category = (item.get("category") or "").strip().lower()
    parser_type = (item.get("parser_type") or "").strip()

    is_service = category == "services_work" or parser_type == "services_channel"
    if not is_service:
        return PARSER_MOD_GOODS_ID

    try:
        from parser.moderation.services_publish import (
            is_dual_channel_service,
            is_hamburg_service_item,
        )

        if is_dual_channel_service(item):
            return PARSER_MOD_SERVICES_GERMANY_ID
        if is_hamburg_service_item(item):
            return PARSER_MOD_SERVICES_HAMBURG_ID
    except Exception:
        pass
    return PARSER_MOD_SERVICES_GERMANY_ID


def force_services_channel_ids_for_mod_chat(chat_id: int, item: dict) -> list[int]:
    """
    Які Telegram-канали послуг публікувати при approve з цієї групи.
    Hamburg-група → лише Hamburg.
    Germany-група → Germany (+ Hamburg якщо dual).
    """
    from parser.moderation.services_publish import (
        TRADE_SERVICES_CHANNEL_GERMANY_ID,
        TRADE_SERVICES_CHANNEL_HAMBURG_ID,
        is_dual_channel_service,
        resolve_services_trade_channel_ids,
    )

    if chat_id == PARSER_MOD_SERVICES_HAMBURG_ID:
        return [TRADE_SERVICES_CHANNEL_HAMBURG_ID]
    if chat_id == PARSER_MOD_SERVICES_GERMANY_ID:
        if is_dual_channel_service(item):
            return [TRADE_SERVICES_CHANNEL_HAMBURG_ID, TRADE_SERVICES_CHANNEL_GERMANY_ID]
        return [TRADE_SERVICES_CHANNEL_GERMANY_ID]
    return resolve_services_trade_channel_ids(item)
