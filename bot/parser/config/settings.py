"""Налаштування парсера з .env."""

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")

FETCH_LIMIT: int = int(os.getenv("PARSER_FETCH_LIMIT", "100"))

# Не пропускати дублікат, поки оголошення активне на платформі або в черзі модерації (N днів).
PARSER_DEDUP_DAYS: int = max(1, int(os.getenv("PARSER_DEDUP_DAYS", "30")))

# Fuzzy-дедуп через OpenAI embeddings (text-embedding-3-small, ~копійки на оголошення).
PARSER_FUZZY_DEDUP_ENABLED: bool = (
    os.getenv("PARSER_FUZZY_DEDUP", "1").strip().lower() not in ("0", "false", "no", "off")
)
PARSER_FUZZY_DEDUP_THRESHOLD: float = float(os.getenv("PARSER_FUZZY_DEDUP_THRESHOLD", "0.86"))
PARSER_EMBEDDING_MODEL: str = (os.getenv("PARSER_EMBEDDING_MODEL") or "text-embedding-3-small").strip()

SERVICES_MODERATION_CHANNEL_ID: int = int(
    os.getenv("PARSER_SERVICES_MODERATION_CHANNEL_ID", "-1003714727651")
)

REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent
PHOTOS_DIR = REPO_ROOT / "database" / "parsed_photos"
PHOTOS_DIR.mkdir(parents=True, exist_ok=True)
