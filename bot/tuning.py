"""
Налаштування бота (не .env).

Секрети лишаються в .env: TOKEN, DATABASE_URL, ADMINISTRATORS тощо.
"""

from __future__ import annotations

# ── Щоденний бекап БД → Telegram адмінам (Europe/Kyiv) ────────
DB_BACKUP_ENABLED: bool = True
DB_BACKUP_HOUR: int = 22
DB_BACKUP_MINUTE: int = 0
DB_BACKUP_NOTIFY_ADMINS: bool = True
DB_BACKUP_KEEP_DAYS: int = 14
DB_BACKUP_PG_TIMEOUT_SEC: int = 900
