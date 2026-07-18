"""Адмін-панель: Pyrogram-акаунти парсера (CRUD + авторизація сесії)."""

from __future__ import annotations

import logging
import time
from datetime import datetime
from pathlib import Path

from aiogram import F, Router, types
from aiogram.exceptions import TelegramBadRequest
from aiogram.fsm.context import FSMContext

from keyboards.admin_keyboards import (
    admin_keyboard,
    cancel_button,
    get_parser_account_delete_confirm_keyboard,
    get_parser_account_detail_keyboard,
    get_parser_accounts_keyboard,
)
from parser.storage import parser_accounts_db as accounts_db
from states.admin_states import ParserAccountStates
from utils.filters import IsAdmin

router = Router()
logger = logging.getLogger(__name__)


def _fmt_ts(ts: float) -> str:
    if not ts:
        return "—"
    try:
        return datetime.fromtimestamp(float(ts)).strftime("%d.%m.%Y %H:%M")
    except Exception:
        return "—"


def _account_detail_text(acc: dict) -> str:
    status = (acc.get("status") or "active").lower()
    enabled = "так" if int(acc.get("enabled") or 0) else "ні"
    uname = (acc.get("username") or "").lstrip("@")
    uname_disp = f"@{uname}" if uname else "—"
    flood = float(acc.get("flood_until") or 0)
    flood_line = ""
    if flood > time.time():
        flood_line = f"\n⏳ Flood до: <b>{_fmt_ts(flood)}</b>"

    session_name = acc.get("session_name") or ""
    session_file = accounts_db.session_path_for(session_name)
    session_ok = Path(f"{session_file}.session").is_file()

    return (
        f"<b>Акаунт #{acc['id']}</b>\n\n"
        f"📱 Телефон: <code>{acc.get('phone') or '—'}</code>\n"
        f"👤 Username: {uname_disp}\n"
        f"🆔 Telegram ID: <code>{acc.get('telegram_id') or '—'}</code>\n"
        f"🔑 API ID: <code>{acc.get('api_id') or '—'}</code>\n"
        f"💾 Сесія: <code>{session_name}</code> "
        f"{'✅' if session_ok else '❌ немає файлу'}\n"
        f"📶 Статус: <b>{status}</b> | увімкнено: {enabled}"
        f"{flood_line}\n"
        f"⚠️ Остання помилка: <code>{(acc.get('last_error') or '—')[:200]}</code>\n\n"
        f"<b>Статистика</b>\n"
        f"• Парсинг: запусків {acc.get('parse_runs') or 0}, "
        f"ok {acc.get('parse_ok') or 0}, err {acc.get('parse_errors') or 0}\n"
        f"• DM авторам: надіслано {acc.get('dm_sent') or 0}, "
        f"помилок {acc.get('dm_errors') or 0}\n"
        f"• Останній парсинг: {_fmt_ts(acc.get('last_parse_at') or 0)}\n"
        f"• Останній DM: {_fmt_ts(acc.get('last_dm_at') or 0)}\n"
        f"• Створено: {_fmt_ts(acc.get('created_at') or 0)}"
    )


async def _show_accounts_list(target: types.Message | types.CallbackQuery) -> None:
    accounts_db.ensure_parser_accounts_table()
    accounts_db.migrate_env_accounts_if_empty()
    accounts = accounts_db.list_accounts()
    text = (
        "<b>Парсер акаунти</b>\n\n"
        f"Усього: <b>{len(accounts)}</b>\n"
        "Парсинг і DM авторам йдуть по черзі (round-robin).\n\n"
        "Оберіть акаунт або додайте новий:"
    )
    kb = get_parser_accounts_keyboard(accounts)
    if isinstance(target, types.CallbackQuery):
        try:
            await target.message.edit_text(text, parse_mode="HTML", reply_markup=kb)
        except TelegramBadRequest:
            await target.message.answer(text, parse_mode="HTML", reply_markup=kb)
        await target.answer()
    else:
        await target.answer(text, parse_mode="HTML", reply_markup=kb)


@router.message(IsAdmin(), F.text.in_(["Парсер акаунти"]))
async def parser_accounts_menu(message: types.Message, state: FSMContext):
    await state.clear()
    await _show_accounts_list(message)


@router.callback_query(IsAdmin(), F.data == "parser_acc_list")
async def parser_accounts_list_cb(callback: types.CallbackQuery, state: FSMContext):
    await state.clear()
    await _show_accounts_list(callback)


@router.callback_query(IsAdmin(), F.data.startswith("parser_acc_info_"))
async def parser_account_info(callback: types.CallbackQuery):
    account_id = int(callback.data.rsplit("_", 1)[-1])
    acc = accounts_db.get_account(account_id)
    if not acc:
        await callback.answer("Акаунт не знайдено", show_alert=True)
        return
    try:
        await callback.message.edit_text(
            _account_detail_text(acc),
            parse_mode="HTML",
            reply_markup=get_parser_account_detail_keyboard(account_id),
        )
    except TelegramBadRequest:
        pass
    await callback.answer()


