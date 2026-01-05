"""
Функції для автоматичного оновлення статусу оголошень та нагадувань
"""
import sqlite3
import asyncio
from datetime import datetime, timedelta
from typing import List, Dict
from database_functions.db_config import DATABASE_PATH
from utils.translations import t, get_user_lang
from aiogram import Bot
from config import token


async def deactivate_old_listings(bot: Bot = None):
    """
    Автоматично деактивує оголошення, які старіші за 30 днів
    """
    conn = sqlite3.connect(DATABASE_PATH, check_same_thread=False)
    cursor = conn.cursor()
    
    try:
        # Обчислюємо дату 30 днів тому
        thirty_days_ago = datetime.now() - timedelta(days=30)
        thirty_days_ago_str = thirty_days_ago.strftime('%Y-%m-%d %H:%M:%S')
        
        # Знаходимо всі активні оголошення, які старіші за 30 днів
        # Використовуємо publishedAt якщо є, інакше createdAt
        cursor.execute('''
            SELECT l.id, l.userId, l.title, l.createdAt, l.publishedAt, u.telegramId
            FROM Listing l
            JOIN User u ON l.userId = u.id
            WHERE l.status = 'active'
            AND (
                (l.publishedAt IS NOT NULL AND l.publishedAt < ?) OR
                (l.publishedAt IS NULL AND l.createdAt < ?)
            )
        ''', (thirty_days_ago_str, thirty_days_ago_str))
        
        old_listings = cursor.fetchall()
        
        if not old_listings:
            print(f"[{datetime.now()}] No listings to deactivate")
            return
        
        # Оновлюємо статус на 'expired'
        listing_ids = [listing[0] for listing in old_listings]
        placeholders = ','.join(['?'] * len(listing_ids))
        
        cursor.execute(f'''
            UPDATE Listing
            SET status = 'expired', updatedAt = ?
            WHERE id IN ({placeholders})
        ''', [datetime.now().strftime('%Y-%m-%d %H:%M:%S')] + listing_ids)
        
        conn.commit()
        
        print(f"[{datetime.now()}] Deactivated {len(old_listings)} listings")
        
        # Групуємо оголошення по користувачам для нагадувань
        user_listings: Dict[int, List[Dict]] = {}
        for listing in old_listings:
            listing_id, user_id, title, created_at, published_at, telegram_id = listing
            if telegram_id not in user_listings:
                user_listings[telegram_id] = []
            user_listings[telegram_id].append({
                'id': listing_id,
                'title': title
            })
        
        # Відправляємо нагадування користувачам
        if bot:
            await send_expiration_reminders(bot, user_listings)
        
    except Exception as e:
        print(f"[{datetime.now()}] Error in deactivate_old_listings: {e}")
        conn.rollback()
    finally:
        conn.close()


async def send_expiration_reminders(bot: Bot, user_listings: Dict[int, List[Dict]]):
    """
    Відправляє нагадування користувачам про деактивацію їх оголошень
    """
    for telegram_id, listings in user_listings.items():
        try:
            user_id = int(telegram_id)
            
            # Формуємо повідомлення
            if len(listings) == 1:
                message = t(user_id, 'notifications.listing_expired_single', 
                          title=listings[0]['title'])
            else:
                titles = '\n'.join([f"• {listing['title']}" for listing in listings])
                message = t(user_id, 'notifications.listings_expired_multiple', 
                          count=len(listings), titles=titles)
            
            # Відправляємо повідомлення
            await bot.send_message(
                chat_id=user_id,
                text=message,
                parse_mode='HTML'
            )
            
            print(f"[{datetime.now()}] Sent expiration reminder to user {user_id}")
            
            # Невелика затримка між повідомленнями
            await asyncio.sleep(0.5)
            
        except Exception as e:
            print(f"[{datetime.now()}] Error sending reminder to user {telegram_id}: {e}")


async def send_upcoming_expiration_warnings(bot: Bot):
    """
    Відправляє попередження користувачам про те, що їх оголошення скоро стануть неактивними
    (за 3 дні до деактивації)
    """
    conn = sqlite3.connect(DATABASE_PATH, check_same_thread=False)
    cursor = conn.cursor()
    
    try:
        # Обчислюємо дату через 3 дні (27 днів після створення)
        three_days_from_now = datetime.now() + timedelta(days=3)
        thirty_days_ago = datetime.now() - timedelta(days=27)
        three_days_from_now_str = three_days_from_now.strftime('%Y-%m-%d %H:%M:%S')
        thirty_days_ago_str = thirty_days_ago.strftime('%Y-%m-%d %H:%M:%S')
        
        # Знаходимо активні оголошення, які будуть деактивовані через 3 дні
        cursor.execute('''
            SELECT l.id, l.userId, l.title, l.createdAt, l.publishedAt, u.telegramId
            FROM Listing l
            JOIN User u ON l.userId = u.id
            WHERE l.status = 'active'
            AND (
                (l.publishedAt IS NOT NULL AND l.publishedAt >= ? AND l.publishedAt < ?) OR
                (l.publishedAt IS NULL AND l.createdAt >= ? AND l.createdAt < ?)
            )
        ''', (thirty_days_ago_str, three_days_from_now_str, thirty_days_ago_str, three_days_from_now_str))
        
        upcoming_listings = cursor.fetchall()
        
        if not upcoming_listings:
            print(f"[{datetime.now()}] No listings with upcoming expiration")
            return
        
        # Групуємо по користувачам
        user_listings: Dict[int, List[Dict]] = {}
        for listing in upcoming_listings:
            listing_id, user_id, title, created_at, published_at, telegram_id = listing
            if telegram_id not in user_listings:
                user_listings[telegram_id] = []
            user_listings[telegram_id].append({
                'id': listing_id,
                'title': title
            })
        
        # Відправляємо попередження
        for telegram_id, listings in user_listings.items():
            try:
                user_id = int(telegram_id)
                
                if len(listings) == 1:
                    message = t(user_id, 'notifications.listing_expiring_soon_single',
                              title=listings[0]['title'])
                else:
                    titles = '\n'.join([f"• {listing['title']}" for listing in listings])
                    message = t(user_id, 'notifications.listings_expiring_soon_multiple',
                              count=len(listings), titles=titles)
                
                await bot.send_message(
                    chat_id=user_id,
                    text=message,
                    parse_mode='HTML'
                )
                
                print(f"[{datetime.now()}] Sent expiration warning to user {user_id}")
                await asyncio.sleep(0.5)
                
            except Exception as e:
                print(f"[{datetime.now()}] Error sending warning to user {telegram_id}: {e}")
        
    except Exception as e:
        print(f"[{datetime.now()}] Error in send_upcoming_expiration_warnings: {e}")
    finally:
        conn.close()


async def run_scheduled_tasks():
    """
    Запускає всі заплановані задачі
    """
    bot = Bot(token=token)
    
    try:
        # Деактивуємо старі оголошення та відправляємо нагадування
        await deactivate_old_listings(bot)
        
        # Відправляємо попередження про майбутню деактивацію
        await send_upcoming_expiration_warnings(bot)
        
    finally:
        await bot.session.close()

