import os
import json
from typing import Optional, Dict, Any, List
from datetime import datetime
from aiogram import Bot
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, InputMediaPhoto, InputMediaVideo, FSInputFile
from dotenv import load_dotenv
import aiohttp

import sqlite3
from pathlib import Path

from database_functions.telegram_listing_db import (
    get_telegram_listing_by_id,
    update_telegram_listing_moderation_status,
    get_connection as get_db_connection
)
from keyboards.client_keyboards import get_category_translation
from utils.translations import t

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
                first_id, first_type = self._media_item_file_id_and_type(images[0])
                is_url = source == 'marketplace' and isinstance(first_id, str) and (first_id.startswith('http') or first_id.startswith('/'))

                if len(images) == 1:
                    if is_url:
                        message = await self.bot.send_photo(
                            chat_id=self.group_id,
                            photo=first_id,
                            caption=text,
                            parse_mode="HTML",
                            reply_markup=keyboard
                        )
                    elif first_type == 'video':
                        message = await self.bot.send_video(
                            chat_id=self.group_id,
                            video=first_id,
                            caption=text,
                            parse_mode="HTML",
                            reply_markup=keyboard
                        )
                    else:
                        message = await self.bot.send_photo(
                            chat_id=self.group_id,
                            photo=first_id,
                            caption=text,
                            parse_mode="HTML",
                            reply_markup=keyboard
                        )
                    return message.message_id
                else:
                    media_group = []
                    for i, item in enumerate(images):
                        file_id, mtype = self._media_item_file_id_and_type(item)
                        if not file_id:
                            continue
                        caption = text if i == 0 else None
                        parse = "HTML" if i == 0 else None
                        if mtype == 'video':
                            media_group.append(InputMediaVideo(media=file_id, caption=caption, parse_mode=parse))
                        else:
                            media_group.append(InputMediaPhoto(media=file_id, caption=caption, parse_mode=parse))

                    messages = await self.bot.send_media_group(
                        chat_id=self.group_id,
                        media=media_group
                    )
                    
                    if messages:
                        # Отримуємо user_id для перекладу
                        user_id = listing_data.get('sellerTelegramId') or listing_data.get('telegramId') or listing_data.get('userId') or 0
                        buttons_message = await self.bot.send_message(
                            chat_id=self.group_id,
                            text=f"🔔 <b>{t(user_id, 'moderation.listing_number', listing_id=listing_id)}</b>\n\n{t(user_id, 'moderation.choose_action')}",
                            parse_mode="HTML",
                            reply_markup=keyboard
                        )
                        return buttons_message.message_id
                    return None
            else:
                # Немає фото - використовуємо дефолтне фото
                default_photo_path = self._get_default_photo_path()
                
                if default_photo_path:
                    photo_file = FSInputFile(default_photo_path)
                    message = await self.bot.send_photo(
                        chat_id=self.group_id,
                        photo=photo_file,
                        caption=text,
                        parse_mode="HTML",
                        reply_markup=keyboard
                    )
                    return message.message_id
                else:
                    # Якщо дефолтного фото немає, надсилаємо тільки текст
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
        # Отримуємо user_id для перекладу (використовуємо мову користувача, який створив оголошення)
        user_id = listing.get('sellerTelegramId') or listing.get('telegramId') or listing.get('userId')
        if not user_id:
            user_id = 0  # Дефолтна мова (українська)
        
        source_emoji = "🌐" if source == 'marketplace' else "📱"
        source_text = t(user_id, 'moderation.source') + " " + ("Маркетплейс" if source == 'marketplace' else "Telegram бот")
        
        username = listing.get('username') or ''
        first_name = listing.get('firstName') or ''
        last_name = listing.get('lastName') or ''
        seller_name = f"{first_name} {last_name}".strip() or username or "Невідомий"
        
        if username:
            seller_info = f"@{username} ({seller_name})"
        else:
            seller_info = seller_name
        
        # Перевіряємо чи є priceDisplay (для "Договірна" або діапазону)
        price_display = listing.get('priceDisplay')
        price = listing.get('price', '0')
        currency = listing.get('currency', 'EUR')
        negotiable_text = t(user_id, 'moderation.negotiable')
        
        if price_display:
            if price_display == negotiable_text or price_display == "Договірна" or price_display == "Договорная":
                price_text = negotiable_text
            elif '/год' in price_display or '/час' in price_display:
                price_text = price_display
            else:
                price_text = f"{price_display} {currency}"
        else:
            # Якщо price == 0 і немає priceDisplay, можливо це "Договірна"
            if float(price) == 0:
                price_text = negotiable_text
            else:
                price_text = f"{price} {currency}"
        
        category = listing.get('category', t(user_id, 'moderation.not_specified'))
        subcategory = listing.get('subcategory')
        category_text = category
        if subcategory:
            category_text += f" / {subcategory}"
        
        location = listing.get('location', t(user_id, 'moderation.not_specified'))
        
        tariff_info = ""
        if source == 'telegram':
            publication_tariff = listing.get('publicationTariff')
            payment_status = listing.get('paymentStatus', 'pending')
            
            if publication_tariff:
                # Отримуємо переклад для "безкоштовно"
                free_text = t(user_id, 'common.free')
                tariff_names = {
                    'standard': f'📌 Звичайна публікація — {free_text}',
                    'highlighted': '⭐ Виділене оголошення — 4,5€',
                    'pinned_12h': '📌 Закріп на 12 годин — 5,5€',
                    'pinned_24h': '📌 Закріп на 24 години — 7,5€',
                    'story': '📸 Сторіс на 24 години — 5€',
                    'refresh': '🔄 Оновити оголошення — 1,5€'
                }
                
                # Перевіряємо чи це JSON масив (множинні тарифи)
                tariff_list = []
                try:
                    import json
                    if publication_tariff.startswith('['):
                        tariff_list = json.loads(publication_tariff)
                        tariff_name = ', '.join([tariff_names.get(t, t) for t in tariff_list if t in tariff_names])
                    else:
                        tariff_name = tariff_names.get(publication_tariff, publication_tariff)
                        tariff_list = [publication_tariff]
                except:
                    tariff_name = tariff_names.get(publication_tariff, publication_tariff)
                    tariff_list = [publication_tariff] if publication_tariff else []
                
                payment_emoji = "✅" if payment_status == 'paid' else "⏳"
                payment_text = t(user_id, 'moderation.paid') if payment_status == 'paid' else t(user_id, 'moderation.pending_payment')
                
                tariff_info = f"\n\n{t(user_id, 'moderation.tariff')} {tariff_name}\n{payment_emoji} {t(user_id, 'moderation.payment_status')} {payment_text}"
                
                # Додаємо повідомлення про сторіс, якщо обрано тариф "story"
                if 'story' in tariff_list:
                    tariff_info += "\n\n📸 <b>⚠️ ПОТРІБНО ВИКЛАСТИ СТОРІС!</b>"
        
        text = f"""{source_emoji} <b>{t(user_id, 'moderation.title')}</b> #{listing_id}

<b>{t(user_id, 'listing.details.title')}</b> {listing.get('title', t(user_id, 'moderation.no_title'))}

{t(user_id, 'listing.details.description')}
{listing.get('description', t(user_id, 'moderation.no_description'))}

{t(user_id, 'listing.details.price')} {price_text}
{t(user_id, 'listing.details.category')} {category_text}
{t(user_id, 'listing.details.location')} {location}{tariff_info}

{t(user_id, 'listing.details.seller')} {seller_info}
        {t(user_id, 'listing.details.created')} {self._format_date(listing.get('createdAt'), user_id)}

<i>{source_text}</i>"""
        
        return text
    
    def _get_listing_images(self, listing: Dict[str, Any]) -> List[Any]:
        """Повертає список медіа: або [file_id str], або [{"type":"photo"|"video","file_id":str}]. До 10 елементів."""
        images = listing.get('images', [])

        if isinstance(images, str):
            try:
                images = json.loads(images)
            except Exception:
                images = []

        if not isinstance(images, list):
            images = []

        return images[:10]

    @staticmethod
    def _media_item_file_id_and_type(item: Any) -> tuple:
        """Повертає (file_id, type) для елемента: str -> (str, "photo"), dict -> (file_id, type)."""
        if isinstance(item, dict):
            return (item.get('file_id') or '', (item.get('type') or 'photo').lower())
        return (str(item), 'photo')
    
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
    
    def _format_date(self, date_str: Optional[str], user_id: int = 0) -> str:
        if not date_str:
            return t(user_id, 'moderation.not_specified')
        
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
                    # channelMessageId вже збережено в _publish_to_channel (JSON з усіма message_id медіа-групи) — не перезаписуємо
                    cursor.execute("""
                        UPDATE TelegramListing
                        SET status = 'approved',
                            publishedAt = ?,
                            updatedAt = ?
                        WHERE id = ?
                    """, (datetime.now(), datetime.now(), listing_id))
                    
                    conn.commit()
                    conn.close()
                    
                    # Перевіряємо реферальну винагороду після одобрення TelegramListing
                    if listing:
                        seller_telegram_id = listing.get('sellerTelegramId') or listing.get('telegramId')
                        if seller_telegram_id:
                            try:
                                webapp_url = os.getenv('WEBAPP_URL') or os.getenv('NEXT_PUBLIC_BASE_URL') or 'http://localhost:3000'
                                api_url = f"{webapp_url}/api/referral/check"
                                
                                async with aiohttp.ClientSession() as session:
                                    async with session.post(
                                        api_url,
                                        json={'telegramId': str(seller_telegram_id)},
                                        timeout=aiohttp.ClientTimeout(total=10)
                                    ) as response:
                                        if response.status == 200:
                                            result = await response.json()
                                            if result.get('rewardPaid'):
                                                print(f"[approve_listing] Referral reward paid for user {seller_telegram_id}")
                                        else:
                                            print(f"[approve_listing] Failed to check referral reward: {response.status}")
                            except Exception as ref_error:
                                print(f"[approve_listing] Error checking referral reward: {ref_error}")
                
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
                
                # Перевіряємо реферальну винагороду після одобрення Listing (маркетплейс)
                if success:
                    try:
                        # Отримуємо telegramId користувача
                        cursor.execute("""
                            SELECT CAST(telegramId AS INTEGER) as telegramId
                            FROM User
                            WHERE id = (SELECT userId FROM Listing WHERE id = ?)
                        """, (listing_id,))
                        user_result = cursor.fetchone()
                        if user_result and user_result[0]:
                            seller_telegram_id = user_result[0]
                            webapp_url = os.getenv('WEBAPP_URL') or os.getenv('NEXT_PUBLIC_BASE_URL') or 'http://localhost:3000'
                            api_url = f"{webapp_url}/api/referral/check"
                            
                            async with aiohttp.ClientSession() as session:
                                async with session.post(
                                    api_url,
                                    json={'telegramId': str(seller_telegram_id)},
                                    timeout=aiohttp.ClientTimeout(total=10)
                                ) as response:
                                    if response.status == 200:
                                        result = await response.json()
                                        if result.get('rewardPaid'):
                                            print(f"[approve_listing] Referral reward paid for user {seller_telegram_id}")
                                    else:
                                        print(f"[approve_listing] Failed to check referral reward: {response.status}")
                    except Exception as ref_error:
                        print(f"[approve_listing] Error checking referral reward: {ref_error}")
                
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
                # Для marketplace listings викликаємо Node.js API для повернення коштів
                webapp_url = os.getenv('WEBAPP_URL') or os.getenv('NEXT_PUBLIC_BASE_URL') or 'http://localhost:3000'
                api_url = f"{webapp_url}/api/admin/moderation"
                
                try:
                    print(f"[reject_listing] Calling API for marketplace listing {listing_id}")
                    print(f"[reject_listing] API URL: {api_url}")
                    print(f"[reject_listing] Reason: {reason}")
                    
                    async with aiohttp.ClientSession() as session:
                        # Отримуємо admin ID для передачі в API
                        admin_id = None
                        if admin_telegram_id:
                            admin_id = self._get_admin_id_by_telegram_id(admin_telegram_id)
                            print(f"[reject_listing] Admin ID: {admin_id}")
                        
                        # Викликаємо API endpoint для відхилення (він поверне кошти)
                        payload = {
                            "listingId": listing_id,
                            "action": "reject",
                            "reason": reason,
                            "source": "marketplace"
                        }
                        
                        print(f"[reject_listing] Payload: {payload}")
                        
                        # Додаємо API key для автентифікації (якщо є)
                        headers = {}
                        bot_api_key = os.getenv('BOT_API_KEY') or os.getenv('TELEGRAM_BOT_API_KEY') or os.getenv('INTERNAL_API_SECRET')
                        if bot_api_key:
                            headers['Authorization'] = f'Bearer {bot_api_key}'
                            print(f"[reject_listing] Using API key for authentication")
                        else:
                            # Якщо API key не знайдено, все одно спробуємо відправити запит
                            # API endpoint дозволить внутрішні запити для marketplace listings
                            print(f"[reject_listing] No API key found, using internal request (will be allowed for marketplace listings)")
                        
                        async with session.post(api_url, json=payload, headers=headers, timeout=aiohttp.ClientTimeout(total=30)) as response:
                            response_text = await response.text()
                            print(f"[reject_listing] API Response status: {response.status}")
                            print(f"[reject_listing] API Response text: {response_text}")
                            
                            if response.status == 200:
                                try:
                                    result = await response.json() if response_text else {}
                                except:
                                    result = {}
                                print(f"[reject_listing] Оголошення {listing_id} відхилено через API, кошти повернуто: {result.get('refundInfo', {})}")
                                return True
                            else:
                                print(f"[reject_listing] Помилка при виклику API для відхилення оголошення {listing_id}: {response.status} - {response_text}")
                                # Fallback: оновлюємо статус вручну
                                conn = get_db_connection()
                                cursor = conn.cursor()
                                cursor.execute("""
                                    UPDATE Listing
                                    SET status = 'rejected',
                                        moderationStatus = 'rejected',
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
                except Exception as api_error:
                    print(f"Помилка при виклику API для відхилення оголошення {listing_id}: {api_error}")
                    # Fallback: оновлюємо статус вручну
                    conn = get_db_connection()
                    cursor = conn.cursor()
                    
                    admin_id = None
                    if admin_telegram_id:
                        admin_id = self._get_admin_id_by_telegram_id(admin_telegram_id)
                    
                    cursor.execute("""
                        UPDATE Listing
                        SET status = 'rejected',
                            moderationStatus = 'rejected',
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
    
    def _get_default_photo_path(self) -> Optional[str]:
        """Повертає шлях до дефолтного зображення"""
        default_image_path = os.path.join(
            os.path.dirname(os.path.dirname(__file__)),
            'Content',
            'tgground.jpg'
        )
        
        if not os.path.exists(default_image_path):
            print(f"Default image not found at: {default_image_path}")
            return None
        
        return default_image_path
    
    async def _publish_to_channel(self, listing_id: int) -> Optional[int]:
        try:
            listing = get_telegram_listing_by_id(listing_id)
            if not listing:
                print(f"Listing {listing_id} not found for channel publication")
                return None
            
            # Визначаємо канал на основі регіону
            region = listing.get('region', 'hamburg')  # За замовчуванням Гамбург
            
            if region == 'other_germany':
                channel_id = os.getenv('TRADE_GERMANY_CHANNEL_ID')
                if not channel_id:
                    print(f"TRADE_GERMANY_CHANNEL_ID not set, skipping channel publication")
                    return None
            else:
                channel_id = os.getenv('TRADE_CHANNEL_ID')
                if not channel_id:
                    print(f"TRADE_CHANNEL_ID not set, skipping channel publication")
                    return None
            
            channel_id = int(channel_id)
            
            title = listing.get('title', '')
            description = listing.get('description', '')
            # Перевіряємо чи є priceDisplay (для "Договірна" або діапазону)
            price_display = listing.get('priceDisplay')
            price = listing.get('price', 0)
            currency = listing.get('currency', 'EUR')
            
            # Отримуємо user_id для перекладу (потрібно отримати до формування тексту ціни)
            seller_telegram_id = listing.get('sellerTelegramId') or listing.get('telegramId')
            user_id_for_lang = seller_telegram_id if seller_telegram_id else 0
            negotiable_text = t(user_id_for_lang, 'moderation.negotiable')
            
            # Формуємо текст ціни
            if price_display:
                if price_display == negotiable_text or price_display == "Договірна" or price_display == "Договорная":
                    price_text = negotiable_text
                elif '/год' in price_display or '/час' in price_display:
                    price_text = price_display
                else:
                    price_text = f"{price_display} {currency}"
            elif float(price) == 0:
                price_text = negotiable_text
            else:
                price_text = f"{price} {currency}"
            category = listing.get('category', '')
            subcategory = listing.get('subcategory')
            condition = listing.get('condition', '')
            location = listing.get('location', '')
            
            # Формуємо хештег міста (видаляємо пробіли та спецсимволи)
            city_hashtag = location.replace(' ', '').replace('ü', 'u').replace('ö', 'o').replace('ä', 'a').replace('ß', 'ss')
            city_hashtag = ''.join(c for c in city_hashtag if c.isalnum() or c in ['_', '-'])
            city_hashtag = f"#{city_hashtag}" if city_hashtag else ""

            # Назва категорії та хештег — однією мовою (мова продавця)
            category_text = get_category_translation(user_id_for_lang, category)
            if subcategory:
                category_text += f" / {subcategory}"
            hashtag_category = get_category_translation(user_id_for_lang, category)
            
            # Використовуємо переклади для condition
            condition_map = {
                'new': t(user_id_for_lang, 'listing.details.condition_new'),
                'used': t(user_id_for_lang, 'listing.details.condition_used')
            }
            condition_text = condition_map.get(condition, condition)
            
            tariff_raw = listing.get('publicationTariff', 'standard')
            
            # Парсимо тарифи (може бути JSON масив або один тариф)
            tariffs = []
            try:
                import json
                if tariff_raw and tariff_raw.startswith('['):
                    tariffs = json.loads(tariff_raw)
                elif tariff_raw:
                    tariffs = [tariff_raw]
            except:
                if tariff_raw:
                    tariffs = [tariff_raw]
            
            if not tariffs:
                tariffs = ['standard']
            
            # Визначаємо title_prefix та title_style на основі вибраних тарифів
            title_prefix = ''
            # Назва завжди жирна в каналі
            title_style = f"<b>{title}</b>"
            
            # Якщо є highlighted, додаємо префікс
            if 'highlighted' in tariffs:
                title_prefix = '⭐ '
            # Якщо є story, додаємо префікс
            elif 'story' in tariffs:
                title_prefix = '📸 '
            
            # Отримуємо інформацію про продавця
            seller_first_name = listing.get('firstName', '')
            seller_last_name = listing.get('lastName', '')
            seller_username = listing.get('username', '')
            # seller_telegram_id вже отримано вище
            
            # Формуємо ім'я продавця (Ім'я Прізвище)
            seller_name_parts = []
            if seller_first_name:
                seller_name_parts.append(seller_first_name)
            if seller_last_name:
                seller_name_parts.append(seller_last_name)
            # Використовуємо переклад для "Продавець" якщо немає імені
            seller_default_name = t(user_id_for_lang, 'listing.details.seller_channel').replace('<b>', '').replace('</b>', '').replace(':', '').strip()
            seller_full_name = ' '.join(seller_name_parts).strip() if seller_name_parts else seller_default_name
            
            # Формуємо посилання на продавця (без емодзі для каналу)
            seller_label = t(user_id_for_lang, 'listing.details.seller_channel')
            if seller_username:
                seller_link = f"@{seller_username}"
                seller_text = f"{seller_label} <a href=\"https://t.me/{seller_username}\">{seller_full_name}</a>"
            elif seller_telegram_id:
                seller_link = f"tg://user?id={seller_telegram_id}"
                seller_text = f"{seller_label} <a href=\"{seller_link}\">{seller_full_name}</a>"
            else:
                seller_text = f"{seller_label} {seller_full_name}"
            
            # Отримуємо username бота з .env
            bot_username = os.getenv('BOT_USERNAME', 'TradeGroundBot')
            bot_link = f"https://t.me/{bot_username}"
            
            # Отримуємо мову користувача для перекладу (використовуємо user_id_for_lang, який вже встановлено)
            bot_text = f"\n\n{t(user_id_for_lang, 'listing.submit_ad_text', bot_link=bot_link)}"
            
            # Формуємо хештеги: категорія + місто
            hashtags = f"#{hashtag_category.replace(' ', '').replace('/', '_')}"
            if city_hashtag:
                hashtags += f" {city_hashtag}"
            
            text = f"""{title_prefix}{title_style}

{description}

{t(user_id_for_lang, 'listing.details.price_channel')} {price_text}
{t(user_id_for_lang, 'listing.details.category_channel')} {category_text}
{t(user_id_for_lang, 'listing.details.location_channel')} {location}
{seller_text}

{t(user_id_for_lang, 'listing.details.hashtag')} {hashtags}"""
            
            images = listing.get('images', [])
            if isinstance(images, str):
                try:
                    images = json.loads(images)
                except:
                    images = []
            
            if images and len(images) > 0:
                first_id, first_type = self._media_item_file_id_and_type(images[0])
                button_text = t(user_id_for_lang, 'listing.submit_ad_button')
                keyboard = InlineKeyboardMarkup(inline_keyboard=[
                    [InlineKeyboardButton(text=button_text, url=bot_link)]
                ])
                text_with_bot = text + bot_text

                if len(images) == 1:
                    if first_type == 'video':
                        message = await self.bot.send_video(
                            chat_id=channel_id,
                            video=first_id,
                            caption=text_with_bot,
                            parse_mode="HTML",
                            reply_markup=keyboard
                        )
                    else:
                        message = await self.bot.send_photo(
                            chat_id=channel_id,
                            photo=first_id,
                            caption=text_with_bot,
                            parse_mode="HTML",
                            reply_markup=keyboard
                        )
                    message_id = message.message_id

                    conn = get_db_connection()
                    cursor = conn.cursor()
                    cursor.execute("PRAGMA table_info(TelegramListing)")
                    columns = [row[1] for row in cursor.fetchall()]
                    if 'channelMessageId' in columns:
                        cursor.execute("""
                            UPDATE TelegramListing
                            SET channelMessageId = ?
                            WHERE id = ?
                        """, (json.dumps([message_id]), listing_id))
                        conn.commit()
                    conn.close()

                    if message_id and any(t.startswith('pinned') for t in tariffs):
                        try:
                            await self.bot.pin_chat_message(chat_id=channel_id, message_id=message_id)
                        except Exception as e:
                            print(f"Error pinning message: {e}")
                    if 'highlighted' in tariffs and message_id:
                        try:
                            await self.bot.send_message(chat_id=channel_id, text="🔝🔝🔝")
                        except Exception as e:
                            print(f"Error sending highlighted message: {e}")

                    return message_id
                else:
                    media = []
                    for i, item in enumerate(images):
                        file_id, mtype = self._media_item_file_id_and_type(item)
                        if not file_id:
                            continue
                        caption = text_with_bot if i == 0 else None
                        parse = "HTML" if i == 0 else None
                        if mtype == 'video':
                            media.append(InputMediaVideo(media=file_id, caption=caption, parse_mode=parse))
                        else:
                            media.append(InputMediaPhoto(media=file_id, caption=caption, parse_mode=parse))

                    if not media:
                        return None
                    messages = await self.bot.send_media_group(
                        chat_id=channel_id,
                        media=media
                    )
                    message_id = messages[0].message_id if messages else None
                    
                    # Зберігаємо всі message_id з медіа-групи як JSON (завжди, навіть якщо одне повідомлення)
                    if messages:
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
                    
                    # Застосовуємо всі вибрані тарифи
                    # Закріплення (pinned_12h або pinned_24h)
                    if message_id and any(t.startswith('pinned') for t in tariffs):
                        try:
                            await self.bot.pin_chat_message(
                                chat_id=channel_id,
                                message_id=message_id
                            )
                        except Exception as e:
                            print(f"Error pinning message: {e}")
                    
                    # Для виділеного оголошення відправляємо додаткове повідомлення
                    if 'highlighted' in tariffs and message_id:
                        try:
                            await self.bot.send_message(
                                chat_id=channel_id,
                                text="🔝🔝🔝"
                            )
                        except Exception as e:
                            print(f"Error sending highlighted message: {e}")
                    
                    return message_id
            else:
                # Немає фото - використовуємо дефолтне фото або текст з посиланням на бота
                default_photo_path = self._get_default_photo_path()
                
                if default_photo_path:
                    # Використовуємо дефолтне фото з кнопкою посилання на бота
                    text_with_bot = text + bot_text
                    
                    # Отримуємо текст кнопки залежно від мови користувача
                    button_text = t(user_id_for_lang, 'listing.submit_ad_button')
                    
                    keyboard = InlineKeyboardMarkup(inline_keyboard=[
                        [InlineKeyboardButton(
                            text=button_text,
                            url=bot_link
                        )]
                    ])
                    
                    photo_file = FSInputFile(default_photo_path)
                    message = await self.bot.send_photo(
                        chat_id=channel_id,
                        photo=photo_file,
                        caption=text_with_bot,
                        parse_mode="HTML",
                        reply_markup=keyboard
                    )
                    message_id = message.message_id
                    
                    # Зберігаємо message_id як JSON масив
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
                        """, (json.dumps([message_id]), listing_id))
                        conn.commit()
                    conn.close()
                else:
                    # Якщо дефолтного фото немає, надсилаємо текст з посиланням на бота
                    text_with_bot = text + bot_text
                    message = await self.bot.send_message(
                        chat_id=channel_id,
                        text=text_with_bot,
                        parse_mode="HTML"
                    )
                    message_id = message.message_id
                    conn = get_db_connection()
                    cursor = conn.cursor()
                    cursor.execute("PRAGMA table_info(TelegramListing)")
                    columns = [row[1] for row in cursor.fetchall()]
                    if 'channelMessageId' in columns:
                        cursor.execute("""
                            UPDATE TelegramListing
                            SET channelMessageId = ?
                            WHERE id = ?
                        """, (json.dumps([message_id]), listing_id))
                        conn.commit()
                    conn.close()

                # Застосовуємо всі вибрані тарифи
                # Закріплення (pinned_12h або pinned_24h)
                if message_id and any(t.startswith('pinned') for t in tariffs):
                    try:
                        await self.bot.pin_chat_message(
                            chat_id=channel_id,
                            message_id=message_id
                        )
                    except Exception as e:
                        print(f"Error pinning message: {e}")
                
                # Для виділеного оголошення відправляємо додаткове повідомлення
                if 'highlighted' in tariffs and message_id:
                    try:
                        await self.bot.send_message(
                            chat_id=channel_id,
                            text="🔝🔝🔝"
                        )
                    except Exception as e:
                        print(f"Error sending highlighted message: {e}")
                
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
                if isinstance(channel_message_id, str) and (channel_message_id.startswith('[') or channel_message_id.startswith('"')):
                    # Може бути JSON масив або JSON рядок з масивом
                    parsed = json.loads(channel_message_id)
                    if isinstance(parsed, list):
                        message_ids = parsed
                    else:
                        # Якщо це не масив, спробуємо як число
                        message_ids = [int(parsed)]
                elif isinstance(channel_message_id, (int, str)):
                    # Старий формат - один message_id
                    # Спробуємо видалити це повідомлення, а також спробуємо видалити сусідні (якщо це медіа-група)
                    single_msg_id = int(channel_message_id)
                    message_ids = [single_msg_id]
                    
                    # Для старих записів: спробуємо також видалити повідомлення +1 та -1
                    # (медіа-групи зазвичай мають послідовні message_id)
                    # Але це не надійно, тому просто видалимо одне повідомлення
                    # Telegram автоматично видалить всю медіа-групу, якщо видалити одне повідомлення з неї
                    print(f"Використовується старий формат channelMessageId для оголошення {listing_id}, спробуємо видалити повідомлення {single_msg_id}")
                else:
                    message_ids = [int(channel_message_id)]
            except Exception as e:
                # Якщо не вдалося розпарсити, спробуємо як число
                try:
                    message_ids = [int(channel_message_id)]
                    print(f"Використовується fallback для channelMessageId для оголошення {listing_id}")
                except:
                    print(f"Не вдалося розпарсити channelMessageId для оголошення {listing_id}: {e}")
                    return False
            
            # Видаляємо всі повідомлення з медіа-групи
            deleted_count = 0
            
            # Якщо це старий формат (один message_id), спробуємо знайти всі повідомлення з медіа-групи
            if len(message_ids) == 1 and isinstance(channel_message_id, (int, str)) and not (isinstance(channel_message_id, str) and channel_message_id.startswith('[')):
                first_msg_id = message_ids[0]
                
                # Для старих записів: спробуємо знайти всі повідомлення з медіа-групи поступово
                # Перевіряємо сусідні повідомлення, починаючи з найближчих
                # Медіа-групи зазвичай мають послідовні message_id, максимум 10 повідомлень
                found_message_ids = [first_msg_id]
                
                # Спочатку видаляємо центральне повідомлення
                try:
                    await self.bot.delete_message(chat_id=channel_id, message_id=first_msg_id)
                    deleted_count += 1
                except Exception as e:
                    error_msg = str(e).lower()
                    if "message to delete not found" not in error_msg and "message not found" not in error_msg:
                        pass  # Ігноруємо помилки
                
                # Тепер спробуємо знайти інші повідомлення з медіа-групи
                # Перевіряємо сусідні повідомлення поступово в обох напрямках
                # Зупиняємося тільки коли не знайдено кілька повідомлень підряд
                max_range = 10  # Максимум 10 повідомлень в медіа-групі
                consecutive_not_found = {}  # Лічильник послідовних не знайдених в кожному напрямку
                
                for direction in [-1, 1]:
                    consecutive_not_found[direction] = 0
                    for offset in range(1, max_range + 1):
                        check_msg_id = first_msg_id + (offset * direction)
                        
                        # Спробуємо видалити повідомлення
                        try:
                            await self.bot.delete_message(chat_id=channel_id, message_id=check_msg_id)
                            deleted_count += 1
                            found_message_ids.append(check_msg_id)
                            consecutive_not_found[direction] = 0  # Скидаємо лічильник
                        except Exception as e:
                            error_msg = str(e).lower()
                            if "message to delete not found" in error_msg or "message not found" in error_msg:
                                # Повідомлення не існує
                                consecutive_not_found[direction] += 1
                                # Якщо не знайдено 2 повідомлення підряд, зупиняємося в цьому напрямку
                                if consecutive_not_found[direction] >= 2:
                                    break
                            else:
                                # Інша помилка - можливо повідомлення не належить до медіа-групи
                                # Зупиняємося в цьому напрямку
                                break
            else:
                # Новий формат - маємо всі message_id, просто видаляємо їх
                for msg_id in message_ids:
                    try:
                        await self.bot.delete_message(chat_id=channel_id, message_id=int(msg_id))
                        deleted_count += 1
                    except Exception as e:
                        # Якщо повідомлення вже видалено або не існує, ігноруємо помилку
                        error_msg = str(e).lower()
                        if not any(phrase in error_msg for phrase in [
                            "message to delete not found",
                            "message not found", 
                            "message can't be deleted",
                            "bad request: message to delete not found",
                            "bad request: message not found"
                        ]):
                            # Ігноруємо помилки видалення
                            pass
            
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