@router.callback_query(IsAdmin(), F.data.startswith("pacc_delask_"))
async def parser_account_delete_ask(callback: types.CallbackQuery):
    account_id = int(callback.data.rsplit("_", 1)[-1])
    acc = accounts_db.get_account(account_id)
    if not acc:
        await callback.answer("Не знайдено", show_alert=True)
        return
    await callback.message.edit_text(
        f"Видалити акаунт <b>#{account_id}</b> "
        f"(<code>{acc.get('phone')}</code>) і файл сесії?",
        parse_mode="HTML",
        reply_markup=get_parser_account_delete_confirm_keyboard(account_id),
    )
    await callback.answer()


@router.callback_query(IsAdmin(), F.data.startswith("pacc_delok_"))
async def parser_account_delete_confirm(callback: types.CallbackQuery):
    account_id = int(callback.data.rsplit("_", 1)[-1])
    ok = accounts_db.delete_account(account_id)
    await callback.answer("Видалено" if ok else "Не знайдено", show_alert=True)
    await _show_accounts_list(callback)


# ── Add account FSM ───────────────────────────

@router.callback_query(IsAdmin(), F.data == "parser_acc_add")
async def parser_account_add_start(callback: types.CallbackQuery, state: FSMContext):
    await state.clear()
    await state.set_state(ParserAccountStates.waiting_api_id)
    await callback.message.answer(
        "<b>Додати акаунт парсера</b>\n\n"
        "1/4. Введіть <b>API_ID</b> з https://my.telegram.org\n"
        "(лише цифри)",
        parse_mode="HTML",
        reply_markup=cancel_button(),
    )
    await callback.answer()


@router.message(IsAdmin(), ParserAccountStates.waiting_api_id)
async def parser_acc_api_id(message: types.Message, state: FSMContext):
    if message.text == "Скасувати":
        await state.clear()
        await message.answer("Скасовано", reply_markup=admin_keyboard())
        await _show_accounts_list(message)
        return
    raw = (message.text or "").strip()
    if not raw.isdigit():
        await message.answer("❌ API_ID має бути числом. Спробуйте ще:")
        return
    await state.update_data(api_id=int(raw))
    await state.set_state(ParserAccountStates.waiting_api_hash)
    await message.answer("2/4. Введіть <b>API_HASH</b>:", parse_mode="HTML")


@router.message(IsAdmin(), ParserAccountStates.waiting_api_hash)
async def parser_acc_api_hash(message: types.Message, state: FSMContext):
    if message.text == "Скасувати":
        await state.clear()
        await message.answer("Скасовано", reply_markup=admin_keyboard())
        await _show_accounts_list(message)
        return
    api_hash = (message.text or "").strip()
    if len(api_hash) < 10:
        await message.answer("❌ Занадто короткий API_HASH. Спробуйте ще:")
        return
    await state.update_data(api_hash=api_hash)
    await state.set_state(ParserAccountStates.waiting_phone)
    await message.answer(
        "3/4. Введіть номер телефону у міжнародному форматі,\n"
        "наприклад <code>+491701234567</code>",
        parse_mode="HTML",
    )


@router.message(IsAdmin(), ParserAccountStates.waiting_phone)
async def parser_acc_phone(message: types.Message, state: FSMContext):
    if message.text == "Скасувати":
        await state.clear()
        await message.answer("Скасовано", reply_markup=admin_keyboard())
        await _show_accounts_list(message)
        return

    phone = (message.text or "").strip().replace(" ", "")
    if not phone.startswith("+") or len(phone) < 10:
        await message.answer("❌ Номер має починатися з + і містити код країни.")
        return

    data = await state.get_data()
    api_id = int(data["api_id"])
    api_hash = str(data["api_hash"])

    account_id = accounts_db.create_account(
        api_id=api_id,
        api_hash=api_hash,
        phone=phone,
        session_name=None,
    )
    acc = accounts_db.get_account(account_id)
    session_name = acc["session_name"]
    session_path = accounts_db.session_path_for(session_name)
    accounts_db.SESSIONS_DIR.mkdir(parents=True, exist_ok=True)

    await message.answer("⏳ Надсилаю код авторизації в Telegram…")

    try:
        from pyrogram import Client
    except ImportError:
        accounts_db.delete_account(account_id)
        await state.clear()
        await message.answer(
            "❌ Pyrogram не встановлено на сервері.",
            reply_markup=admin_keyboard(),
        )
        return

    client = Client(
        name=str(session_path),
        api_id=api_id,
        api_hash=api_hash,
        phone_number=phone,
        in_memory=False,
    )
    try:
        await client.connect()
        sent = await client.send_code(phone)
        phone_code_hash = sent.phone_code_hash
        await client.disconnect()
    except Exception as e:
        logger.exception("send_code failed: %s", e)
        try:
            await client.disconnect()
        except Exception:
            pass
        accounts_db.delete_account(account_id)
        await state.clear()
        await message.answer(
            f"❌ Не вдалося надіслати код: <code>{type(e).__name__}: {e}</code>",
            parse_mode="HTML",
            reply_markup=admin_keyboard(),
        )
        return

    await state.update_data(
        account_id=account_id,
        phone=phone,
        phone_code_hash=phone_code_hash,
        session_path=str(session_path),
    )
    await state.set_state(ParserAccountStates.waiting_code)
    await message.answer(
        "4/4. Введіть <b>код</b> з Telegram / SMS для цього номера:",
        parse_mode="HTML",
    )


