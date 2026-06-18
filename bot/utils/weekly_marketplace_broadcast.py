"""
Автоматична розсилка в бот — 2 рази на тиждень (середа та субота, час Europe/Berlin).
Повідомлення з ротацією + кнопка WebApp на маркетплейс + лог доставки.
"""

from __future__ import annotations

import asyncio
import logging
import os
import random
from datetime import datetime
from typing import Optional
from zoneinfo import ZoneInfo

from aiogram import Bot
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo

from database_functions.telegram_listing_db import get_connection
from utils.translations import get_user_lang, t

logger = logging.getLogger(__name__)

BERLIN_TZ = ZoneInfo("Europe/Berlin")

# Тексти розсилки (RU) — ротація по черзі
WEEKLY_BROADCAST_MESSAGES: list[str] = [
    (
        "Кто-то ищет электрика...\n"
        "Кто-то репетитора...\n"
        "Кто-то перевозчика...\n"
        "А что ищете вы?"
    ),
    (
        "В одном доме вещь пылится.\n"
        "В другом её давно ищут."
    ),
    (
        "Возможно, сегодня вы найдёте не вещь.\n"
        "А нужного человека."
    ),
    (
        "Не обязательно открывать фирму.\n"
        "Иногда достаточно начать с объявления."
    ),
    (
        "Свои люди.\n"
        "Понятный язык.\n"
        "Нужные услуги."
    ),
    (
        "То, что вам больше не нужно,\n"
        "может пригодиться кому-то другому."
    ),
    (
        "Кто-то ищет мастера.\n"
        "Кто-то ищет клиента.\n"
        "Хорошо, когда они находят друг друга."
    ),
    "Ваш опыт может быть кому-то очень полезен.",
    (
        "Кто-то ищет услугу.\n"
        "Кто-то готов помочь."
    ),
    "Помните чувство, когда заходишь на OLX на минутку?",
    (
        "Украинцы помогают украинцам каждый день.\n"
        "Иногда достаточно просто заглянуть."
    ),
    "Возможно, нужная вещь уже ждёт нового владельца.",
    "Освободить место и заработать одновременно?\nПочему нет.",
    "Иногда нужный специалист оказывается ближе, чем кажется.",
    "Возможно, нужная вещь уже есть в продаже.",
    (
        "Ваши навыки могут приносить доход.\n"
        "Главное, чтобы о них узнали."
    ),
    "Иногда нужная покупка стоит гораздо дешевле, чем вы думаете.",
    (
        "Хороший специалист нужен всегда.\n"
        "Главное — чтобы его нашли."
    ),
    (
        "Просто посмотреть.\n"
        "Именно так обычно всё начинается 🙂"
    ),
]


def is_weekly_broadcast_enabled() -> bool:
    raw = (os.getenv("WEEKLY_BROADCAST_ENABLED") or "1").strip().lower()
    return raw not in ("0", "false", "no", "off")


def _webapp_base() -> str:
    return (
        os.getenv("WEBAPP_URL") or os.getenv("NEXT_PUBLIC_BASE_URL") or "https://tradegrnd.com"
    ).rstrip("/")


def _ensure_tables(cursor) -> None:
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS WeeklyBroadcastState (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            nextMessageIndex INTEGER NOT NULL DEFAULT 0
        )
        """
    )
    cursor.execute(
        """
        INSERT OR IGNORE INTO WeeklyBroadcastState (id, nextMessageIndex)
        VALUES (1, 0)
        """
    )
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS WeeklyBroadcastLog (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            slotKey TEXT NOT NULL UNIQUE,
            dayOfWeek TEXT NOT NULL,
            messageIndex INTEGER NOT NULL,
            messagePreview TEXT NOT NULL,
            totalRecipients INTEGER NOT NULL DEFAULT 0,
            sentCount INTEGER NOT NULL DEFAULT 0,
            failedCount INTEGER NOT NULL DEFAULT 0,
            startedAt TEXT NOT NULL,
            finishedAt TEXT
        )
        """
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_weekly_broadcast_log_started ON WeeklyBroadcastLog(startedAt DESC)"
    )


