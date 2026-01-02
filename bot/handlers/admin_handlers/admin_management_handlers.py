from aiogram import Router, types, F
from aiogram.fsm.context import FSMContext
from keyboards.admin_keyboards import get_admin_list_keyboard, get_cancel_keyboard, admin_keyboard
from utils.filters import IsAdmin, IsSuperAdmin
from database_functions.admin_db import (
    get_all_admins, remove_admin, add_admin,
    get_admin_info_by_id, is_superadmin, get_user_id_by_username, get_username_by_user_id   
)
from states.admin_states import AdminManagement
from config import administrators
from main import bot


router = Router()


@router.message(IsAdmin(), F.text.in_(["Адміністратори"]))
async def admin_list(message: types.Message):
    user_id = message.from_user.id
    is_super = user_id == administrators[0]
    
    admins = get_all_admins()
    
    if not admins:
        await message.answer(
            "👑 <b>Список адміністраторів</b>\n\n"
            "Немає зареєстрованих адміністраторів.",
            parse_mode="HTML",
            reply_markup=get_admin_list_keyboard([], is_super)
        )
        return
    
    admins_text = "👑 <b>Список адміністраторів</b>\n\n"
    
    if is_super:
        admins_text += "Натисніть на адміністратора для перегляду інформації\n"
        admins_text += "або на ❌ для видалення.\n\n"
    else:
        admins_text += "Натисніть на адміністратора для перегляду інформації.\n\n"
    
    await message.answer(
        admins_text,
        parse_mode="HTML",
        reply_markup=get_admin_list_keyboard(admins, is_super)
    )

@router.callback_query(IsAdmin(), F.data == "admin_add_new")
async def admin_add_new_callback(callback: types.CallbackQuery, state: FSMContext):
    user_id = callback.from_user.id
    
    if user_id != administrators[0]:
        await callback.answer("❌ У вас немає прав для додавання адміністраторів", show_alert=True)
        return
    
    await callback.message.edit_text(
        "➕ <b>Додавання адміністратора</b>\n\n"
        "Введіть ID користувача або username (з @ або без):\n\n"
        "<i>💡 Користувач повинен бути в базі даних бота</i>",
        parse_mode="HTML",
        reply_markup=get_cancel_keyboard()
    )
    await state.set_state(AdminManagement.waiting_for_admin_id)
    await callback.answer()


@router.message(IsSuperAdmin(), AdminManagement.waiting_for_admin_id)
async def process_admin_input(message: types.Message, state: FSMContext):
    user_id = message.from_user.id
    admin_input = message.text.strip()
    
    if admin_input.isdigit():
        admin_id = int(admin_input)
        admin_username = None
    else:
        admin_username = admin_input.lstrip('@')
        admin_id = None
    
    result = add_admin(admin_id, admin_username, user_id)
    
    if result == True:  
        if not admin_id and admin_username:
            admin_id = get_user_id_by_username(admin_username)
        
        if admin_id:
            admin_info = f"ID: {admin_id}"
            if admin_username:
                admin_info += f", Username: @{admin_username}"
        else:
            admin_info = f"Username: @{admin_username}"
        
        await message.answer(
            "✅ <b>Успішно</b>\n\n"
            f"Користувач {admin_info} доданий як адміністратор.",
            parse_mode="HTML"
        )
        
        if admin_id:
            try:
                await bot.send_message(
                    admin_id,
                    "🎉 <b>Вітаємо!</b>\n\n"
                    "Вам надано права адміністратора.\n"
                    "Тепер у вас є доступ до адмін-панелі.",
                    parse_mode="HTML",
                    reply_markup=admin_keyboard()
                )
            except Exception as e:
                pass
        
        admins = get_all_admins()
        await message.answer(
            "👑 <b>Список адміністраторів</b>\n\n"
            "Натисніть на адміністратора для перегляду інформації\n"
            "або на ❌ для видалення.",
            parse_mode="HTML",
            reply_markup=get_admin_list_keyboard(admins, True)
        )
    elif result == "not_found":
        await message.answer(
            "❌ <b>Помилка</b>\n\n"
            f"Користувач не знайдений в базі даних бота.\n\n"
            f"<i>Користувач повинен спочатку запустити бота командою /start</i>",
            parse_mode="HTML"
        )
        
        admins = get_all_admins()
        await message.answer(
            "👑 <b>Список адміністраторів</b>\n\n"
            "Натисніть на адміністратора для перегляду інформації\n"
            "або на ❌ для видалення.",
            parse_mode="HTML",
            reply_markup=get_admin_list_keyboard(admins, True)
        )
    elif result == "already_admin":
        await message.answer(
            "⚠️ <b>Увага</b>\n\n"
            f"Цей користувач вже є адміністратором.",
            parse_mode="HTML"
        )
        
        admins = get_all_admins()
        await message.answer(
            "👑 <b>Список адміністраторів</b>\n\n"
            "Натисніть на адміністратора для перегляду інформації\n"
            "або на ❌ для видалення.",
            parse_mode="HTML",
            reply_markup=get_admin_list_keyboard(admins, True)
        )
    else:
        await message.answer(
            "❌ <b>Помилка</b>\n\n"
            f"Не вдалося додати користувача як адміністратора.",
            parse_mode="HTML"
        )
        
        admins = get_all_admins()
        await message.answer(
            "👑 <b>Список адміністраторів</b>\n\n"
            "Натисніть на адміністратора для перегляду інформації\n"
            "або на ❌ для видалення.",
            parse_mode="HTML",
            reply_markup=get_admin_list_keyboard(admins, True)
        )
    
    await state.clear()

