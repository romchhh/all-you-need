import os
import json
from typing import Optional, Dict, Any, List
from datetime import datetime
from aiogram import Bot
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, InputMediaPhoto
from dotenv import load_dotenv

import sqlite3
from pathlib import Path

from database_functions.telegram_listing_db import (
    get_telegram_listing_by_id,
    update_telegram_listing_moderation_status,
    get_connection as get_db_connection
)

load_dotenv()

MODERATION_GROUP_ID = os.getenv('MODERATION_GROUP_ID')
if MODERATION_GROUP_ID:
    MODERATION_GROUP_ID = int(MODERATION_GROUP_ID)


class ModerationManager:
    """Клас для управління модерацією оголошень через Telegram групу"""
    
    def __init__(self, bot: Bot):
        self.bot = bot
        self.group_id = MODERATION_GROUP_ID
    
    async def send_listing_to_moderation(
        self,
        listing_id: int,
        source: str = 'marketplace',  # 'marketplace' або 'telegram'
        listing_data: Optional[Dict[str, Any]] = None
    ) -> Optional[int]:
        """
        Надсилає оголошення в групу модерації
        
        Args:
            listing_id: ID оголошення
            source: Джерело оголошення ('marketplace' або 'telegram')
            listing_data: Дані оголошення (якщо не передано, отримаємо з БД)
        
        Returns:
            message_id: ID повідомлення в групі або None якщо помилка
        """
        if not self.group_id:
            print("MODERATION_GROUP_ID не встановлено")
            return None
        
        try:
            # Отримуємо дані оголошення
            if not listing_data:
                if source == 'telegram':
                    listing_data = get_telegram_listing_by_id(listing_id)
                else:
                    listing_data = self._get_marketplace_listing(listing_id)
            
            if not listing_data:
                print(f"Оголошення {listing_id} не знайдено")
                return None
            
            # Формуємо текст оголошення
            text = self._format_listing_text(listing_data, source, listing_id)
            
            # Отримуємо медіа
            images = self._get_listing_images(listing_data)
            
            # Створюємо клавіатуру
            keyboard = self._create_moderation_keyboard(listing_id, source)
            
            # Надсилаємо оголошення
            if images:
                # Перевіряємо чи це URL (маркетплейс) чи file_id (Telegram)
                is_url = source == 'marketplace' and (images[0].startswith('http') or images[0].startswith('/'))
                
                if len(images) == 1:
                    # Одне фото з описом
                    if is_url:
                        # Для маркетплейсу - використовуємо URL
                        message = await self.bot.send_photo(
                            chat_id=self.group_id,
                            photo=images[0],
                            caption=text,
                            parse_mode="HTML",
                            reply_markup=keyboard
                        )
                    else:
                        # Для Telegram - використовуємо file_id
                        message = await self.bot.send_photo(
                            chat_id=self.group_id,
                            photo=images[0],
                            caption=text,
                            parse_mode="HTML",
                            reply_markup=keyboard
                        )
                    return message.message_id
                else:
                    # Кілька фото - перше з описом, інші без
                    media_group = []
                    for i, image in enumerate(images):
                        if i == 0:
                            media_group.append(
                                InputMediaPhoto(
                                    media=image,
                                    caption=text,
                                    parse_mode="HTML"
                                )
                            )
                        else:
                            media_group.append(InputMediaPhoto(media=image))
                    
                    messages = await self.bot.send_media_group(
                        chat_id=self.group_id,
                        media=media_group
                    )
                    
                    # Надсилаємо кнопки окремим повідомленням
                    if messages:
                        buttons_message = await self.bot.send_message(
                            chat_id=self.group_id,
                            text=f"🔔 <b>Оголошення #{listing_id}</b>\n\nОберіть дію:",
                            parse_mode="HTML",
                            reply_markup=keyboard
                        )
                        return buttons_message.message_id
                    return None
            else:
                # Тільки текст
                message = await self.bot.send_message(
                    chat_id=self.group_id,
                    text=text,
                    parse_mode="HTML",
                    reply_markup=keyboard
                )
                return message.message_id
                
        except Exception as e:
            print(f"Помилка надсилання оголошення в групу модерації: {e}")
            return None
    
    def _format_listing_text(self, listing: Dict[str, Any], source: str, listing_id: int) -> str:
        """Формує текст оголошення для модерації"""
        source_emoji = "🌐" if source == 'marketplace' else "📱"
        source_text = "Маркетплейс" if source == 'marketplace' else "Telegram бот"
        
        # Інформація про користувача
        username = listing.get('username') or ''
        first_name = listing.get('firstName') or ''
        last_name = listing.get('lastName') or ''
        seller_name = f"{first_name} {last_name}".strip() or username or "Невідомий"
        
        if username:
            seller_info = f"@{username} ({seller_name})"
        else:
            seller_info = seller_name
        
        # Ціна
        price = listing.get('price', '0')
        currency = listing.get('currency', 'EUR')
        price_text = f"{price} {currency}"
        
        # Категорія
        category = listing.get('category', 'Не вказано')
        subcategory = listing.get('subcategory')
        category_text = category
        if subcategory:
            category_text += f" / {subcategory}"
        
        # Стан (для Telegram оголошень)
        condition = listing.get('condition')
        condition_text = ""
        if condition:
            condition_map = {
                'new': '🆕 Новий',
                'used': '🔧 Б/У'
            }
            condition_text = f"\n🔄 <b>Стан:</b> {condition_map.get(condition, condition)}"
        
        # Локація
        location = listing.get('location', 'Не вказано')
        
        text = f"""{source_emoji} <b>Оголошення на модерацію</b> #{listing_id}

📌 <b>Назва:</b> {listing.get('title', 'Без назви')}

📄 <b>Опис:</b>
{listing.get('description', 'Без опису')}

💰 <b>Ціна:</b> {price_text}
📂 <b>Категорія:</b> {category_text}
📍 <b>Місто:</b> {location}{condition_text}

👤 <b>Продавець:</b> {seller_info}
📅 <b>Створено:</b> {self._format_date(listing.get('createdAt'))}

<i>Джерело: {source_text}</i>"""
        
        return text
    
    def _get_listing_images(self, listing: Dict[str, Any]) -> List[str]:
        """Отримує список фото з оголошення"""
        images = listing.get('images', [])
        
        if isinstance(images, str):
            try:
                images = json.loads(images)
            except:
                images = []
        
        if not isinstance(images, list):
            images = []
        
        # Для Telegram оголошень - це file_id
        # Для маркетплейсу - це URL
        return images[:10]  # Максимум 10 фото
    
    def _create_moderation_keyboard(self, listing_id: int, source: str) -> InlineKeyboardMarkup:
        """Створює клавіатуру для модерації"""
        return InlineKeyboardMarkup(inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="✅ Схвалити",
                    callback_data=f"mod_approve_{source}_{listing_id}"
                ),
                InlineKeyboardButton(
                    text="❌ Відхилити",
                    callback_data=f"mod_reject_{source}_{listing_id}"
                )
            ]
        ])
    
    def _format_date(self, date_str: Optional[str]) -> str:
        """Формує дату для відображення"""
        if not date_str:
            return "Не вказано"
        
        try:
            if isinstance(date_str, str):
                dt = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
            else:
                dt = date_str
            
            return dt.strftime("%d.%m.%Y %H:%M")
        except:
            return str(date_str)
    
    async def approve_listing(
        self,
        listing_id: int,
        source: str,
        admin_telegram_id: Optional[int] = None
    ) -> bool:
        """
        Схвалює оголошення
        
        Args:
            listing_id: ID оголошення
            source: Джерело ('marketplace' або 'telegram')
            admin_telegram_id: ID адміна який схвалив
        
        Returns:
            bool: True якщо успішно
        """
        try:
            if source == 'telegram':
                # Отримуємо admin_id з telegram_id
                admin_id = None
                if admin_telegram_id:
                    admin_id = self._get_admin_id_by_telegram_id(admin_telegram_id)
                
                success = update_telegram_listing_moderation_status(
                    listing_id=listing_id,
                    status='approved',
                    admin_id=admin_id
                )
                
                if success:
                    # Публікуємо в канал
                    channel_message_id = await self._publish_to_channel(listing_id)
                    
                    # Оновлюємо статус на 'approved' та зберігаємо channel_message_id
                    conn = get_db_connection()
                    cursor = conn.cursor()
                    
                    # Перевіряємо чи є колонка channelMessageId
                    cursor.execute("PRAGMA table_info(TelegramListing)")
                    columns = [row[1] for row in cursor.fetchall()]
                    has_channel_message_id = 'channelMessageId' in columns
                    
                    if not has_channel_message_id:
                        cursor.execute("ALTER TABLE TelegramListing ADD COLUMN channelMessageId INTEGER")
                    
                    if channel_message_id:
                        cursor.execute("""
                            UPDATE TelegramListing
                            SET status = 'approved',
                                publishedAt = ?,
                                updatedAt = ?,
                                channelMessageId = ?
                            WHERE id = ?
                        """, (datetime.now(), datetime.now(), channel_message_id, listing_id))
                    else:
                        cursor.execute("""
                            UPDATE TelegramListing
                            SET status = 'approved',
                                publishedAt = ?,
                                updatedAt = ?
                            WHERE id = ?
                        """, (datetime.now(), datetime.now(), listing_id))
                    
                    conn.commit()
                    conn.close()
                
                return success
            else:
                # Для маркетплейсу - оновлюємо через API або напряму в БД
                conn = get_db_connection()
                cursor = conn.cursor()
                
                admin_id = None
                if admin_telegram_id:
                    admin_id = self._get_admin_id_by_telegram_id(admin_telegram_id)
                
                cursor.execute("""
                    UPDATE Listing
                    SET moderationStatus = 'approved',
                        status = 'active',
                        publishedAt = ?,
                        moderatedAt = ?,
                        moderatedBy = ?,
                        updatedAt = ?
                    WHERE id = ?
                """, (datetime.now(), datetime.now(), admin_id, datetime.now(), listing_id))
                
                success = cursor.rowcount > 0
                conn.commit()
                conn.close()
                return success
                
        except Exception as e:
            print(f"Помилка схвалення оголошення: {e}")
            return False
    
    async def reject_listing(
        self,
        listing_id: int,
        source: str,
        reason: str,
        admin_telegram_id: Optional[int] = None
    ) -> bool:
        """
        Відхиляє оголошення
        
        Args:
            listing_id: ID оголошення
            source: Джерело ('marketplace' або 'telegram')
            reason: Причина відхилення
            admin_telegram_id: ID адміна який відхилив
        
        Returns:
            bool: True якщо успішно
        """
        try:
            if source == 'telegram':
                admin_id = None
                if admin_telegram_id:
                    admin_id = self._get_admin_id_by_telegram_id(admin_telegram_id)
                
                success = update_telegram_listing_moderation_status(
                    listing_id=listing_id,
                    status='rejected',
                    admin_id=admin_id,
                    rejection_reason=reason
                )
                
                if success:
                    # Оновлюємо статус на 'rejected'
                    conn = get_db_connection()
                    cursor = conn.cursor()
                    cursor.execute("""
                        UPDATE TelegramListing
                        SET status = 'rejected',
                            updatedAt = ?
                        WHERE id = ?
                    """, (datetime.now(), listing_id))
                    conn.commit()
                    conn.close()
                
                return success
            else:
                # Для маркетплейсу - оновлюємо через БД
                conn = get_db_connection()
                cursor = conn.cursor()
                
                admin_id = None
                if admin_telegram_id:
                    admin_id = self._get_admin_id_by_telegram_id(admin_telegram_id)
                
                cursor.execute("""
                    UPDATE Listing
                    SET moderationStatus = 'rejected',
                        rejectionReason = ?,
                        moderatedAt = ?,
                        moderatedBy = ?,
                        updatedAt = ?
                    WHERE id = ?
                """, (reason, datetime.now(), admin_id, datetime.now(), listing_id))
                
                success = cursor.rowcount > 0
                conn.commit()
                conn.close()
                return success
                
        except Exception as e:
            print(f"Помилка відхилення оголошення: {e}")
            return False
    
    def _get_admin_id_by_telegram_id(self, telegram_id: int) -> Optional[int]:
        """Отримує admin_id по telegram_id"""
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT a.id FROM Admin a
            JOIN User u ON a.userId = u.id
            WHERE CAST(u.telegramId AS INTEGER) = ?
        """, (telegram_id,))
        
        result = cursor.fetchone()
        conn.close()
        
        return result[0] if result else None
    
    def _get_marketplace_listing(self, listing_id: int) -> Optional[Dict[str, Any]]:
        """Отримує оголошення з маркетплейсу"""
        conn = get_db_connection()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT l.*, u.username, u.firstName, u.lastName, CAST(u.telegramId AS INTEGER) as sellerTelegramId
            FROM Listing l
            JOIN User u ON l.userId = u.id
            WHERE l.id = ?
        """, (listing_id,))
        
        row = cursor.fetchone()
        conn.close()
        
        if not row:
            return None
        
        result = dict(row)
        # Парсимо JSON images
        if result.get('images'):
            try:
                result['images'] = json.loads(result['images'])
            except:
                result['images'] = []
        else:
            result['images'] = []
        
        return result
    
    async def _publish_to_channel(self, listing_id: int) -> Optional[int]:
        """Публікує оголошення в Telegram канал"""
        try:
            # Отримуємо ID каналу з env
            channel_id = os.getenv('TRADE_CHANNEL_ID')
            if not channel_id:
                print(f"TRADE_CHANNEL_ID not set, skipping channel publication")
                return None
            
            channel_id = int(channel_id)
            
            # Отримуємо дані оголошення
            listing = get_telegram_listing_by_id(listing_id)
            if not listing:
                print(f"Listing {listing_id} not found for channel publication")
                return None
            
            # Формуємо текст оголошення
            title = listing.get('title', '')
            description = listing.get('description', '')
            price = listing.get('price', 0)
            currency = listing.get('currency', 'EUR')
            category = listing.get('category', '')
            subcategory = listing.get('subcategory')
            condition = listing.get('condition', '')
            location = listing.get('location', '')
            
            # Формуємо текст
            category_text = category
            if subcategory:
                category_text += f" / {subcategory}"
            
            condition_map = {
                'new': '🆕 Новий',
                'used': '🔧 Б/У'
            }
            condition_text = condition_map.get(condition, condition)
            
            text = f"""📌 <b>{title}</b>

📄 {description}

💰 <b>Ціна:</b> {price} {currency}
📂 <b>Категорія:</b> {category_text}
🔄 <b>Стан:</b> {condition_text}
📍 <b>Місто:</b> {location}

#Оголошення #{category.replace(' ', '')}"""
            
            # Отримуємо зображення
            images = listing.get('images', [])
            if isinstance(images, str):
                try:
                    images = json.loads(images)
                except:
                    images = []
            
            # Публікуємо в канал
            if images and len(images) > 0:
                if len(images) == 1:
                    # Одне фото
                    message = await self.bot.send_photo(
                        chat_id=channel_id,
                        photo=images[0],
                        caption=text,
                        parse_mode="HTML"
                    )
                    return message.message_id
                else:
                    # Кілька фото - медіа група
                    media = []
                    for i, img in enumerate(images):
                        if i == 0:
                            media.append(InputMediaPhoto(
                                media=img,
                                caption=text,
                                parse_mode="HTML"
                            ))
                        else:
                            media.append(InputMediaPhoto(media=img))
                    
                    messages = await self.bot.send_media_group(
                        chat_id=channel_id,
                        media=media
                    )
                    # Повертаємо ID першого повідомлення
                    return messages[0].message_id if messages else None
            else:
                # Тільки текст
                message = await self.bot.send_message(
                    chat_id=channel_id,
                    text=text,
                    parse_mode="HTML"
                )
                return message.message_id
                
        except Exception as e:
            print(f"Error publishing listing {listing_id} to channel: {e}")
            return None
