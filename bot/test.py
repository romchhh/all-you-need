from aiogram import Bot, Dispatcher, Router, F
from aiogram.types import Message, FSInputFile, URLInputFile, BufferedInputFile
from aiogram.filters import Command
from aiogram.enums import ParseMode
import asyncio
import logging

# Налаштування логування
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Ініціалізація
bot = Bot(token="6496449692:AAGkdM_JegZZbmPB-Ew1ED0TgvSE9or_In4")
dp = Dispatcher()
router = Router()

# ID каналу (з мінусом для публічних, або username для приватних)
CHANNEL_ID = "-1002201846313"

@router.message(Command("post_story"))
async def post_story_command(message: Message):
    """
    Команда для публікації Stories
    Використання: /post_story
    """
    await message.answer(
        "📸 Надішліть фото або відео для Stories.\n"
        "Ви можете додати текст як підпис."
    )


@router.message(F.photo)
async def handle_photo_for_story(message: Message):
    """
    Обробка фото для Stories
    """
    try:
        # Отримуємо найкращу якість фото
        photo = message.photo[-1]
        
        # Публікуємо Stories з фото
        story = await bot.send_story(
            chat_id=CHANNEL_ID,
            media=photo.file_id
        )
        
        await message.answer(
            f"✅ Stories опубліковано!\n"
            f"Story ID: {story.story.id}"
        )
        
    except Exception as e:
        logger.error(f"Помилка при публікації Stories: {e}")
        await message.answer(
            f"❌ Помилка: {str(e)}\n\n"
            "Переконайтеся що:\n"
            "• Бот є адміністратором каналу\n"
            "• Бот має право 'Post Stories'\n"
            "• Використовується Bot API 7.0+"
        )


@router.message(F.video)
async def handle_video_for_story(message: Message):
    """
    Обробка відео для Stories
    """
    try:
        video = message.video
        
        # Публікуємо Stories з відео
        story = await bot.send_story(
            chat_id=CHANNEL_ID,
            media=video.file_id
        )
        
        await message.answer(
            f"✅ Stories з відео опубліковано!\n"
            f"Story ID: {story.story.id}"
        )
        
    except Exception as e:
        logger.error(f"Помилка при публікації Stories: {e}")
        await message.answer(f"❌ Помилка: {str(e)}")


@router.message(Command("post_story_url"))
async def post_story_from_url(message: Message):
    """
    Публікація Stories з URL
    Використання: /post_story_url https://example.com/image.jpg
    """
    try:
        # Отримуємо URL з команди
        url = message.text.split(maxsplit=1)[1] if len(message.text.split()) > 1 else None
        
        if not url:
            await message.answer("❌ Вкажіть URL медіа після команди")
            return
        
        # Створюємо URLInputFile
        media = URLInputFile(url)
        
        # Публікуємо Stories
        story = await bot.send_story(
            chat_id=CHANNEL_ID,
            media=media
        )
        
        await message.answer(
            f"✅ Stories з URL опубліковано!\n"
            f"Story ID: {story.story.id}"
        )
        
    except Exception as e:
        logger.error(f"Помилка: {e}")
        await message.answer(f"❌ Помилка: {str(e)}")


@router.message(Command("post_story_file"))
async def post_story_from_file(message: Message):
    """
    Публікація Stories з локального файлу
    """
    try:
        # Шлях до файлу
        file_path = "path/to/your/image.jpg"
        
        # Створюємо FSInputFile
        media = FSInputFile(file_path)
        
        # Публікуємо Stories
        story = await bot.send_story(
            chat_id=CHANNEL_ID,
            media=media
        )
        
        await message.answer(
            f"✅ Stories з файлу опубліковано!\n"
            f"Story ID: {story.story.id}"
        )
        
    except Exception as e:
        logger.error(f"Помилка: {e}")
        await message.answer(f"❌ Помилка: {str(e)}")


@router.message(Command("schedule_story"))
async def schedule_story_example(message: Message):
    """
    Приклад відкладеної публікації Stories
    """
    await message.answer(
        "⏰ Зверніть увагу: Stories не підтримують відкладену публікацію.\n"
        "Але ви можете використати asyncio.sleep() для затримки:\n\n"
        "```python\n"
        "await asyncio.sleep(3600)  # 1 година\n"
        "await bot.send_story(CHANNEL_ID, media)\n"
        "```"
    )


@router.message(Command("story_with_areas"))
async def story_with_interactive_areas(message: Message):
    """
    Приклад Stories з інтерактивними областями (посилання, локація, тощо)
    Примітка: Ця функція може бути доступна в майбутніх версіях API
    """
    await message.answer(
        "📍 Інтерактивні елементи в Stories:\n\n"
        "В майбутніх версіях API можуть з'явитися:\n"
        "• Посилання\n"
        "• Локації\n"
        "• Згадки користувачів\n"
        "• Опитування\n\n"
        "Зараз доступна базова публікація медіа."
    )


