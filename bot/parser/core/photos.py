"""Завантаження фото з Telegram у локальне сховище."""

import logging

from parser.config.settings import PHOTOS_DIR, PARSER_MAX_PHOTOS

logger = logging.getLogger(__name__)


async def download_photos(
    app,
    messages_with_photos: list,
    base_name: str,
    max_photos: int | None = None,
) -> list[str]:
    limit = PARSER_MAX_PHOTOS if max_photos is None else max(0, min(PARSER_MAX_PHOTOS, max_photos))
    if limit <= 0:
        return []
    paths = []
    for i, m in enumerate(messages_with_photos[:limit]):
        suffix = f"_{i + 1}" if limit > 1 else ""
        filename = f"{base_name}{suffix}.jpg"
        photo_path = PHOTOS_DIR / filename
        try:
            await app.download_media(m, file_name=str(photo_path))
            paths.append(f"database/parsed_photos/{filename}")
        except Exception as e:
            logger.warning("Не вдалося завантажити фото [%s]: %s", m.id, e)
    return paths
