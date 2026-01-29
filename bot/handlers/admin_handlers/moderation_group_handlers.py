import os
from aiogram import Router, types, F
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo

from main import bot
from utils.filters import IsAdmin
from utils.moderation_manager import ModerationManager
from utils.translations import t
from database_functions.telegram_listing_db import get_telegram_listing_by_id
from database_functions.prisma_db import PrismaDB

router = Router()
moderation_manager = ModerationManager(bot)
db = PrismaDB()


class RejectReason(StatesGroup):
    waiting_for_reason = State()


@router.callback_query(F.data.startswith("mod_approve_"))
async def handle_moderation_approve(callback: types.CallbackQuery):
    """Обробка схвалення оголошення з групи модерації"""
    user_id = callback.from_user.id
    
    # Парсимо callback_data: mod_approve_{source}_{listing_id}
    parts = callback.data.split("_")
    if len(parts) < 4:
        await callback.answer("❌ Помилка формату", show_alert=True)
        return
    
    source = parts[2]  # 'marketplace' або 'telegram'
    listing_id = int(parts[3])
    
    try:
        # Схвалюємо оголошення
        success = await moderation_manager.approve_listing(
            listing_id=listing_id,
            source=source,
            admin_telegram_id=user_id
        )
        
        if success:
            # Отримуємо дані оголошення для повідомлення користувачу
            if source == 'telegram':
                listing_data = get_telegram_listing_by_id(listing_id)
            else:
                listing_data = db.get_listing_by_id(listing_id)
            
            if listing_data:
                telegram_id = listing_data.get('sellerTelegramId')
                if telegram_id:
                    await send_approval_notification(telegram_id, listing_data, source, listing_id)
            
            # Видаляємо inline кнопки та надсилаємо нове повідомлення
            status_text = f"✅ <b>Оголошення #{listing_id} схвалено</b>\n\nМодератор: @{callback.from_user.username or callback.from_user.first_name}"
            
            try:
                # Видаляємо inline кнопки
                await callback.message.edit_reply_markup(reply_markup=None)
            except:
                pass
            
            # Надсилаємо нове повідомлення
            await callback.message.answer(
                status_text,
                parse_mode="HTML"
            )
            
            await callback.answer("✅ Оголошення схвалено")
        else:
            await callback.answer("❌ Помилка при схваленні", show_alert=True)
            
    except Exception as e:
        print(f"Помилка схвалення оголошення: {e}")
        await callback.answer("❌ Помилка при схваленні", show_alert=True)


@router.callback_query(F.data.startswith("mod_reject_"))
async def handle_moderation_reject(callback: types.CallbackQuery, state: FSMContext):
    """Обробка відхилення оголошення з групи модерації"""
    user_id = callback.from_user.id
    
    # Парсимо callback_data: mod_reject_{source}_{listing_id}
    parts = callback.data.split("_")
    if len(parts) < 4:
        await callback.answer("❌ Помилка формату", show_alert=True)
        return
    
    source = parts[2]  # 'marketplace' або 'telegram'
    listing_id = int(parts[3])
    
    # Зберігаємо дані в стані
    await state.update_data(
        source=source,
        listing_id=listing_id,
        message_id=callback.message.message_id
    )
    
    # Запитуємо причину відхилення
    await callback.message.answer(
        "📝 <b>Вкажіть причину відхилення:</b>\n\n"
        "Надішліть текст причини відхилення цього оголошення.",
        parse_mode="HTML"
    )
    
    await state.set_state(RejectReason.waiting_for_reason)
    await callback.answer()


