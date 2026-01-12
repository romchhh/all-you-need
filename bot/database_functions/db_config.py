import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent
DB_PATH = BASE_DIR / "database" / "ayn_marketplace.db"

DATABASE_PATH = str(DB_PATH)

DB_PATH.parent.mkdir(parents=True, exist_ok=True)

