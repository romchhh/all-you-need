"""Налаштування парсера з .env."""

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")

FETCH_LIMIT: int = int(os.getenv("PARSER_FETCH_LIMIT", "100"))

SERVICES_MODERATION_CHANNEL_ID: int = int(
    os.getenv("PARSER_SERVICES_MODERATION_CHANNEL_ID", "-1003714727651")
)

REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent
PHOTOS_DIR = REPO_ROOT / "database" / "parsed_photos"
PHOTOS_DIR.mkdir(parents=True, exist_ok=True)
