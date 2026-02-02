import asyncio
import logging
from aiogram import Bot, Dispatcher
from aiogram.fsm.storage.memory import MemoryStorage
from config import token
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.executors.asyncio import AsyncIOExecutor

logging.basicConfig(level=logging.INFO)


bot = Bot(token=token)
storage = MemoryStorage()
dp = Dispatcher(bot=bot, storage=storage)


executors = {
    'default': AsyncIOExecutor(),
}

job_defaults = {
    'coalesce': False,
    'max_instances': 3,
    'misfire_grace_time': 30
}

scheduler = AsyncIOScheduler(
    executors=executors,
    job_defaults=job_defaults,
    timezone='Europe/Kiev'
)
scheduler.start()

async def main():
    from handlers.client_handlers.agreement_handlers import router as agreement_router
    from handlers.client_handlers.client_handlers import router as client_router, on_startup, on_shutdown
    from handlers.client_handlers.about_us_handlers import router as about_us_router
    from handlers.client_handlers.create_listing_handlers import router as create_listing_router
    from handlers.admin_handlers.admin_handlers import router as admin_router
    from handlers.admin_handlers.mailing_handlers import router as mailing_router
    from handlers.admin_handlers.links_handlers import router as links_router
    from handlers.admin_handlers.admin_management_handlers import router as admin_management_router
    from handlers.admin_handlers.moderation_group_handlers import router as moderation_group_router
    from database_functions.migrations import ensure_categories_exist
    
    # Виконуємо міграцію категорій при запуску
    try:
        ensure_categories_exist()
    except Exception as e:
        logging.warning(f"Categories migration warning: {e}")
    
    dp.include_router(agreement_router)
    dp.include_router(client_router)
    dp.include_router(about_us_router)
    dp.include_router(create_listing_router)
    dp.include_router(admin_router)
    dp.include_router(mailing_router)
    dp.include_router(links_router)
    dp.include_router(admin_management_router)
    dp.include_router(moderation_group_router)
    
    dp.startup.register(on_startup)
    dp.shutdown.register(on_shutdown)
    
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