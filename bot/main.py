import asyncio
import logging
from aiogram import Bot, Dispatcher
from aiogram.fsm.storage.memory import MemoryStorage
from config import token


logging.basicConfig(level=logging.INFO)


bot = Bot(token=token)
storage = MemoryStorage()
dp = Dispatcher(bot=bot, storage=storage)


async def scheduled_tasks_worker():
    """
    Фоновий worker для виконання запланованих задач
    Запускає перевірку та деактивацію оголошень кожні 6 годин
    """
    # Запускаємо одразу при старті
    try:
        from utils.cron_functions import run_scheduled_tasks
        await run_scheduled_tasks()
    except Exception as e:
        logging.error(f"Error in initial scheduled tasks: {e}", exc_info=True)
    
    # Потім запускаємо періодично
    while True:
        try:
            await asyncio.sleep(6 * 60 * 60)  # 6 годин
            from utils.cron_functions import run_scheduled_tasks
            await run_scheduled_tasks()
        except Exception as e:
            logging.error(f"Error in scheduled tasks: {e}", exc_info=True)
            await asyncio.sleep(60)  # Чекаємо 1 хвилину перед повторною спробою


async def main():
    from handlers.client_handlers.agreement_handlers import router as agreement_router, on_startup, on_shutdown
    from handlers.client_handlers.menu_handlers import router as menu_router
    from handlers.admin_handlers.admin_handlers import router as admin_router
    from handlers.admin_handlers.mailing_handlers import router as mailing_router
    from handlers.admin_handlers.links_handlers import router as links_router
    from handlers.admin_handlers.admin_management_handlers import router as admin_management_router
    dp.include_router(agreement_router)
    dp.include_router(menu_router)
    dp.include_router(admin_router)
    dp.include_router(mailing_router)
    dp.include_router(links_router)
    dp.include_router(admin_management_router)
    
    dp.startup.register(on_startup)
    dp.shutdown.register(on_shutdown)
    
    # Запускаємо фоновий worker для запланованих задач
    asyncio.create_task(scheduled_tasks_worker())

    while True:
        try:
            await dp.start_polling(bot, skip_updates=True)
        except Exception as e:
            logging.error(f"Bot crashed with error: {e}", exc_info=True)
            await asyncio.sleep(5)

if __name__ == '__main__':
    while True:
        try:
            asyncio.run(main())
        except Exception as e:
            logging.error(f"Critical error: {e}", exc_info=True)
            asyncio.run(asyncio.sleep(5))