def _get_active_recipient_ids() -> list[int]:
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT CAST(telegramId AS INTEGER)
            FROM User
            WHERE isActive = 1 AND telegramId IS NOT NULL
            """
        )
        return [int(row[0]) for row in cur.fetchall() if row[0]]
    finally:
        conn.close()


def _reserve_message_index() -> tuple[int, str]:
    conn = get_connection()
    try:
        cur = conn.cursor()
        _ensure_tables(cur)
        cur.execute("SELECT nextMessageIndex FROM WeeklyBroadcastState WHERE id = 1")
        row = cur.fetchone()
        index = int(row[0]) if row else 0
        if index < 0 or index >= len(WEEKLY_BROADCAST_MESSAGES):
            index = 0
        text = WEEKLY_BROADCAST_MESSAGES[index]
        next_index = (index + 1) % len(WEEKLY_BROADCAST_MESSAGES)
        cur.execute(
            "UPDATE WeeklyBroadcastState SET nextMessageIndex = ? WHERE id = 1",
            (next_index,),
        )
        conn.commit()
        return index, text
    finally:
        conn.close()


def _slot_taken(slot_key: str) -> bool:
    conn = get_connection()
    try:
        cur = conn.cursor()
        _ensure_tables(cur)
        cur.execute("SELECT 1 FROM WeeklyBroadcastLog WHERE slotKey = ?", (slot_key,))
        return cur.fetchone() is not None
    finally:
        conn.close()


def _create_log_row(
    slot_key: str,
    day_of_week: str,
    message_index: int,
    message_preview: str,
    total_recipients: int,
) -> int:
    conn = get_connection()
    try:
        cur = conn.cursor()
        _ensure_tables(cur)
        started = datetime.now(BERLIN_TZ).isoformat()
        cur.execute(
            """
            INSERT OR IGNORE INTO WeeklyBroadcastLog (
                slotKey, dayOfWeek, messageIndex, messagePreview,
                totalRecipients, sentCount, failedCount, startedAt
            ) VALUES (?, ?, ?, ?, ?, 0, 0, ?)
            """,
            (slot_key, day_of_week, message_index, message_preview[:200], total_recipients, started),
        )
        conn.commit()
        cur.execute("SELECT id FROM WeeklyBroadcastLog WHERE slotKey = ?", (slot_key,))
        row = cur.fetchone()
        return int(row[0]) if row else 0
    finally:
        conn.close()


def _finish_log_row(log_id: int, sent: int, failed: int) -> None:
    if not log_id:
        return
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            UPDATE WeeklyBroadcastLog
            SET sentCount = ?, failedCount = ?, finishedAt = ?
            WHERE id = ?
            """,
            (sent, failed, datetime.now(BERLIN_TZ).isoformat(), log_id),
        )
        conn.commit()
    finally:
        conn.close()


def _marketplace_keyboard(telegram_id: int) -> InlineKeyboardMarkup:
    lang = get_user_lang(telegram_id)
    url = f"{_webapp_base()}/{lang}/bazaar?telegramId={telegram_id}"
    label = t(telegram_id, "weekly_broadcast.open_marketplace")
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text=label, web_app=WebAppInfo(url=url))]
        ]
    )


