"""
Тимчасово зберігає payload з /start (напр. listing_123), поки користувач проходить реєстрацію.
Після завершення — витягується один раз і показується оголошення/профіль.
"""

from __future__ import annotations

_pending: dict[int, str] = {}


def remember_pending_start_param(user_id: int, param: str) -> None:
    p = (param or "").strip()
    if p.startswith("listing_") or p.startswith("user_"):
        _pending[int(user_id)] = p


def take_pending_start_param(user_id: int) -> str | None:
    return _pending.pop(int(user_id), None)
