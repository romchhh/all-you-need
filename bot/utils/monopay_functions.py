from datetime import datetime
import json
import requests
from database_functions.payments_db import update_payment_status, get_pending_payments, save_payment_info
from database_functions.telegram_listing_db import get_telegram_listing_by_id, update_telegram_listing_publication_tariff
from database_functions.telegram_listing_db import get_connection
from config import MONOBANK_TOKEN
import logging
from utils.moderation_manager import ModerationManager
from main import bot
from config import bot_username


class PaymentManager:
    def __init__(self):
        self.token = MONOBANK_TOKEN
        self.host = "https://api.monobank.ua/"

    def create_publication_payment(self, user_id: int, listing_id: int, tariff_type: str, amount: float) -> tuple[str, str, str]:
        local_payment_id = f"publication_{listing_id}_{user_id}_{int(datetime.now().timestamp())}"
        amount_cents = int(amount * 100)
        
        tariff_names = {
            'standard': 'Звичайна публікація',
            'highlighted': 'Виділене оголошення',
            'pinned_12h': 'Закріп на 12 годин',
            'pinned_24h': 'Закріп на 24 години',
            'story': 'Сторіс на 24 години',
            'refresh': 'Оновити оголошення'
        }
        
        # Перевіряємо чи tariff_type це JSON масив (для множинних тарифів)
        try:
            import json
            if tariff_type.startswith('['):
                tariff_list = json.loads(tariff_type)
                tariff_name = ', '.join([tariff_names.get(t, t) for t in tariff_list if t in tariff_names])
            else:
                tariff_name = tariff_names.get(tariff_type, 'Публікація оголошення')
        except:
            tariff_name = tariff_names.get(tariff_type, 'Публікація оголошення')
        
        payload = {
            "amount": amount_cents,
            "ccy": 978,
            "description": f"Публікація оголошення: {tariff_name}",
            "orderReference": local_payment_id,
            "destination": f"Публікація оголошення #{listing_id}",
            "redirectUrl": f"https://t.me/{bot_username}",
            "merchantPaymInfo": {
                "basketOrder": [
                    {
                        "name": tariff_name,
                        "qty": 1,
                        "sum": amount_cents,
                        "code": f"publication_{tariff_type}_{listing_id}",
                        "unit": "послуга"
                    }
                ]
            }
        }
        
        headers = {"X-Token": self.token, "Content-Type": "application/json"}
        response = requests.post(f"{self.host}api/merchant/invoice/create", json=payload, headers=headers)
        
        if response.status_code == 200:
            result = response.json()
            invoice_id = result["invoiceId"]
            payment_url = result["pageUrl"]
            return local_payment_id, invoice_id, payment_url
        else:
            raise Exception(f"Помилка створення платежу: {response.text}")


