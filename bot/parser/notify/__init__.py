"""Сповіщення адмінів / груп модерації парсера."""

from parser.notify.admin import (
    get_parser_group_id,
    notify_admin_group,
    notify_parser_channel_errors,
    notify_parser_error_admins,
)

__all__ = [
    "get_parser_group_id",
    "notify_admin_group",
    "notify_parser_channel_errors",
    "notify_parser_error_admins",
]
