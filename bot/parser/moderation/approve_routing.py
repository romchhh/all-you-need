"""Маршрутизація approve за групами модерації (3 окремі потоки)."""

from __future__ import annotations

from parser.admin_notify import get_parser_group_id
from parser.config.services_ai_channels import (
    PARSER_TYPE_SERVICES_CHANNEL,
    SERVICES_AI_MODERATION_CHANNEL_ID,
)
from parser.config.settings import SERVICES_MODERATION_CHANNEL_ID

APPROVE_TARGET_MARKETPLACE = "marketplace"
APPROVE_TARGET_SERVICES_CHANNEL = "services_channel"


def services_moderation_chat_ids() -> frozenset[int]:
    return frozenset({SERVICES_MODERATION_CHANNEL_ID, SERVICES_AI_MODERATION_CHANNEL_ID})


def resolve_parser_approve_target(chat_id: int, item: dict) -> str:
    """
    marketplace — маркетплейс (PARSER_GROUP_ID та PARSER_SERVICES_MODERATION для /parse).
    services_channel — маркетплейс + Telegram-канали послуг (/parse_services).
    """
    parser_type = (item.get("parser_type") or "default").strip()
    if parser_type == PARSER_TYPE_SERVICES_CHANNEL:
        return APPROVE_TARGET_SERVICES_CHANNEL
    if chat_id == SERVICES_AI_MODERATION_CHANNEL_ID:
        return APPROVE_TARGET_SERVICES_CHANNEL
    return APPROVE_TARGET_MARKETPLACE


def validate_parser_approve_context(chat_id: int, item: dict) -> str | None:
    """None — OK; інакше текст помилки для модератора."""
    parser_type = (item.get("parser_type") or "default").strip()
    stored = item.get("moderation_chat_id")
    if stored is not None:
        try:
            if int(stored) != chat_id:
                return (
                    "❌ Підтвердьте оголошення в тій групі, "
                    "куди воно надійшло з парсера"
                )
        except (TypeError, ValueError):
            pass

    if parser_type == PARSER_TYPE_SERVICES_CHANNEL and chat_id != SERVICES_AI_MODERATION_CHANNEL_ID:
        return (
            "❌ Оголошення з /parse_services — "
            "підтверджуйте в групі PARSER_SERVICES_AI_MODERATION"
        )

    if (
        chat_id == SERVICES_MODERATION_CHANNEL_ID
        and parser_type == PARSER_TYPE_SERVICES_CHANNEL
    ):
        return (
            "❌ Це оголошення з /parse_services — "
            "підтверджуйте в AI-групі модерації"
        )

    parser_group = get_parser_group_id()
    target = resolve_parser_approve_target(chat_id, item)
    if target == APPROVE_TARGET_MARKETPLACE and parser_group and chat_id != parser_group:
        if chat_id not in services_moderation_chat_ids():
            return "❌ Це оголошення для групи маркетплейсу (PARSER_GROUP_ID)"

    return None
