from pathlib import Path
import os
from main import bot


async def download_user_avatar(user_id: int, username: str = None, existing_avatar_path: str = None) -> str | None:
    """
    Завантажує аватарку користувача тільки якщо її ще немає або фото змінилося.
    
    ВАЖЛИВО: Цю функцію слід викликати ТІЛЬКИ:
    1. Для нових користувачів (при першій реєстрації)
    2. Коли користувач змінює аватарку через вебапку
    
    НЕ викликайте цю функцію при кожному вході в бот!
    
    Args:
        user_id: Telegram ID користувача
        username: Username користувача (не використовується)
        existing_avatar_path: Існуючий шлях до аватарки з БД (якщо є)
    
    Returns:
        Відносний шлях до аватарки або None
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
        
        # Формуємо ім'я файлу на основі user_id та file_unique_id
        # file_unique_id змінюється тільки коли користувач змінює фото
        import time
        timestamp = int(time.time() * 1000)  # Мілісекунди для унікальності
        filename = f"avatar_{user_id}_{timestamp}.webp"
        filepath = avatars_dir / filename
        
        # Якщо файл вже існує - не завантажуємо заново
        if filepath.exists() and filepath.stat().st_size > 0:
            print(f"Avatar already exists for user {user_id}: {filename}")
            return f"/avatars/{filename}"
        
        # Видаляємо старі аватарки цього користувача (якщо є)
        if existing_avatar_path:
            old_filepath = avatars_dir / existing_avatar_path.replace('/avatars/', '')
            if old_filepath.exists() and old_filepath != filepath:
                try:
                    old_filepath.unlink()
                    print(f"Deleted old avatar: {old_filepath}")
                except Exception as e:
                    print(f"Error deleting old avatar {old_filepath}: {e}")
        else:
            # Видаляємо всі старі аватарки цього користувача
            for old_file in avatars_dir.glob(f"avatar_{user_id}_*"):
                if old_file != filepath:
                    try:
                        old_file.unlink()
                        print(f"Deleted old avatar: {old_file}")
                    except Exception as e:
                        print(f"Error deleting old avatar {old_file}: {e}")
        
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