@router.message(IsAdmin(), ParserAccountStates.waiting_code)
async def parser_acc_code(message: types.Message, state: FSMContext):
    if message.text == "Скасувати":
        data = await state.get_data()
        if data.get("account_id"):
            accounts_db.delete_account(int(data["account_id"]))
        await state.clear()
        await message.answer("Скасовано", reply_markup=admin_keyboard())
        await _show_accounts_list(message)
        return

    code = (message.text or "").strip().replace(" ", "")
    data = await state.get_data()
    account_id = int(data["account_id"])
    phone = data["phone"]
    phone_code_hash = data["phone_code_hash"]
    api_id = int(data["api_id"])
    api_hash = str(data["api_hash"])
    session_path = Path(data["session_path"])

    from pyrogram import Client
    from pyrogram.errors import (
        PhoneCodeExpired,
        PhoneCodeInvalid,
        SessionPasswordNeeded,
    )

    client = Client(
        name=str(session_path),
        api_id=api_id,
        api_hash=api_hash,
        phone_number=phone,
    )
    try:
        await client.connect()
        try:
            await client.sign_in(phone, phone_code_hash, code)
        except SessionPasswordNeeded:
            await client.disconnect()
            await state.set_state(ParserAccountStates.waiting_2fa)
            await message.answer(
                "🔐 Увімкнено 2FA. Введіть <b>пароль хмарної двофакторки</b>:",
                parse_mode="HTML",
            )
            return
        me = await client.get_me()
        await client.disconnect()
    except (PhoneCodeInvalid, PhoneCodeExpired) as e:
        try:
            await client.disconnect()
        except Exception:
            pass
        await message.answer(
            f"❌ Код невірний або протермінований ({type(e).__name__}). "
            "Введіть ще раз або натисніть «Скасувати»."
        )
        return
    except Exception as e:
        logger.exception("sign_in failed: %s", e)
        try:
            await client.disconnect()
        except Exception:
            pass
        accounts_db.delete_account(account_id)
        await state.clear()
        await message.answer(
            f"❌ Помилка авторизації: <code>{type(e).__name__}: {e}</code>",
            parse_mode="HTML",
            reply_markup=admin_keyboard(),
        )
        return

    await _finalize_account(message, state, account_id, me)


@router.message(IsAdmin(), ParserAccountStates.waiting_2fa)
async def parser_acc_2fa(message: types.Message, state: FSMContext):
    if message.text == "Скасувати":
        data = await state.get_data()
        if data.get("account_id"):
            accounts_db.delete_account(int(data["account_id"]))
        await state.clear()
        await message.answer("Скасовано", reply_markup=admin_keyboard())
        await _show_accounts_list(message)
        return

    password = message.text or ""
    data = await state.get_data()
    account_id = int(data["account_id"])
    phone = data["phone"]
    api_id = int(data["api_id"])
    api_hash = str(data["api_hash"])
    session_path = Path(data["session_path"])

    from pyrogram import Client
    from pyrogram.errors import PasswordHashInvalid

    client = Client(
        name=str(session_path),
        api_id=api_id,
        api_hash=api_hash,
        phone_number=phone,
    )
    try:
        await client.connect()
        await client.check_password(password)
        me = await client.get_me()
        await client.disconnect()
    except PasswordHashInvalid:
        try:
            await client.disconnect()
        except Exception:
            pass
        await message.answer("❌ Невірний пароль 2FA. Спробуйте ще:")
        return
    except Exception as e:
        logger.exception("2fa failed: %s", e)
        try:
            await client.disconnect()
        except Exception:
            pass
        accounts_db.delete_account(account_id)
        await state.clear()
        await message.answer(
            f"❌ Помилка 2FA: <code>{type(e).__name__}: {e}</code>",
            parse_mode="HTML",
            reply_markup=admin_keyboard(),
        )
        return

    await _finalize_account(message, state, account_id, me)


async def _finalize_account(message: types.Message, state: FSMContext, account_id: int, me) -> None:
    username = (me.username or "") if me else ""
    telegram_id = int(me.id) if me else 0
    accounts_db.update_account(
        account_id,
        telegram_id=telegram_id,
        username=username,
        status="active",
        enabled=1,
        last_error="",
    )
    await state.clear()
    await message.answer(
        f"✅ Акаунт <b>#{account_id}</b> додано і авторизовано.\n"
        f"User: {me.first_name or ''} @{username or '—'} "
        f"(id=<code>{telegram_id}</code>)\n\n"
        "Він уже бере участь у парсингу та DM (round-robin).",
        parse_mode="HTML",
        reply_markup=admin_keyboard(),
    )
    await _show_accounts_list(message)
