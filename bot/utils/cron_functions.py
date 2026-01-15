import sqlite3
import asyncio
from datetime import datetime, timedelta
from typing import List, Dict
from database_functions.db_config import DATABASE_PATH
from utils.translations import t, get_user_lang
from aiogram import Bot
from config import token
from database_functions.telegram_listing_db import get_connection, get_telegram_listing_by_id
from utils.moderation_manager import ModerationManager


async def deactivate_old_listings(bot: Bot = None):
    conn = sqlite3.connect(DATABASE_PATH, check_same_thread=False)
    cursor = conn.cursor()
    
    try:
        thirty_days_ago = datetime.now() - timedelta(days=30)
        thirty_days_ago_str = thirty_days_ago.strftime('%Y-%m-%d %H:%M:%S')
        
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
            return

        listing_ids = [listing[0] for listing in old_listings]
        placeholders = ','.join(['?'] * len(listing_ids))
        
        cursor.execute(f'''
            UPDATE Listing
            SET status = 'expired', updatedAt = ?
            WHERE id IN ({placeholders})
        ''', [datetime.now().strftime('%Y-%m-%d %H:%M:%S')] + listing_ids)
        
        conn.commit()
        
    except Exception as e:
        conn.rollback()
    finally:
        conn.close()


async def deactivate_old_telegram_listings(bot: Bot = None):
    if not bot:
        bot = Bot(token=token)
    
    try:
        conn = get_connection()
        cursor = conn.cursor()
        
        thirty_days_ago = datetime.now() - timedelta(days=30)
        thirty_days_ago_str = thirty_days_ago.strftime('%Y-%m-%d %H:%M:%S')
        
        cursor.execute("""
            SELECT id, publishedAt, status, moderationStatus
            FROM TelegramListing
            WHERE publishedAt IS NOT NULL
            AND publishedAt < ?
            AND status IN ('approved', 'published')
            AND (moderationStatus = 'approved' OR moderationStatus IS NULL)
        """, (thirty_days_ago_str,))
        
        old_listings = cursor.fetchall()
        
        if not old_listings:
            conn.close()
            return
        
        moderation_manager = ModerationManager(bot)
        deactivated_count = 0
        
        for listing_row in old_listings:
            listing_id = listing_row[0]
            
            try:
                deleted = await moderation_manager.delete_from_channel(listing_id)
                
                cursor.execute("PRAGMA table_info(TelegramListing)")
                columns = [row[1] for row in cursor.fetchall()]
                has_payment_status = 'paymentStatus' in columns
                
                update_query = """
                    UPDATE TelegramListing
                    SET status = 'expired',
                        moderationStatus = 'expired',
                        updatedAt = ?
                """
                params = [datetime.now()]
                
                if has_payment_status:
                    update_query += ", paymentStatus = 'pending'"
                
                update_query += " WHERE id = ?"
                params.append(listing_id)
                
                cursor.execute(update_query, params)
                deactivated_count += 1
                
                print(f"Оголошення {listing_id} деактивовано через 30 днів")
                
            except Exception as e:
                print(f"Помилка деактивації оголошення {listing_id}: {e}")
                continue
        
        conn.commit()
        conn.close()
        
        print(f"Деактивовано {deactivated_count} оголошень через 30 днів")
        
    except Exception as e:
        print(f"Помилка деактивації старих TelegramListing: {e}")
        import traceback
        traceback.print_exc()
    finally:
        if bot:
            await bot.session.close()


async def run_scheduled_tasks():
    bot = Bot(token=token)
    
    try:
        await deactivate_old_listings(bot)
        await deactivate_old_telegram_listings(bot)
        
    finally:
        await bot.session.close()

