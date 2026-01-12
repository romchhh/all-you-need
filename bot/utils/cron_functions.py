import sqlite3
import asyncio
from datetime import datetime, timedelta
from typing import List, Dict
from database_functions.db_config import DATABASE_PATH
from utils.translations import t, get_user_lang
from aiogram import Bot
from config import token


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




async def run_scheduled_tasks():
    bot = Bot(token=token)
    
    try:
        await deactivate_old_listings(bot)
        
    finally:
        await bot.session.close()

