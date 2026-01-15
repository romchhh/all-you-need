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
    def __init__(self, bot: Bot):
        self.bot = bot
        self.group_id = MODERATION_GROUP_ID
    
    async def send_listing_to_moderation(
        self,
        listing_id: int,
        source: str = 'marketplace',  # 'marketplace' або 'telegram'
        listing_data: Optional[Dict[str, Any]] = None
    ) -> Optional[int]:
        if not self.group_id:
            print("MODERATION_GROUP_ID не встановлено")
            return None
        
        try:
            if not listing_data:
                if source == 'telegram':
                    listing_data = get_telegram_listing_by_id(listing_id)
                else:
                    listing_data = self._get_marketplace_listing(listing_id)
            
            if not listing_data:
                print(f"Оголошення {listing_id} не знайдено")
                return None
            
            text = self._format_listing_text(listing_data, source, listing_id)
            
            images = self._get_listing_images(listing_data)
            
            keyboard = self._create_moderation_keyboard(listing_id, source)
            
            if images:
                is_url = source == 'marketplace' and (images[0].startswith('http') or images[0].startswith('/'))
                
                if len(images) == 1:
                    if is_url:
                        message = await self.bot.send_photo(
                            chat_id=self.group_id,
                            photo=images[0],
                            caption=text,
                            parse_mode="HTML",
                            reply_markup=keyboard
                        )
                    else:
                        message = await self.bot.send_photo(
                            chat_id=self.group_id,
                            photo=images[0],
                            caption=text,
                            parse_mode="HTML",
                            reply_markup=keyboard
                        )
                    return message.message_id
                else:
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
        source_emoji = "🌐" if source == 'marketplace' else "📱"
        source_text = "Маркетплейс" if source == 'marketplace' else "Telegram бот"
        
        username = listing.get('username') or ''
        first_name = listing.get('firstName') or ''
        last_name = listing.get('lastName') or ''
        seller_name = f"{first_name} {last_name}".strip() or username or "Невідомий"
        
        if username:
            seller_info = f"@{username} ({seller_name})"
        else:
            seller_info = seller_name
        
        price = listing.get('price', '0')
        currency = listing.get('currency', 'EUR')
        price_text = f"{price} {currency}"
        
        category = listing.get('category', 'Не вказано')
        subcategory = listing.get('subcategory')
        category_text = category
        if subcategory:
            category_text += f" / {subcategory}"
        
        condition = listing.get('condition')
        condition_text = ""
        if condition:
            condition_map = {
                'new': '🆕 Новий',
                'used': '🔧 Б/У'
            }
            condition_text = f"\n🔄 <b>Стан:</b> {condition_map.get(condition, condition)}"
        
        location = listing.get('location', 'Не вказано')
        
        tariff_info = ""
        if source == 'telegram':
            publication_tariff = listing.get('publicationTariff')
            payment_status = listing.get('paymentStatus', 'pending')
            
            if publication_tariff:
                tariff_names = {
                    'standard': '📌 Звичайна публікація — 3€',
                    'highlighted': '⭐ Виділене оголошення — 4,5€',
                    'pinned': '📌 Закріп у каналі — 5,5€ / 12 годин',
                    'story': '📸 Сторіс у каналі — 5€ / 24 години',
                    'refresh': '🔄 Оновити оголошення — 1,5€'
                }
                tariff_name = tariff_names.get(publication_tariff, publication_tariff)
                
                payment_emoji = "✅" if payment_status == 'paid' else "⏳"
                payment_text = "Оплачено" if payment_status == 'paid' else "Очікує оплати"
                
                tariff_info = f"\n\n💳 <b>Тариф:</b> {tariff_name}\n{payment_emoji} <b>Статус оплати:</b> {payment_text}"
        
        text = f"""{source_emoji} <b>Оголошення на модерацію</b> #{listing_id}

<b>Назва:</b> {listing.get('title', 'Без назви')}

📄 <b>Опис:</b>
{listing.get('description', 'Без опису')}

💰 <b>Ціна:</b> {price_text}
📂 <b>Категорія:</b> {category_text}
📍 <b>Місто:</b> {location}{condition_text}{tariff_info}

👤 <b>Продавець:</b> {seller_info}
📅 <b>Створено:</b> {self._format_date(listing.get('createdAt'))}

<i>Джерело: {source_text}</i>"""
        
        return text
    
    def _get_listing_images(self, listing: Dict[str, Any]) -> List[str]:
        images = listing.get('images', [])
        
        if isinstance(images, str):
            try:
                images = json.loads(images)
            except:
                images = []
        
        if not isinstance(images, list):
            images = []
        
        return images[:10]
    
    def _create_moderation_keyboard(self, listing_id: int, source: str) -> InlineKeyboardMarkup:
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
        try:
            if source == 'telegram':
                admin_id = None
                if admin_telegram_id:
                    admin_id = self._get_admin_id_by_telegram_id(admin_telegram_id)
                
                success = update_telegram_listing_moderation_status(
                    listing_id=listing_id,
                    status='approved',
                    admin_id=admin_id
                )
                
                if success:
                    listing = get_telegram_listing_by_id(listing_id)
                    payment_status = listing.get('paymentStatus', 'pending') if listing else 'pending'
                    
                    if payment_status != 'paid':
                        print(f"Listing {listing_id} не оплачене. Публікація неможлива.")
                        return False
                    
                    channel_message_id = await self._publish_to_channel(listing_id)
                    
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
        if result.get('images'):
            try:
                result['images'] = json.loads(result['images'])
            except:
                result['images'] = []
        else:
            result['images'] = []
        
        return result
    
    async def _publish_to_channel(self, listing_id: int) -> Optional[int]:
        try:
            channel_id = os.getenv('TRADE_CHANNEL_ID')
            if not channel_id:
                print(f"TRADE_CHANNEL_ID not set, skipping channel publication")
                return None
            
            channel_id = int(channel_id)
            
            listing = get_telegram_listing_by_id(listing_id)
            if not listing:
                print(f"Listing {listing_id} not found for channel publication")
                return None
            
            title = listing.get('title', '')
            description = listing.get('description', '')
            price = listing.get('price', 0)
            currency = listing.get('currency', 'EUR')
            category = listing.get('category', '')
            subcategory = listing.get('subcategory')
            condition = listing.get('condition', '')
            location = listing.get('location', '')
            
            category_text = category
            if subcategory:
                category_text += f" / {subcategory}"
            
            condition_map = {
                'new': '🆕 Новий',
                'used': '🔧 Б/У'
            }
            condition_text = condition_map.get(condition, condition)
            
            tariff = listing.get('publicationTariff', 'standard')
            title_prefix = ''
            title_style = title
            
            if tariff == 'highlighted':
                title_prefix = '⭐ '
                title_style = f"<b>{title}</b>"
            elif tariff == 'pinned':
                title_prefix = ''
                title_style = f"<b>{title}</b>"
            elif tariff == 'story':
                title_prefix = '📸 '
                title_style = f"<b>{title}</b>"
            else:
                title_prefix = ''
                title_style = title
            
            # Отримуємо інформацію про продавця
            seller_first_name = listing.get('firstName', '')
            seller_last_name = listing.get('lastName', '')
            seller_username = listing.get('username', '')
            seller_telegram_id = listing.get('sellerTelegramId') or listing.get('telegramId')
            
            # Формуємо ім'я продавця
            seller_name_parts = []
            if seller_last_name:
                seller_name_parts.append(seller_last_name)
            if seller_first_name:
                seller_name_parts.append(seller_first_name)
            seller_full_name = ' '.join(seller_name_parts).strip() if seller_name_parts else 'Продавець'
            
            # Формуємо посилання на продавця
            if seller_username:
                seller_link = f"@{seller_username}"
                seller_text = f"👤 <b>Продавець:</b> <a href=\"https://t.me/{seller_username}\">{seller_full_name}</a>"
            elif seller_telegram_id:
                seller_link = f"tg://user?id={seller_telegram_id}"
                seller_text = f"👤 <b>Продавець:</b> <a href=\"{seller_link}\">{seller_full_name}</a>"
            else:
                seller_text = f"👤 <b>Продавець:</b> {seller_full_name}"
            
            text = f"""{title_prefix}{title_style}

📄 {description}

💰 <b>Ціна:</b> {price} {currency}
📂 <b>Категорія:</b> {category_text}
🔄 <b>Стан:</b> {condition_text}
📍 <b>Місто:</b> {location}
{seller_text}

#Оголошення #{category.replace(' ', '')}"""
            
            images = listing.get('images', [])
            if isinstance(images, str):
                try:
                    images = json.loads(images)
                except:
                    images = []
            
            if images and len(images) > 0:
                if len(images) == 1:
                    message = await self.bot.send_photo(
                        chat_id=channel_id,
                        photo=images[0],
                        caption=text,
                        parse_mode="HTML"
                    )
                    message_id = message.message_id
                    
                    if tariff == 'pinned' and message_id:
                        try:
                            await self.bot.pin_chat_message(
                                chat_id=channel_id,
                                message_id=message_id
                            )
                        except Exception as e:
                            print(f"Error pinning message: {e}")
                    
                    return message_id
                else:
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
                    message_id = messages[0].message_id if messages else None
                    
                    # Зберігаємо всі message_id з медіа-групи як JSON
                    if messages and len(messages) > 1:
                        all_message_ids = [msg.message_id for msg in messages]
                        # Зберігаємо JSON з усіма message_id в channelMessageId (як рядок)
                        import json
                        conn = get_db_connection()
                        cursor = conn.cursor()
                        cursor.execute("PRAGMA table_info(TelegramListing)")
                        columns = [row[1] for row in cursor.fetchall()]
                        has_channel_message_id = 'channelMessageId' in columns
                        
                        if has_channel_message_id:
                            cursor.execute("""
                                UPDATE TelegramListing
                                SET channelMessageId = ?
                                WHERE id = ?
                            """, (json.dumps(all_message_ids), listing_id))
                            conn.commit()
                        conn.close()
                    
                    if tariff == 'pinned' and message_id:
                        try:
                            await self.bot.pin_chat_message(
                                chat_id=channel_id,
                                message_id=message_id
                            )
                        except Exception as e:
                            print(f"Error pinning message: {e}")
                    
                    return message_id
            else:
                message = await self.bot.send_message(
                    chat_id=channel_id,
                    text=text,
                    parse_mode="HTML"
                )
                message_id = message.message_id
                
                if tariff == 'pinned' and message_id:
                    try:
                        await self.bot.pin_chat_message(
                            chat_id=channel_id,
                            message_id=message_id
                        )
                    except Exception as e:
                        print(f"Error pinning message: {e}")
                
                return message_id
                
        except Exception as e:
            print(f"Error publishing listing {listing_id} to channel: {e}")
            return None
    
    async def delete_from_channel(self, listing_id: int) -> bool:
        try:
            listing = get_telegram_listing_by_id(listing_id)
            if not listing:
                print(f"Оголошення {listing_id} не знайдено")
                return False
            
            channel_message_id = listing.get('channelMessageId') or listing.get('channel_message_id')
            if not channel_message_id or channel_message_id == 'None' or str(channel_message_id).strip() == '':
                print(f"Оголошення {listing_id} не має channelMessageId")
                return False
            
            channel_id = os.getenv('TRADE_CHANNEL_ID')
            if not channel_id:
                print(f"TRADE_CHANNEL_ID not set, skipping channel deletion")
                return False
            
            channel_id = int(channel_id)
            
            # Перевіряємо чи channelMessageId це JSON (масив message_id для медіа-групи)
            import json
            message_ids = []
            try:
                # Спробуємо розпарсити як JSON
                if isinstance(channel_message_id, str) and channel_message_id.startswith('['):
                    message_ids = json.loads(channel_message_id)
                else:
                    # Якщо це не JSON, то це один message_id
                    message_ids = [int(channel_message_id)]
            except:
                # Якщо не вдалося розпарсити, спробуємо як число
                try:
                    message_ids = [int(channel_message_id)]
                except:
                    print(f"Не вдалося розпарсити channelMessageId для оголошення {listing_id}")
                    return False
            
            # Видаляємо всі повідомлення з медіа-групи
            deleted_count = 0
            for msg_id in message_ids:
                try:
                    await self.bot.delete_message(chat_id=channel_id, message_id=int(msg_id))
                    deleted_count += 1
                    print(f"Повідомлення {msg_id} видалено з каналу для оголошення {listing_id}")
                except Exception as e:
                    # Якщо повідомлення вже видалено або не існує, ігноруємо помилку
                    error_msg = str(e).lower()
                    if "message to delete not found" in error_msg or "message not found" in error_msg or "message can't be deleted" in error_msg:
                        print(f"Повідомлення {msg_id} вже видалено або не існує")
                    else:
                        print(f"Помилка при видаленні повідомлення {msg_id} з каналу: {e}")
            
            # Оновлюємо БД - очищаємо channelMessageId
            conn = get_db_connection()
            cursor = conn.cursor()
            
            cursor.execute("PRAGMA table_info(TelegramListing)")
            columns = [row[1] for row in cursor.fetchall()]
            has_channel_message_id = 'channelMessageId' in columns
            
            if has_channel_message_id:
                cursor.execute("""
                    UPDATE TelegramListing
                    SET channelMessageId = NULL,
                        updatedAt = ?
                    WHERE id = ?
                """, (datetime.now(), listing_id))
                conn.commit()
            
            conn.close()
            
            if deleted_count > 0:
                return True
            else:
                # Якщо не вдалося видалити жодне повідомлення, все одно вважаємо успішним
                # (можливо вони вже були видалені)
                return True
        except Exception as e:
            print(f"Помилка видалення з каналу: {e}")
            return False
