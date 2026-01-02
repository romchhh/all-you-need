"""
Утиліта для завантаження аватарки користувача через Telegram Bot API
"""
from pathlib import Path
from main import bot


async def download_user_avatar(user_id: int, username: str = None) -> str | None:
    """
    Завантажує аватарку користувача через Telegram Bot API
    
    Args:
        user_id: Telegram ID користувача
        username: Username користувача (опціонально)
    
    Returns:
        Шлях до збереженого файлу або None якщо не вдалося завантажити
    """
    try:
        # Отримуємо список фото профілю користувача
        photos = await bot.get_user_profile_photos(user_id, limit=1)
        
        if not photos.photos:
            print(f"No profile photos found for user {user_id}")
            return None
        
        # Беремо найбільше фото (останнє в списку)
        photo = photos.photos[0][-1]  # Останнє фото має найбільший розмір
        
        # Отримуємо інформацію про файл
        file = await bot.get_file(photo.file_id)
        
        # Створюємо папку для аватарів якщо не існує
        avatars_dir = Path(__file__).parent.parent.parent / "app" / "public" / "avatars"
        avatars_dir.mkdir(parents=True, exist_ok=True)
        
        # Формуємо ім'я файлу
        filename = f"avatar_{user_id}_{photo.file_unique_id}.jpg"
        filepath = avatars_dir / filename
        
        # Завантажуємо файл
        # В aiogram 3.x використовуємо download_file з destination
        destination = str(filepath)
        await bot.download_file(file.file_path, destination=destination)
        
        # Перевіряємо чи файл існує
        if filepath.exists() and filepath.stat().st_size > 0:
            # Повертаємо відносний шлях для використання в міні-додатку
            print(f"Avatar successfully downloaded: {filepath}")
            return f"/avatars/{filename}"
        else:
            print(f"File was not downloaded or is empty: {filepath}")
            return None
        
    except Exception as e:
        print(f"Error downloading avatar for user {user_id}: {e}")
        return None