@router.message(RejectReason.waiting_for_reason)
async def process_reject_reason(message: types.Message, state: FSMContext):
    """Обробка причини відхилення"""
    user_id = message.from_user.id
    data = await state.get_data()
    
    source = data.get('source')
    listing_id = data.get('listing_id')
    message_id = data.get('message_id')
    
    if not source or not listing_id:
        await message.answer("<b>❌ Помилка:</b> дані не знайдені", parse_mode="HTML")
        await state.clear()
        return
    
    reason = message.text.strip()
    
    if not reason or len(reason) < 5:
        await message.answer("<b>❌ Причина відхилення повинна містити мінімум 5 символів.</b>\n\nСпробуйте ще раз:", parse_mode="HTML")
        return
    
    try:
        # Відхиляємо оголошення
        success = await moderation_manager.reject_listing(
            listing_id=listing_id,
            source=source,
            reason=reason,
            admin_telegram_id=user_id
        )
        
        if success:
            # Для marketplace listings повідомлення надсилається через API
            # Тому тут не надсилаємо повідомлення для marketplace
            if source == 'telegram':
                # Отримуємо дані оголошення для повідомлення користувачу
                listing_data = get_telegram_listing_by_id(listing_id)
                if listing_data:
                    telegram_id = listing_data.get('sellerTelegramId')
                    if telegram_id:
                        await send_rejection_notification(telegram_id, listing_data, reason, source)
            
            # Видаляємо inline кнопки та надсилаємо нове повідомлення
            status_text = f"❌ <b>Оголошення #{listing_id} відхилено</b>\n\n<b>Причина:</b> {reason}\n\nМодератор: @{message.from_user.username or message.from_user.first_name}"
            
            try:
                # Видаляємо inline кнопки
                await bot.edit_message_reply_markup(
                    chat_id=message.chat.id,
                    message_id=message_id,
                    reply_markup=None
                )
            except:
                pass
            
            # Надсилаємо нове повідомлення
            try:
                await bot.send_message(
                    chat_id=message.chat.id,
                    text=status_text,
                    parse_mode="HTML"
                )
            except Exception as e:
                print(f"Помилка надсилання повідомлення: {e}")
            
            await message.answer("<b>✅ Оголошення відхилено</b>", parse_mode="HTML")
        else:
            await message.answer("<b>❌ Помилка при відхиленні</b>", parse_mode="HTML")
            
    except Exception as e:
        print(f"Помилка відхилення оголошення: {e}")
        await message.answer("<b>❌ Помилка при відхиленні</b>", parse_mode="HTML")
    
    await state.clear()


async def send_approval_notification(
    telegram_id: int,
    listing_data: dict,
    source: str,
    listing_id: int
):
    """Надсилає повідомлення користувачу про схвалення оголошення"""
    try:
        title = listing_data.get('title', 'Оголошення')
        webapp_url = os.getenv('WEBAPP_URL', 'https://your-domain.com')
        channel_id = os.getenv('TRADE_CHANNEL_ID')
        
        if source == 'telegram':
            # Отримуємо channel_message_id та дату публікації з БД
            from database_functions.telegram_listing_db import get_telegram_listing_by_id
            from datetime import datetime, timedelta
            import json
            listing = get_telegram_listing_by_id(listing_id)
            channel_message_id_raw = listing.get('channelMessageId') if listing else None
            if channel_message_id_raw and isinstance(channel_message_id_raw, str) and channel_message_id_raw.strip().startswith('['):
                try:
                    arr = json.loads(channel_message_id_raw)
                    channel_message_id = str(arr[0]) if isinstance(arr, list) and arr else channel_message_id_raw
                except (json.JSONDecodeError, TypeError):
                    channel_message_id = channel_message_id_raw
            else:
                channel_message_id = channel_message_id_raw
            published_at = listing.get('publishedAt') if listing else None
            
            # Форматуємо дату закінчення (опубліковано до)
            expires_date_text = ""
            if published_at:
                try:
                    if isinstance(published_at, str):
                        published_date = datetime.fromisoformat(published_at.replace('Z', '+00:00'))
                    else:
                        published_date = published_at
                    # Оголошення активне 30 днів
                    expires_date = published_date + timedelta(days=30)
                    expires_date_text = f"\n📅 Опубліковано до: {expires_date.strftime('%d.%m.%Y')}"
                except:
                    pass
            
            message_text = f"""✅ <b>Оголошення схвалено!</b>

Ваше оголошення "<b>{title}</b>" пройшло модерацію та опубліковане в каналі.{expires_date_text}

Дякуємо за використання нашого сервісу!"""
            
            # Створюємо inline кнопку з посиланням на оголошення в каналі
            keyboard_buttons = []
            if channel_id and channel_message_id:
                # Формуємо посилання на повідомлення в каналі
                channel_username = os.getenv('TRADE_CHANNEL_USERNAME', '')
                if channel_username:
                    # Якщо є username каналу
                    channel_link = f"https://t.me/{channel_username}/{channel_message_id}"
                else:
                    # Якщо немає username, використовуємо ID
                    channel_link = f"https://t.me/c/{str(channel_id)[4:]}/{channel_message_id}"
                
                keyboard_buttons.append([InlineKeyboardButton(
                    text="🔗 Переглянути оголошення",
                    url=channel_link
                )])
            else:
                # Якщо немає посилання на канал, даємо посилання на профіль
                webapp_url_with_params = f"{webapp_url}/uk/profile?telegramId={telegram_id}"
                keyboard_buttons.append([InlineKeyboardButton(
                    text="🔗 Переглянути профіль",
                    web_app=WebAppInfo(url=webapp_url_with_params)
                )])
            
            keyboard = InlineKeyboardMarkup(inline_keyboard=keyboard_buttons)
        else:
            from datetime import datetime, timedelta
            expires_at = datetime.now() + timedelta(days=30)
            expires_date = expires_at.strftime("%d.%m.%Y")
            
            message_text = f"""✅ <b>Оголошення схвалено!</b>

Ваше оголошення "<b>{title}</b>" пройшло модерацію та опубліковано.

📅 Термін дії: до {expires_date}

Ваше оголошення буде активним протягом 30 днів."""
            
            # Для маркетплейсу посилання на оголошення
            webapp_url_with_params = f"{webapp_url}/uk/bazaar?listing={listing_id}&telegramId={telegram_id}"
            keyboard = InlineKeyboardMarkup(inline_keyboard=[
                [InlineKeyboardButton(
                    text="🔗 Переглянути оголошення",
                    web_app=WebAppInfo(url=webapp_url_with_params)
                )]
            ])
        
        await bot.send_message(
            chat_id=telegram_id,
            text=message_text,
            parse_mode="HTML",
            reply_markup=keyboard
        )
    except Exception as e:
        print(f"Помилка надсилання повідомлення про схвалення: {e}")


