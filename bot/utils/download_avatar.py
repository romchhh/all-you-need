from pathlib import Path
from main import bot

async def download_user_avatar(user_id: int, username: str = None, existing_avatar_path: str = None) -> str | None:
    """Завантажує фото профілю з Telegram один раз. Стабільне ім'я avatar_{user_id}.webp. Старі файли видаляються."""
    try:
        photos = await bot.get_user_profile_photos(user_id, limit=1)
        if not photos.photos:
            return None

        photo = photos.photos[0][-1]
        file = await bot.get_file(photo.file_id)

        avatars_dir = Path(__file__).parent.parent.parent / "app" / "public" / "avatars"
        avatars_dir.mkdir(parents=True, exist_ok=True)

        ext = (Path(file.file_path or "").suffix or ".webp").lstrip(".").lower()
        if ext not in ("jpg", "jpeg", "png", "webp", "gif"):
            ext = "webp"
        filename = f"avatar_{user_id}.{ext}"
        filepath = avatars_dir / filename

        # Видаляємо всі старі аватари цього користувача (avatar_123.* та avatar_123_*)
        for old_file in avatars_dir.glob(f"avatar_{user_id}*"):
            if old_file != filepath:
                try:
                    old_file.unlink()
                except Exception as e:
                    print(f"Error deleting old avatar {old_file}: {e}")

        await bot.download_file(file.file_path, destination=str(filepath))

        if filepath.exists() and filepath.stat().st_size > 0:
            return f"/avatars/{filename}"
        return None
    except Exception as e:
        return None

