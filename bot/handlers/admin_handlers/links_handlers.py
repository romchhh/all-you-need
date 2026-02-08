from aiogram import Router, types, F
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton
from aiogram.exceptions import TelegramBadRequest
from utils.filters import IsAdmin
from aiogram.fsm.context import FSMContext
from keyboards.admin_keyboards import get_links_keyboard, cancel_button, admin_keyboard, get_link_stats_keyboard, get_delete_link_confirm_keyboard
from database_functions.links_db import get_link_by_id, update_link_name, delete_link, add_link, get_link_detailed_stats, get_visits_by_link, get_all_ref_stats
from main import bot
from config import bot_username
from states.admin_states import LinkStates


router = Router()


@router.message(IsAdmin(), lambda message: message.text == "Посилання")
async def manage_links(message: types.Message):
    await message.answer("Оберіть посилання для перегляду статистики або додайте нове:", 
                        reply_markup=get_links_keyboard())


@router.callback_query(IsAdmin(), F.data.startswith("link_stats_"))
async def show_link_stats(callback: types.CallbackQuery):
    link_id = int(callback.data.split("_")[2])
    link_data = get_link_by_id(link_id)
    if link_data:
        link_name, link_url = link_data
        username = bot_username or (await bot.get_me()).username
        bot_link = f"https://t.me/{username}?start=linktowatch_{link_id}"

        detailed_stats = get_link_detailed_stats()
        visits_count = 0
        
        for stat in detailed_stats:
            if stat[0] == link_id:  # stat[0] - це id
                visits_count = stat[2]  # stat[2] - це link_count (переходи)
                break
        
        visits_list = get_visits_by_link(link_id)
        visits_detail = "\n".join([f"  • <a href=\"tg://user?id={v[0]}\">ID {v[0]}</a> — {v[1][:16]}" for v in visits_list[:10]]) if visits_list else "  (немає записів)"
        if visits_list and len(visits_list) > 10:
            visits_detail += f"\n  ... та ще {len(visits_list) - 10}"

        try:
            await callback.message.edit_text(
                f"<b>📊 Статистика посилання:</b>\n"
                f"Назва: {link_name}\n"
                f"Посилання: <code>{bot_link}</code>\n\n"
                f"<b>📈 Метрики:</b>\n"
                f"• Переходів в бот: {visits_count}\n\n"
                f"<b>Хто перейшов (останні):</b>\n{visits_detail}\n\n"
                f"Скопіюйте посилання для розповсюдження",
                parse_mode="HTML",
                reply_markup=get_link_stats_keyboard(link_id)
            )
        except TelegramBadRequest:
            await callback.answer("✅ Статистика оновлена", show_alert=False)
            return
    await callback.answer()


@router.callback_query(IsAdmin(), F.data.startswith("edit_link_"))
async def edit_link_start(callback: types.CallbackQuery, state: FSMContext):
    link_id = int(callback.data.split("_")[2])
    await state.update_data(edit_link_id=link_id)
    await callback.message.answer("Введіть нову назву для посилання:", reply_markup=cancel_button())
    await state.set_state(LinkStates.waiting_for_edit_name)
    await callback.answer()


@router.message(IsAdmin(), LinkStates.waiting_for_edit_name)
async def process_edit_link(message: types.Message, state: FSMContext):
    if message.text == "Скасувати":
        await state.clear()
        await message.answer("Відміна", reply_markup=admin_keyboard())
        await manage_links(message)
        return
    
    data = await state.get_data()
    link_id = data['edit_link_id']
    new_name = message.text
    
    update_link_name(link_id, new_name)

    await message.answer(
        "✅ Назву посилання успішно змінено!\n\n",
        reply_markup=admin_keyboard()
    )

    await message.answer(
        "Оберіть посилання для перегляду статистики або додайте нове:",
        reply_markup=get_links_keyboard()
    )
    await state.clear()


@router.callback_query(IsAdmin(), F.data.startswith("delete_link_"))
async def delete_link_confirm(callback: types.CallbackQuery):
    link_id = int(callback.data.split("_")[2])
    await callback.message.edit_text(
        "❗️ Ви впевнені, що хочете видалити це посилання?\n"
        "Цю дію неможливо відмінити.",
        reply_markup=get_delete_link_confirm_keyboard(link_id)
    )
    await callback.answer()


@router.callback_query(IsAdmin(), F.data.startswith("confirm_delete_"))
async def delete_link_process(callback: types.CallbackQuery):
    link_id = int(callback.data.split("_")[2])
    delete_link(link_id)
    
    await callback.message.edit_text(
        "✅ Посилання успішно видалено!\n\n"
        "Оберіть посилання для перегляду статистики або додайте нове:",
        reply_markup=get_links_keyboard()
    )
    await callback.answer()


@router.callback_query(IsAdmin(), F.data == "ref_traffic_stats")
async def show_ref_traffic_stats(callback: types.CallbackQuery):
    ref_stats = get_all_ref_stats()
    if not ref_stats:
        text = (
            "<b>📊 Реферальний трафік</b>\n\n"
            "Поки немає кліків по реферальних посиланнях.\n"
            "Користувачі діляться посиланням t.me/bot?start=ref_ID"
        )
    else:
        lines = []
        for referrer_id, clicks, converted in ref_stats[:20]:
            lines.append(f"• ID {referrer_id}: {clicks} кліків, {converted} зареєструвались")
        text = (
            "<b>📊 Реферальний трафік</b>\n\n"
            "Кліки та реєстрації по ref-посиланнях:\n\n"
            + "\n".join(lines)
        )
        if len(ref_stats) > 20:
            text += f"\n\n... та ще {len(ref_stats) - 20} реферерів"
    try:
        await callback.message.edit_text(
            text,
            parse_mode="HTML",
            reply_markup=InlineKeyboardMarkup(inline_keyboard=[
                [InlineKeyboardButton(text="◀️ Назад", callback_data="back_to_links")]
            ])
        )
    except TelegramBadRequest:
        await callback.message.answer(text, parse_mode="HTML", reply_markup=InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="◀️ Назад", callback_data="back_to_links")]
        ]))
    await callback.answer()


@router.callback_query(IsAdmin(), F.data == "back_to_links")
async def back_to_links(callback: types.CallbackQuery):
    await callback.message.edit_text(
        "Оберіть посилання для перегляду статистики або додайте нове:",
        reply_markup=get_links_keyboard()
    )
    await callback.answer()


@router.callback_query(IsAdmin(), F.data == "add_link")
async def start_add_link(callback: types.CallbackQuery, state: FSMContext):
    await callback.message.answer("Введіть назву для нового посилання:", reply_markup=cancel_button())
    await state.set_state(LinkStates.waiting_for_name)
    await callback.answer()


@router.message(IsAdmin(), LinkStates.waiting_for_name)
async def process_link_name(message: types.Message, state: FSMContext):
    if message.text == "Скасувати":
        await state.clear()
        await message.answer("Відміна", reply_markup=admin_keyboard())
        await manage_links(message)
        return
    
    link_name = message.text
    username = bot_username or (await bot.get_me()).username
    
    link_id = add_link(link_name)
    bot_link = f"https://t.me/{username}?start=linktowatch_{link_id}"

    await message.answer(
        f"✅ Посилання успішно створено!\n\n",
        reply_markup=admin_keyboard()
    )
    
    await message.answer(
        f"Назва: {link_name}\n"
        f"Посилання: {bot_link}\n\n"
        f"Скопіюйте це посилання для розповсюдження\n\n"
        f"Оберіть посилання для перегляду статистики або додайте нове:",
        reply_markup=get_links_keyboard()
    )
    await state.clear()