async def send_rejection_notification(
    telegram_id: int,
    listing_data: dict,
    reason: str,
    source: str,
    refund_info: dict = None
):
    """Надсилає повідомлення користувачу про відхилення оголошення (мова — з БД користувача)."""
    try:
        title = listing_data.get('title', 'Оголошення')
        title_placeholder = title  # для перекладу "Оголошення" можна додати ключ, поки використовуємо як є

        # Формуємо інформацію про повернення коштів (переклади за мовою користувача)
        refund_parts = []
        if refund_info:
            if refund_info.get('refundedPackage'):
                refund_parts.append(t(telegram_id, 'my_listings.rejection_notification_refund_package'))
            if refund_info.get('refundedPromotions') and refund_info.get('promotionRefundAmount'):
                amount = refund_info.get('promotionRefundAmount', 0)
                if amount > 0:
                    refund_parts.append(t(telegram_id, 'my_listings.rejection_notification_refund_promotion', amount=amount))
        if not refund_parts:
            refund_parts.append(t(telegram_id, 'my_listings.rejection_notification_refund_none'))

        refund_title = t(telegram_id, 'my_listings.rejection_notification_refund_title')
        refund_text = f"\n\n{refund_title}\n" + "\n".join(refund_parts)

        msg_title = t(telegram_id, 'my_listings.rejection_notification_title')
        msg_body = t(telegram_id, 'my_listings.rejection_notification_body', title=title_placeholder)
        reason_label = t(telegram_id, 'my_listings.rejection_reason')
        edit_hint = t(telegram_id, 'my_listings.rejection_notification_edit_hint')

        message_text = f"""{msg_title}

{msg_body}

{reason_label}
{reason}{refund_text}

{edit_hint}"""

        listing_id = listing_data.get('id')
        keyboard = None
        if listing_id is not None:
            edit_btn_text = t(telegram_id, 'my_listings.edit_button')
            keyboard = InlineKeyboardMarkup(inline_keyboard=[
                [InlineKeyboardButton(text=edit_btn_text, callback_data=f"edit_rejected_listing_{listing_id}")]
            ])

        await bot.send_message(
            chat_id=telegram_id,
            text=message_text,
            parse_mode="HTML",
            reply_markup=keyboard
        )
    except Exception as e:
        print(f"Помилка надсилання повідомлення про відхилення: {e}")
