from pathlib import Path
from main import bot
import time

async def download_user_avatar(user_id: int, username: str = None, existing_avatar_path: str = None) -> str | None:
    try:
        photos = await bot.get_user_profile_photos(user_id, limit=1)
        
        if not photos.photos:   
            return None
        
        photo = photos.photos[0][-1]
        
        file = await bot.get_file(photo.file_id)
        
        avatars_dir = Path(__file__).parent.parent.parent / "app" / "public" / "avatars"
        avatars_dir.mkdir(parents=True, exist_ok=True)

        timestamp = int(time.time() * 1000)
        filename = f"avatar_{user_id}_{timestamp}.webp"
        filepath = avatars_dir / filename
        
        if filepath.exists() and filepath.stat().st_size > 0:
            return f"/avatars/{filename}"
        
        if existing_avatar_path:
            old_filepath = avatars_dir / existing_avatar_path.replace('/avatars/', '')
            if old_filepath.exists() and old_filepath != filepath:
                try:
                    old_filepath.unlink()
                except Exception as e:
                    print(f"Error deleting old avatar {old_filepath}: {e}")
        else:   
            for old_file in avatars_dir.glob(f"avatar_{user_id}_*"):
                if old_file != filepath:
                    try:
                        old_file.unlink()
                    except Exception as e:
                        print(f"Error deleting old avatar {old_file}: {e}")
        
        destination = str(filepath)
        await bot.download_file(file.file_path, destination=destination)
        
        if filepath.exists() and filepath.stat().st_size > 0:
            return f"/avatars/{filename}"
        else:
            return None
        
    except Exception as e:
        return None

