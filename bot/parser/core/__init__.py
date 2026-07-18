"""Ядро парсингу: runners, fetch, text, accounts, dedup."""

from parser.core.runner import parse_channel, run_all_channels

__all__ = [
    "parse_channel",
    "run_all_channels",
]