async def check_pending_payments():
    try:
        logging.info("=" * 50)
        logging.info("🔄 Початок перевірки платежів")
        logging.info(f"⏰ Час: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        
        payment_manager = PaymentManager()
        pending_payments = get_pending_payments(hours=1)  # Перевіряємо платежі за останні 1 годину
        
        logging.info(f"Знайдено {len(pending_payments)} платежів у базі для перевірки")
        if not pending_payments:
            logging.warning("Список pending_payments порожній. Перевірте базу даних")
            logging.info("✅ Завершення перевірки платежів")
            logging.info("=" * 50)
            return

        for payment in pending_payments:
            invoice_id, user_id, product_id, months, amount = payment
            logging.info(f"Перевірка платежу з БД: {invoice_id} (користувач: {user_id})")
            
            headers = {"X-Token": payment_manager.token}
            try:
                response = requests.get(
                    f"{payment_manager.host}api/merchant/invoice/status?invoiceId={invoice_id}",
                    headers=headers
                )
                
                if response.status_code == 200:
                    payment_data = response.json()
                    status = payment_data.get("status", "невідомо")
                    logging.info(f"Статус платежу {invoice_id} з API: {status}")
                    
                    if status == "success":
                        logging.info(f"Платіж {invoice_id} успішний. Оновлення статусу")
                        update_payment_status(invoice_id, "success")

                        # Отримуємо інформацію про платіж
                        from database_functions.payments_db import get_connection
                        conn = get_connection()
                        cursor = conn.cursor()
                        cursor.execute("""
                            SELECT payment_id, user_id, product_id FROM payments WHERE invoice_id = ?
                        """, (invoice_id,))
                        payment_row = cursor.fetchone()
                        conn.close()
                        
                        if payment_row:
                            payment_id_str, payment_user_id, listing_id = payment_row
                            
                            if payment_id_str and 'publication_' in payment_id_str:
                                listing = get_telegram_listing_by_id(listing_id)
                                
                                if listing:
                                    is_refresh = 'refresh' in payment_id_str
                                    
                                    if is_refresh:
                                        tariff_type = listing.get('publicationTariff', 'standard')
                                    else:
                                        tariff_type = listing.get('publicationTariff', 'standard')
                                    if not is_refresh:
                                        update_telegram_listing_publication_tariff(listing_id, tariff_type, 'paid')
                                    else:
                                        conn = get_connection()
                                        cursor = conn.cursor()
                                        
                                        cursor.execute("PRAGMA table_info(TelegramListing)")
                                        columns = [row[1] for row in cursor.fetchall()]
                                        has_payment_status = 'paymentStatus' in columns
                                        
                                        if not has_payment_status:
                                            cursor.execute("ALTER TABLE TelegramListing ADD COLUMN paymentStatus TEXT DEFAULT 'pending'")
                                        
                                        cursor.execute("""
                                            UPDATE TelegramListing
                                            SET paymentStatus = 'paid',
                                                updatedAt = ?
                                            WHERE id = ?
                                        """, (datetime.now(), listing_id))
                                        conn.commit()
                                        conn.close()
                                    
                                    if is_refresh:
                                        try:
                                            moderation_manager = ModerationManager(bot)
                                            
                                            # Спочатку видаляємо старе повідомлення з каналу
                                            old_channel_message_id = listing.get('channelMessageId') or listing.get('channel_message_id')
                                            if old_channel_message_id and old_channel_message_id != 'None' and str(old_channel_message_id).strip():
                                                try:
                                                    await moderation_manager.delete_from_channel(listing_id)
                                                    logging.info(f"Старе повідомлення {old_channel_message_id} видалено з каналу для оголошення {listing_id}")
                                                except Exception as e:
                                                    logging.warning(f"Не вдалося видалити старе повідомлення з каналу: {e}")
                                            
                                            # Публікуємо нове повідомлення в канал (без модерації)
                                            channel_message_id = await moderation_manager._publish_to_channel(listing_id)
                                            
                                            if channel_message_id:
                                                conn = get_connection()
                                                cursor = conn.cursor()
                                                # channelMessageId вже збережено в _publish_to_channel (JSON з усіма message_id) — не перезаписуємо
                                                cursor.execute("""
                                                    UPDATE TelegramListing
                                                    SET publishedAt = ?,
                                                        updatedAt = ?
                                                    WHERE id = ?
                                                """, (datetime.now(), datetime.now(), listing_id))
                                                conn.commit()
                                                conn.close()
                                                
                                                logging.info(f"Оголошення {listing_id} повторно опубліковане в каналі після refresh (без модерації)")
                                                
                                                try:
                                                    await bot.send_message(
                                                        chat_id=payment_user_id,
                                                        text="✅ <b>Оголошення оновлено!</b>\n\nВаше оголошення повторно опубліковане в каналі.",
                                                        parse_mode="HTML"
                                                    )
                                                except Exception as e:
                                                    logging.error(f"Помилка відправки повідомлення користувачу {payment_user_id}: {e}")
                                            else:
                                                logging.error(f"Помилка публікації оголошення {listing_id} в каналі")
                                                
                                        except Exception as e:
                                            logging.error(f"Помилка повторної публікації оголошення {listing_id}: {e}")
                                            import traceback
                                            traceback.print_exc()
                                    else:
                                        try:
                                            moderation_manager = ModerationManager(bot)
                                            await moderation_manager.send_listing_to_moderation(
                                                listing_id=listing_id,
                                                source='telegram'
                                            )
                                            logging.info(f"Оголошення {listing_id} відправлено на модерацію після підтвердження оплати")
                                            
                                            try:
                                                from keyboards.client_keyboards import get_main_menu_keyboard
                                                await bot.send_message(
                                                    chat_id=payment_user_id,
                                                    text="✅ <b>Оплата підтверджена!</b>\n\nВаше оголошення відправлено на модерацію. Після схвалення воно буде опубліковане в каналі.",
                                                    parse_mode="HTML",
                                                    reply_markup=get_main_menu_keyboard(payment_user_id)
                                                )
                                            except Exception as e:
                                                logging.error(f"Помилка відправки повідомлення користувачу {payment_user_id}: {e}")
                                                
                                        except Exception as e:
                                            logging.error(f"Помилка відправки оголошення {listing_id} на модерацію: {e}")
                        
                        logging.info(f"Платіж {invoice_id} оброблено успішно")
                    else:
                        logging.info(f"Платіж {invoice_id} ще не успішний: {status}")
                else:
                    logging.error(f"Помилка API для {invoice_id}: {response.status_code} - {response.text}")
            except Exception as e:
                logging.error(f"Помилка при перевірці платежу {invoice_id}: {str(e)}", exc_info=True)
        
        logging.info("✅ Завершення перевірки платежів")
        logging.info("=" * 50)
    except Exception as e:
        logging.error(f"❌ КРИТИЧНА ПОМИЛКА в check_pending_payments: {e}", exc_info=True)
        logging.info("=" * 50)


def create_publication_payment_link(user_id: int, listing_id: int, tariff_type: str, amount: float) -> dict:
    try:
        payment_manager = PaymentManager()
        local_payment_id, invoice_id, payment_url = payment_manager.create_publication_payment(
            user_id=user_id,
            listing_id=listing_id,
            tariff_type=tariff_type,
            amount=amount
        )
        
        save_success = save_payment_info(
            payment_id=local_payment_id,
            invoice_id=invoice_id,
            user_id=user_id,
            product_id=listing_id,
            months=1,
            amount=amount,
            status='pending'
        )
        
        if not save_success:
            logging.error(f"Помилка збереження платежу в БД: {invoice_id}")
        else:
            logging.info(f"Платіж збережено в БД: {invoice_id} для оголошення {listing_id}, тариф {tariff_type}")
        
        return {
            'success': True,
            'local_payment_id': local_payment_id,
            'invoice_id': invoice_id,
            'payment_url': payment_url,
            'amount': amount,
            'tariff_type': tariff_type
        }
    except Exception as e:
        logging.error(f"Помилка створення платежу для оголошення {listing_id}, тариф {tariff_type}: {e}")
        return {
            'success': False,
            'error': str(e)
        }