@router.callback_query(IsAdmin(), F.data.startswith("admin_info_"))
async def admin_info_callback(callback: types.CallbackQuery):
    admin_id = int(callback.data.split("_")[-1])
    admin_info_data = get_admin_info_by_id(admin_id)
    
    if not admin_info_data:
        await callback.answer("Адміністратор не знайдений", show_alert=True)
        return
    
    user_id = admin_info_data[0]
    username = admin_info_data[1]
    added_date = admin_info_data[2]
    is_super = admin_info_data[3] == 1
    added_by_id = admin_info_data[4]
    current_username = admin_info_data[5]
    
    display_username = current_username or username or "Без username"
    
    added_by_username = get_username_by_user_id(added_by_id)
    added_by = f"@{added_by_username}" if added_by_username else f"ID: {added_by_id}"
    
    admin_type = "👑 Суперадміністратор" if is_super else "👤 Адміністратор"
    
    admin_info = f"{admin_type}\n"
    admin_info += f"ID: {user_id}\n"
    admin_info += f"Username: @{display_username}\n"
    admin_info += f"Доданий: {added_date}\n"
    admin_info += f"Ким доданий: {added_by}"
    
    await callback.answer(admin_info, show_alert=True)

@router.callback_query(IsAdmin(), F.data.startswith("admin_remove_id_"))
async def admin_remove_by_button(callback: types.CallbackQuery):
    user_id = callback.from_user.id
    
    if user_id != administrators[0]:
        await callback.answer("❌ У вас немає прав для видалення адміністраторів", show_alert=True)
        return
    
    admin_id = int(callback.data.split("_")[-1])
    
    if is_superadmin(admin_id):
        await callback.answer("Ви не можете видалити суперадміністратора!", show_alert=True)
        return
    
    if remove_admin(admin_id):
        await callback.answer("Адміністратор успішно видалений", show_alert=True)
        
        try:
            await bot.send_message(
                admin_id,
                "⚠️ <b>Увага!</b>\n\n"
                "Ваші права адміністратора було знято.\n"
                "Дякуємо за вашу роботу.",
                parse_mode="HTML",
                reply_markup=types.ReplyKeyboardRemove()
            )
        except Exception as e:
            pass
        
        admins = get_all_admins()
        is_super = True
        
        if not admins:
            await callback.message.edit_text(
                "👑 <b>Список адміністраторів</b>\n\n"
                "Немає зареєстрованих адміністраторів.",
                parse_mode="HTML",
                reply_markup=get_admin_list_keyboard([], is_super)
            )
            return
        
        await callback.message.edit_text(
            "👑 <b>Список адміністраторів</b>\n\n"
            "Натисніть на адміністратора для перегляду інформації\n"
            "або на ❌ для видалення.",
            parse_mode="HTML",
            reply_markup=get_admin_list_keyboard(admins, is_super)
        )
    else:
        await callback.answer("Не вдалося видалити адміністратора", show_alert=True)

@router.callback_query(IsAdmin(), F.data == "admin_cancel")
async def admin_cancel_callback(callback: types.CallbackQuery, state: FSMContext):
    user_id = callback.from_user.id
    is_super = user_id == administrators[0]
    
    current_state = await state.get_state()
    if current_state and current_state.startswith("AdminManagement"):
        await state.clear()
    
    admins = get_all_admins()
    
    if not admins:
        await callback.message.edit_text(
            "👑 <b>Список адміністраторів</b>\n\n"
            "Немає зареєстрованих адміністраторів.",
            parse_mode="HTML",
            reply_markup=get_admin_list_keyboard([], is_super)
        )
    else:
        admins_text = "👑 <b>Список адміністраторів</b>\n\n"
        
        if is_super:
            admins_text += "Натисніть на адміністратора для перегляду інформації\n"
            admins_text += "або на ❌ для видалення."
        else:
            admins_text += "Натисніть на адміністратора для перегляду інформації."
        
        await callback.message.edit_text(
            admins_text,
            parse_mode="HTML",
            reply_markup=get_admin_list_keyboard(admins, is_super)
        )
    
    await callback.answer()