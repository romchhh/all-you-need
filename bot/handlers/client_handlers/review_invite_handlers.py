"""Callback: «Не користувався послугами» після invite на відгук."""

from __future__ import annotations

import logging

from aiogram import F, Router
from aiogram.types import CallbackQuery

from database_functions.db_connection import get_connection, is_postgres
from utils.telegram_context import user_id_from_callback

logger = logging.getLogger(__name__)
router = Router()


@router.callback_query(F.data.startswith("review_invite_skip:"))
async def on_review_invite_skip(callback: CallbackQuery):
    user_id = user_id_from_callback(callback)
    raw = (callback.data or "").split(":", 1)[-1]
    try:
        invite_id = int(raw)
    except ValueError:
        await callback.answer()
        return

    conn = None
    try:
        conn = get_connection()
        cur = conn.cursor()
        if is_postgres():
            cur.execute(
                """
                UPDATE "BusinessReviewInvite" bri
                SET status = 'declined', "updatedAt" = NOW()
                FROM "User" u
                WHERE bri.id = %s
                  AND bri."viewerUserId" = u.id
                  AND CAST(u."telegramId" AS TEXT) = %s
                  AND bri.status IN ('pending', 'sent')
                """,
                (invite_id, str(user_id)),
            )
        else:
            cur.execute(
                """
                UPDATE BusinessReviewInvite
                SET status = 'declined', updatedAt = datetime('now')
                WHERE id = ?
                  AND viewerUserId = (
                    SELECT id FROM User WHERE CAST(telegramId AS TEXT) = ?
                  )
                  AND status IN ('pending', 'sent')
                """,
                (invite_id, str(user_id)),
            )
        conn.commit()
        cur.close()
    except Exception:
        logger.exception("review_invite_skip failed id=%s user=%s", invite_id, user_id)
        try:
            await callback.answer("Error", show_alert=True)
        except Exception:
            pass
        return
    finally:
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass

    try:
        await callback.answer("OK")
        if callback.message:
            await callback.message.edit_reply_markup(reply_markup=None)
    except Exception:
        pass