async def send_weekly_marketplace_broadcast(bot: Bot, day_of_week: str) -> dict:
    """
    day_of_week: 'wed' | 'sat'
  """
    now_berlin = datetime.now(BERLIN_TZ)
    slot_key = f"{now_berlin.date().isoformat()}-{day_of_week}"

    if _slot_taken(slot_key):
        logger.info("[weekly_broadcast] slot already taken: %s", slot_key)
        return {"skipped": True, "slotKey": slot_key}

    message_index, text = _reserve_message_index()
    recipients = _get_active_recipient_ids()
    log_id = _create_log_row(
        slot_key,
        day_of_week,
        message_index,
        text.replace("\n", " ")[:200],
        len(recipients),
    )

    if not log_id:
        if _slot_taken(slot_key):
            return {"skipped": True, "slotKey": slot_key}
        logger.warning("[weekly_broadcast] failed to create log for %s", slot_key)
        return {"skipped": True, "slotKey": slot_key, "error": "log_create_failed"}

    sent = 0
    failed = 0
    delay_sec = float(os.getenv("WEEKLY_BROADCAST_SEND_DELAY_SEC") or "0.05")

    for telegram_id in recipients:
        try:
            await bot.send_message(
                chat_id=telegram_id,
                text=text,
                reply_markup=_marketplace_keyboard(telegram_id),
                disable_web_page_preview=True,
            )
            sent += 1
        except Exception as e:
            failed += 1
            logger.debug("[weekly_broadcast] send failed %s: %s", telegram_id, e)
        if delay_sec > 0:
            await asyncio.sleep(delay_sec)

    _finish_log_row(log_id, sent, failed)

    result = {
        "slotKey": slot_key,
        "messageIndex": message_index,
        "totalRecipients": len(recipients),
        "sentCount": sent,
        "failedCount": failed,
    }
    logger.info("[weekly_broadcast] done %s", result)

    if (os.getenv("WEEKLY_BROADCAST_NOTIFY_ADMINS") or "1").strip().lower() not in (
        "0",
        "false",
        "no",
    ):
        await _notify_admins(bot, result, text)

    return result


async def _notify_admins(bot: Bot, result: dict, text: str) -> None:
    from config import administrators

    preview = text if len(text) <= 120 else text[:117] + "..."
    body = (
        "📬 <b>Авто-розсилка маркетплейсу</b>\n\n"
        f"🗓 Слот: <code>{result.get('slotKey')}</code>\n"
        f"📝 Текст №{result.get('messageIndex', 0) + 1}\n"
        f"<i>{preview}</i>\n\n"
        f"👥 Одержувачів: <b>{result.get('totalRecipients', 0)}</b>\n"
        f"✅ Доставлено: <b>{result.get('sentCount', 0)}</b>\n"
        f"❌ Помилки: <b>{result.get('failedCount', 0)}</b>"
    )
    for admin_id in administrators:
        try:
            await bot.send_message(admin_id, body, parse_mode="HTML")
        except Exception as e:
            logger.warning("[weekly_broadcast] admin notify %s: %s", admin_id, e)


async def _run_with_window_delay(bot: Bot, day_of_week: str, window_hours: float) -> None:
    """Запуск на початку вікна + випадкова затримка всередині інтервалу (2 год)."""
    if not is_weekly_broadcast_enabled():
        return
    max_delay = int(window_hours * 3600)
    if max_delay > 0:
        delay = random.randint(0, max_delay)
        logger.info("[weekly_broadcast] %s: sleep %ss before send", day_of_week, delay)
        await asyncio.sleep(delay)
    await send_weekly_marketplace_broadcast(bot, day_of_week)


DAY_LABELS = {"wed": "Ср", "sat": "Сб"}
BROADCAST_STATS_PAGE_SIZE = 8


def _format_finished_at(iso_ts: str | None) -> str:
    if not iso_ts:
        return "—"
    try:
        dt = datetime.fromisoformat(iso_ts.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=BERLIN_TZ)
        else:
            dt = dt.astimezone(BERLIN_TZ)
        return dt.strftime("%d.%m.%Y %H:%M")
    except ValueError:
        return (iso_ts or "")[:16].replace("T", " ")


def _delivery_rate(sent: int, total: int) -> float:
    if total <= 0:
        return 0.0
    return sent / total * 100


