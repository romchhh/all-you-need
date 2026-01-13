import os
from aiogram import Router, types, F
from utils.translations import t
from keyboards.client_keyboards import get_about_us_keyboard, get_about_us_back_keyboard, get_about_us_rules_keyboard

router = Router()


@router.message(F.text.in_([
    "ℹ️ Про нас",  # UK
    "ℹ️ О нас"     # RU
]))
async def about_us_handler(message: types.Message):
    user_id = message.from_user.id
    
    about_text = (
        t(user_id, 'about_us.title') +
        t(user_id, 'about_us.description')
    )
    
    await message.answer(
        about_text,
        reply_markup=get_about_us_keyboard(user_id),
        parse_mode="HTML"
    )


@router.callback_query(F.data == "about_us_main")
async def about_us_main_callback(callback: types.CallbackQuery):
    user_id = callback.from_user.id
    
    about_text = (
        t(user_id, 'about_us.title') +
        t(user_id, 'about_us.description')
    )
    
    await callback.message.edit_text(
        about_text,
        reply_markup=get_about_us_keyboard(user_id),
        parse_mode="HTML"
    )
    await callback.answer()


@router.callback_query(F.data == "about_tariffs")
async def about_tariffs_callback(callback: types.CallbackQuery):
    user_id = callback.from_user.id
    
    tariffs_text = t(user_id, 'about_us.tariffs_text')
    
    await callback.message.edit_text(
        tariffs_text,
        reply_markup=get_about_us_back_keyboard(user_id),
        parse_mode="HTML"
    )
    await callback.answer()


@router.callback_query(F.data == "about_faq")
async def about_faq_callback(callback: types.CallbackQuery):
    user_id = callback.from_user.id
    
    faq_text = t(user_id, 'about_us.faq_text')
    
    await callback.message.edit_text(
        faq_text,
        reply_markup=get_about_us_back_keyboard(user_id),
        parse_mode="HTML"
    )
    await callback.answer()


@router.callback_query(F.data == "about_instructions")
async def about_instructions_callback(callback: types.CallbackQuery):
    user_id = callback.from_user.id
    
    instructions_text = t(user_id, 'about_us.instructions_text')
    
    await callback.message.edit_text(
        instructions_text,
        reply_markup=get_about_us_back_keyboard(user_id),
        parse_mode="HTML"
    )
    await callback.answer()


@router.callback_query(F.data == "about_rules")
async def about_rules_callback(callback: types.CallbackQuery):
    user_id = callback.from_user.id
    
    rules_text = t(user_id, 'about_us.rules_text')
    
    await callback.message.edit_text(
        rules_text,
        reply_markup=get_about_us_rules_keyboard(user_id),
        parse_mode="HTML"
    )
    await callback.answer()