@router.message(Command("check_stories"))
async def check_channel_stories(message: Message):
    """
    Перевірка активних Stories каналу
    """
    try:
        # Отримуємо інформацію про канал
        chat = await bot.get_chat(CHANNEL_ID)
        
        await message.answer(
            f"📊 Канал: {chat.title}\n"
            f"Username: @{chat.username}\n\n"
            "Для перегляду Stories використовуйте офіційний клієнт Telegram."
        )
        
    except Exception as e:
        await message.answer(f"❌ Помилка: {str(e)}")


@router.message(Command("start"))
async def start_command(message: Message):
    """
    Стартова команда
    """
    await message.answer(
        "👋 Бот для публікації Stories!\n\n"
        "Доступні команди:\n"
        "/post_story - Надіслати фото/відео для Stories\n"
        "/post_story_url [URL] - Stories з URL\n"
        "/post_story_file - Stories з локального файлу\n"
        "/check_stories - Перевірити Stories каналу\n\n"
        "Просто надішліть фото або відео, і воно буде опубліковано в Stories!"
    )


@router.message(Command("help"))
async def help_command(message: Message):
    """
    Допомога
    """
    await message.answer(
        "📖 Інструкція по налаштуванню:\n\n"
        "1️⃣ Додайте бота в канал як адміністратора\n"
        "2️⃣ Надайте боту право 'Post Stories'\n"
        "3️⃣ Вкажіть ID каналу в коді (CHANNEL_ID)\n"
        "4️⃣ Переконайтеся що використовуєте Bot API 7.0+\n\n"
        "💡 Підказка: ID каналу можна отримати через @userinfobot"
    )


async def main():
    """
    Головна функція
    """
    # Реєструємо router
    dp.include_router(router)
    
    # Видаляємо webhook (для long polling)
    await bot.delete_webhook(drop_pending_updates=True)
    
    logger.info("🚀 Бот запущено!")
    
    # Запускаємо polling
    await dp.start_polling(bot)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("⛔ Бот зупинено")


# ============================================
# ДОДАТКОВІ ПРИКЛАДИ ІНТЕГРАЦІЇ З ТАРИФАМИ
# ============================================

class TariffManager:
    """
    Приклад менеджера тарифів для Stories
    """
    
    TARIFFS = {
        "basic": {
            "stories_per_day": 0,
            "has_stories": False
        },
        "standard": {
            "stories_per_day": 5,
            "has_stories": True
        },
        "premium": {
            "stories_per_day": 20,
            "has_stories": True
        }
    }
    
    def __init__(self):
        # В реальному проєкті - база даних
        self.user_tariffs = {}
        self.stories_count = {}
    
    def can_post_story(self, user_id: int) -> tuple[bool, str]:
        """
        Перевіряє чи може користувач публікувати Stories
        """
        tariff_name = self.user_tariffs.get(user_id, "basic")
        tariff = self.TARIFFS[tariff_name]
        
        if not tariff["has_stories"]:
            return False, "❌ Stories недоступні на вашому тарифі"
        
        today_count = self.stories_count.get(user_id, 0)
        limit = tariff["stories_per_day"]
        
        if today_count >= limit:
            return False, f"❌ Ліміт Stories вичерпано ({limit}/день)"
        
        return True, "✅ Можна публікувати"
    
    def increment_story_count(self, user_id: int):
        """
        Збільшує лічильник Stories
        """
        self.stories_count[user_id] = self.stories_count.get(user_id, 0) + 1


# Використання в хендлері
tariff_manager = TariffManager()

@router.message(F.photo)
async def handle_photo_with_tariff_check(message: Message):
    """
    Публікація Stories з перевіркою тарифу
    """
    user_id = message.from_user.id
    
    # Перевіряємо тариф
    can_post, msg = tariff_manager.can_post_story(user_id)
    
    if not can_post:
        await message.answer(msg)
        return
    
    try:
        photo = message.photo[-1]
        
        story = await bot.send_story(
            chat_id=CHANNEL_ID,
            media=photo.file_id
        )
        
        # Збільшуємо лічильник
        tariff_manager.increment_story_count(user_id)
        
        await message.answer(
            f"✅ Stories опубліковано!\n"
            f"Story ID: {story.story.id}\n\n"
            f"Залишилось Stories сьогодні: {tariff_manager.TARIFFS[tariff_manager.user_tariffs.get(user_id, 'basic')]['stories_per_day'] - tariff_manager.stories_count[user_id]}"
        )
        
    except Exception as e:
        await message.answer(f"❌ Помилка: {str(e)}")