def get_weekly_broadcast_summary() -> dict:
    conn = get_connection()
    try:
        cur = conn.cursor()
        _ensure_tables(cur)
        cur.execute(
            """
            SELECT
                COUNT(*) AS runs,
                COALESCE(SUM(sentCount), 0) AS total_sent,
                COALESCE(SUM(failedCount), 0) AS total_failed,
                COALESCE(SUM(totalRecipients), 0) AS total_attempts
            FROM WeeklyBroadcastLog
            WHERE finishedAt IS NOT NULL
            """
        )
        row = cur.fetchone()
        runs = int(row[0] or 0)
        total_sent = int(row[1] or 0)
        total_failed = int(row[2] or 0)
        total_attempts = int(row[3] or 0)

        cur.execute("SELECT nextMessageIndex FROM WeeklyBroadcastState WHERE id = 1")
        state_row = cur.fetchone()
        next_index = int(state_row[0]) if state_row else 0
        if next_index < 0 or next_index >= len(WEEKLY_BROADCAST_MESSAGES):
            next_index = 0
    finally:
        conn.close()

    active_recipients = len(_get_active_recipient_ids())
    wed_hour = int(os.getenv("WEEKLY_BROADCAST_WED_HOUR") or "18")
    wed_minute = int(os.getenv("WEEKLY_BROADCAST_WED_MINUTE") or "0")
    sat_hour = int(os.getenv("WEEKLY_BROADCAST_SAT_HOUR") or "11")
    sat_minute = int(os.getenv("WEEKLY_BROADCAST_SAT_MINUTE") or "0")
    enabled = is_weekly_broadcast_enabled()

    return {
        "runs": runs,
        "total_sent": total_sent,
        "total_failed": total_failed,
        "total_attempts": total_attempts,
        "avg_delivery_rate": _delivery_rate(total_sent, total_attempts),
        "active_recipients": active_recipients,
        "next_message_index": next_index,
        "message_variants": len(WEEKLY_BROADCAST_MESSAGES),
        "enabled": enabled,
        "schedule": (
            f"Ср {wed_hour:02d}:{wed_minute:02d}–{wed_hour + 2:02d}:{wed_minute:02d}, "
            f"Сб {sat_hour:02d}:{sat_minute:02d}–{sat_hour + 2:02d}:{sat_minute:02d} "
            f"(Europe/Berlin)"
        ),
    }


def get_weekly_broadcast_logs(limit: int = 8, offset: int = 0) -> tuple[list[dict], int]:
    conn = get_connection()
    try:
        cur = conn.cursor()
        _ensure_tables(cur)
        cur.execute(
            "SELECT COUNT(*) FROM WeeklyBroadcastLog WHERE finishedAt IS NOT NULL"
        )
        total = int(cur.fetchone()[0] or 0)
        cur.execute(
            """
            SELECT slotKey, dayOfWeek, messageIndex, messagePreview,
                   sentCount, failedCount, totalRecipients, startedAt, finishedAt
            FROM WeeklyBroadcastLog
            WHERE finishedAt IS NOT NULL
            ORDER BY finishedAt DESC
            LIMIT ? OFFSET ?
            """,
            (limit, offset),
        )
        rows = cur.fetchall()
    finally:
        conn.close()

    logs: list[dict] = []
    for row in rows:
        slot_key, dow, msg_idx, preview, sent, failed, total, started, finished = row
        logs.append(
            {
                "slot_key": slot_key,
                "day_of_week": dow,
                "day_label": DAY_LABELS.get(dow, dow),
                "message_index": int(msg_idx),
                "message_preview": preview or "",
                "sent_count": int(sent or 0),
                "failed_count": int(failed or 0),
                "total_recipients": int(total or 0),
                "started_at": started,
                "finished_at": finished,
                "delivery_rate": _delivery_rate(int(sent or 0), int(total or 0)),
            }
        )
    return logs, total


