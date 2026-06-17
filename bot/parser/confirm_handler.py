"""Зворотна сумісність: parser.confirm_handler → parser.moderation."""

from parser.moderation.router import router

__all__ = ["router"]
