"""
Конфігурація для спільної бази даних
Всі модулі бота використовують цю спільну БД
"""
import os
from pathlib import Path

# Шлях до спільної БД (Prisma)
BASE_DIR = Path(__file__).resolve().parent.parent.parent
DB_PATH = BASE_DIR / "database" / "ayn_marketplace.db"

# Шлях як рядок для SQLite
DATABASE_PATH = str(DB_PATH)

# Створюємо папку якщо не існує
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