def format_broadcast_stats_message(page: int = 0, per_page: int = BROADCAST_STATS_PAGE_SIZE) -> str:
    summary = get_weekly_broadcast_summary()
    offset = max(0, page) * per_page
    logs, total_logs = get_weekly_broadcast_logs(limit=per_page, offset=offset)
    total_pages = max(1, (total_logs + per_page - 1) // per_page)
    page = min(max(0, page), total_pages - 1)

    status = "✅ увімкнено" if summary["enabled"] else "⏸ вимкнено"
    lines = [
        "<b>📬 СТАТИСТИКА АВТО-РОЗСИЛОК</b>",
        "",
        f"<b>⚙️ Розклад:</b> {summary['schedule']}",
        f"<b>Статус:</b> {status}",
        f"<b>👥 Активних одержувачів зараз:</b> {summary['active_recipients']}",
        (
            f"<b>📝 Варіантів тексту:</b> {summary['message_variants']} "
            f"(наступний: №{summary['next_message_index'] + 1})"
        ),
        "",
        "<b>📊 Загалом (за весь час)</b>",
        f"• Розсилок проведено: <b>{summary['runs']}</b>",
        f"• Доставлено: <b>{summary['total_sent']}</b>",
        f"• Помилок: <b>{summary['total_failed']}</b>",
        f"• Середня доставка: <b>{summary['avg_delivery_rate']:.1f}%</b>",
        "",
    ]

    if not logs:
        lines.append("<i>Ще не було жодної авто-розсилки.</i>")
    else:
        lines.append(f"<b>📋 Історія</b> (стор. {page + 1}/{total_pages})")
        for idx, log in enumerate(logs, start=offset + 1):
            preview = (log["message_preview"] or "").replace("\n", " ")
            if len(preview) > 70:
                preview = preview[:67] + "..."
            lines.extend(
                [
                    "",
                    (
                        f"<b>{idx}.</b> {_format_finished_at(log['finished_at'])} "
                        f"({log['day_label']}) — текст №{log['message_index'] + 1}"
                    ),
                    (
                        f"   👥 {log['total_recipients']} → "
                        f"✅ <b>{log['sent_count']}</b> | "
                        f"❌ {log['failed_count']} "
                        f"({log['delivery_rate']:.1f}%)"
                    ),
                    f"   <i>{preview}</i>",
                ]
            )

    lines.append("")
    lines.append(f"<i>📅 Оновлено: {datetime.now(BERLIN_TZ).strftime('%d.%m.%Y %H:%M')}</i>")
    return "\n".join(lines)


def get_broadcast_stats_total_pages(per_page: int = BROADCAST_STATS_PAGE_SIZE) -> int:
    _, total = get_weekly_broadcast_logs(limit=1, offset=0)
    return max(1, (total + per_page - 1) // per_page)


def get_weekly_broadcast_stats_text(limit: int = 5) -> str:
    logs, _ = get_weekly_broadcast_logs(limit=limit, offset=0)
    if not logs:
        return "   Ще не було авто-розсилок\n"

    lines = []
    for log in logs:
        finished_short = _format_finished_at(log["finished_at"])
        lines.append(
            f"   • {finished_short} ({log['day_label']}) — "
            f"текст №{log['message_index'] + 1}: "
            f"<b>{log['sent_count']}</b>/{log['total_recipients']} "
            f"(помилок: {log['failed_count']})"
        )
    return "\n".join(lines) + "\n"


def register_weekly_broadcast_jobs(scheduler, bot: Bot) -> None:
    if not is_weekly_broadcast_enabled():
        print("ℹ️ Weekly marketplace broadcast вимкнено (WEEKLY_BROADCAST_ENABLED=0)")
        return

    wed_hour = int(os.getenv("WEEKLY_BROADCAST_WED_HOUR") or "18")
    wed_minute = int(os.getenv("WEEKLY_BROADCAST_WED_MINUTE") or "0")
    sat_hour = int(os.getenv("WEEKLY_BROADCAST_SAT_HOUR") or "11")
    sat_minute = int(os.getenv("WEEKLY_BROADCAST_SAT_MINUTE") or "0")

    scheduler.add_job(
        _run_with_window_delay,
        "cron",
        day_of_week="wed",
        hour=wed_hour,
        minute=wed_minute,
        timezone=BERLIN_TZ,
        id="weekly_marketplace_broadcast_wed",
        replace_existing=True,
        max_instances=1,
        kwargs={"bot": bot, "day_of_week": "wed", "window_hours": 2.0},
    )
    scheduler.add_job(
        _run_with_window_delay,
        "cron",
        day_of_week="sat",
        hour=sat_hour,
        minute=sat_minute,
        timezone=BERLIN_TZ,
        id="weekly_marketplace_broadcast_sat",
        replace_existing=True,
        max_instances=1,
        kwargs={"bot": bot, "day_of_week": "sat", "window_hours": 2.0},
    )
    print(
        f"✅ Weekly broadcast: Ср {wed_hour:02d}:{wed_minute:02d}–"
        f"{wed_hour + 2:02d}:{wed_minute:02d}, "
        f"Сб {sat_hour:02d}:{sat_minute:02d}–{sat_hour + 2:02d}:{sat_minute:02d} "
        f"(Europe/Berlin)"
    )
