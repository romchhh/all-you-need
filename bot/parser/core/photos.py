"""Завантаження фото з Telegram у локальне сховище."""

import logging

from parser.config.settings import PHOTOS_DIR

logger = logging.getLogger(__name__)


async def download_photos(app, messages_with_photos: list, base_name: str, max_photos: int = 3) -> list[str]:
    paths = []
    limit = max_photos if max_photos > 0 else len(messages_with_photos)
    for i, m in enumerate(messages_with_photos[:limit]):
        suffix = f"_{i + 1}" if len(messages_with_photos) > 1 else ""
        filename = f"{base_name}{suffix}.jpg"
        photo_path = PHOTOS_DIR / filename
        try:
            await app.download_media(m, file_name=str(photo_path))
            paths.append(f"database/parsed_photos/{filename}")
        except Exception as e:
            logger.warning("Не вдалося завантажити фото [%s]: %s", m.id, e)
    return paths
