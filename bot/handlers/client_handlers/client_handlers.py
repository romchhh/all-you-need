import os
from datetime import datetime
from aiogram import Router, types, F
from aiogram.fsm.context import FSMContext
from dotenv import load_dotenv

from main import bot
from config import bot_username
from database_functions.client_db import check_user, add_user, cursor, conn
from database_functions.create_dbs import create_dbs
from database_functions.links_db import increment_link_count
from database_functions.prisma_db import PrismaDB
from database_functions.telegram_listing_db import get_user_telegram_listings, get_telegram_listing_by_id
from utils.download_avatar import download_user_avatar
from utils.translations import t, get_user_lang
from keyboards.client_keyboards import get_catalog_webapp_keyboard, get_language_selection_keyboard, get_support_keyboard, get_main_menu_keyboard, get_referral_keyboard
from database_functions.referral_db import get_referral_stats, create_referral_table
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo
from utils.monopay_functions import check_pending_payments
from utils.cron_functions import run_scheduled_tasks
from main import scheduler

load_dotenv()


async def scheduler_jobs():
    # Перевіряємо чи job вже існує
    job_id = 'check_pending_payments'
    existing_job = scheduler.get_job(job_id)
    
    if existing_job:
        # Якщо job вже існує, видаляємо його
        scheduler.remove_job(job_id)
        print(f"🔄 Видалено існуючий job '{job_id}'")
    
    # Додаємо новий job з унікальним ID
    try:
        scheduler.add_job(
            check_pending_payments,
            'interval',
            seconds=10,
            id=job_id,
            replace_existing=True,
            max_instances=1
        )
        print(f"✅ Scheduler job '{job_id}' додано (перевірка кожні 10 секунд)")
        
        # Перевіряємо чи job дійсно додано
        added_job = scheduler.get_job(job_id)
        if added_job:
            print(f"✅ Job '{job_id}' успішно зареєстровано в scheduler")
            print(f"   Наступний запуск: {added_job.next_run_time}")
        else:
            print(f"❌ Помилка: Job '{job_id}' не знайдено після додавання!")
    except Exception as e:
        print(f"❌ Помилка додавання job '{job_id}': {e}")
        import traceback
        traceback.print_exc()
    
    # Job для деактивації старих оголошень (канал + маркетплейс) та повідомлень користувачам
    try:
        deactivate_job_id = 'deactivate_old_listings_and_notify'
        existing_deactivate_job = scheduler.get_job(deactivate_job_id)
        
        if existing_deactivate_job:
            scheduler.remove_job(deactivate_job_id)
        
        scheduler.add_job(
            run_scheduled_tasks,
            'cron',
            hour=14,
            minute=51,
            id=deactivate_job_id,
            replace_existing=True
        )
        print(f"✅ Scheduler job '{deactivate_job_id}' додано (деактивація канал + маркетплейс, повідомлення в бот)")
    except Exception as e:
        print(f"❌ Помилка додавання job '{deactivate_job_id}': {e}")
        import traceback
        traceback.print_exc()

router = Router()

  
    
@router.message(F.text.in_([
    "💬 Підтримка",  # UK
    "💬 Поддержка"   # RU
]))
async def support_handler(message: types.Message):
    user_id = message.from_user.id
    
    support_text = (
        t(user_id, 'support.title') +
        t(user_id, 'support.description')
    )
    
    await message.answer(
        support_text,
        reply_markup=get_support_keyboard(user_id),
        parse_mode="HTML"
    )


@router.message(F.text.in_([
    "Скасувати",      # UK
    "Отменить",       # RU
    "❌ Скасувати",   # UK з емодзі
    "❌ Отменить"     # RU з емодзі
]))
async def cancel_handler(message: types.Message, state: FSMContext):
    """Обробник для кнопки 'Скасувати' - очищає стан та повертає в головне меню"""
    user_id = message.from_user.id
    
    # Очищаємо стан FSM
    await state.clear()
    
    await message.answer(
        f"<b>{t(user_id, 'menu.main_menu')}</b>",
        reply_markup=get_main_menu_keyboard(user_id),
        parse_mode="HTML"
    )


@router.message(F.text.in_([
    "🎁 Реферальна програма",  # UK
    "🎁 Реферальная программа"  # RU
]))
async def referral_handler(message: types.Message):
    """Обробник для кнопки 'Реферальна програма'"""
    user_id = message.from_user.id
    create_referral_table()
    
    # Отримуємо статистику
    stats = get_referral_stats(user_id)
    
    # Формуємо текст
    referral_text = (
        t(user_id, 'referral.title') +
        t(user_id, 'referral.description') +
        t(user_id, 'referral.stats_title') +
        t(user_id, 'referral.total_referrals', count=stats['total_referrals']) + "\n" +
        t(user_id, 'referral.paid_referrals', count=stats['paid_referrals']) + "\n" +
        t(user_id, 'referral.total_reward', amount=stats['total_reward'])
    )
    
    # Отримуємо username бота
    username = bot_username or (await bot.get_me()).username
    
    await message.answer(
        referral_text,
        reply_markup=get_referral_keyboard(user_id, username),
        parse_mode="HTML"
    )


@router.callback_query(F.data == "back_to_main")
async def back_to_main_handler(callback: types.CallbackQuery):
    """Повернення до головного меню"""
    user_id = callback.from_user.id
    
    await callback.message.delete()
    await callback.message.answer(
        f"<b>{t(user_id, 'menu.main_menu')}</b>",
        reply_markup=get_main_menu_keyboard(user_id),
        parse_mode="HTML"
    )
    await callback.answer()


async def on_startup(router):
    create_dbs()
    await scheduler_jobs()
    username = bot_username or (await bot.get_me()).username
    print(f'Bot: @{username} запущений!')

async def on_shutdown(router):
    username = bot_username or (await bot.get_me()).username
    print(f'Bot: @{username} зупинений!')
