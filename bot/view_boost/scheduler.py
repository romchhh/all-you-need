"""
Планові «м'які» додаткові перегляди та лічильник обраного (favoriteBoost) для активних оголошень.

Поведінка:
  - Раз на добу (cron): +views, +favoriteBoost (обидва з різними обмеженнями).
  - Нові оголошення — менші прирости.
  - VIP / highlighted / top_category — вищий коефіцієнт, якщо promotionEnds у майбутньому.

Налаштування (константи в цьому файлі, не з .env):
  VIEW_BOOST_ENABLED     — увімкнути щоденний job і цикл накрутки.
  VIEW_BOOST_CRON_HOUR   — година cron (0–23).
  VIEW_BOOST_CRON_MINUTE — хвилина cron (0–59).

Запуск окремо: cd bot && python -m view_boost.scheduler
"""

from __future__ import annotations

import asyncio
import logging
import random
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

logger = logging.getLogger(__name__)

from database_functions.db_config import DATABASE_PATH

VIEW_BOOST_ENABLED: bool = True
VIEW_BOOST_CRON_HOUR: int = 4
VIEW_BOOST_CRON_MINUTE: int = 0


def _parse_sqlite_dt(value: str | None) -> datetime | None:
    if not value or not str(value).strip():
        return None
    s = str(value).strip().replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is not None:
            dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
        return dt
    except ValueError:
        try:
            return datetime.strptime(s[:19], "%Y-%m-%d %H:%M:%S")
        except ValueError:
            return None


def _listing_age_days(published_at: str | None, created_at: str | None, now: datetime) -> float:
    ref = _parse_sqlite_dt(published_at) or _parse_sqlite_dt(created_at)
    if not ref:
        return 30.0
    return max(0.0, (now - ref).total_seconds() / 86400.0)


def _promo_active(promotion_ends: str | None, now: datetime) -> bool:
    end = _parse_sqlite_dt(promotion_ends)
    if not end:
        return False
    return end > now


def _promo_multiplier(promotion_type: str | None, promotion_ends: str | None, now: datetime) -> float:
    if not _promo_active(promotion_ends, now):
        return 1.0
    raw = (promotion_type or "").lower()
    parts = {p.strip() for p in raw.split(",") if p.strip()}
    m = 1.0
    if "vip" in parts:
        m = max(m, 2.25)
    if "highlighted" in parts:
        m = max(m, 1.7)
    if "top_category" in parts:
        m = max(m, 1.38)
    return m


def _compute_views_increment(age_days: float, promo_mult: float) -> int:
    """Перегляди за один денний прогін (трохи вище за стару версію для «живості»)."""
    if age_days < 1.5:
        base = random.choices([0, 1, 2, 3], weights=[0.22, 0.42, 0.28, 0.08])[0]
        boosted = int(round(base * promo_mult))
        return max(0, min(boosted, 4))
    if age_days < 7:
        base = random.randint(1, 4)
        boosted = int(round(base * promo_mult))
        return max(0, min(boosted, 8))
    if age_days < 30:
        base = random.randint(3, 7)
        boosted = int(round(base * promo_mult))
        return max(0, min(boosted, 15))
    base = random.randint(4, 10)
    boosted = int(round(base * promo_mult))
    return max(0, min(boosted, 22))


def _compute_favorites_increment(age_days: float, promo_mult: float) -> int:
    """Обране — повільніше за перегляди; без різких стрибків на нових."""
    if age_days < 1.5:
        base = random.choices([0, 1], weights=[0.5, 0.5])[0]
        boosted = int(round(base * promo_mult))
        return max(0, min(boosted, 2))
    if age_days < 7:
        base = random.choices([0, 1, 2], weights=[0.2, 0.55, 0.25])[0]
        boosted = int(round(base * promo_mult))
        return max(0, min(boosted, 4))
    if age_days < 30:
        base = random.randint(1, 3)
        boosted = int(round(base * promo_mult))
        return max(0, min(boosted, 6))
    base = random.randint(1, 4)
    boosted = int(round(base * promo_mult))
    return max(0, min(boosted, 9))


def _ensure_favorite_boost_column(cur: sqlite3.Cursor) -> None:
    cur.execute("PRAGMA table_info(Listing)")
    cols = {row[1] for row in cur.fetchall()}
    if "favoriteBoost" not in cols:
        cur.execute(
            "ALTER TABLE Listing ADD COLUMN favoriteBoost INTEGER NOT NULL DEFAULT 0"
        )
        logger.info("view_boost: додано колонку Listing.favoriteBoost")


def run_view_boost_cycle_sync() -> dict:
    if not VIEW_BOOST_ENABLED:
        logger.info("VIEW_BOOST_ENABLED вимкнено — пропуск циклу.")
        return {"skipped": True, "updated": 0, "rows": 0}

    now = datetime.now()
    conn = sqlite3.connect(DATABASE_PATH, timeout=60.0)
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA busy_timeout = 60000;")
    cur = conn.cursor()
    try:
        try:
            _ensure_favorite_boost_column(cur)
            conn.commit()
        except Exception as e:
            logger.warning("view_boost: перевірка колонки favoriteBoost: %s", e)
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id, views, COALESCE(favoriteBoost, 0) as fb,
                   promotionType, promotionEnds, publishedAt, createdAt
            FROM Listing
            WHERE status = 'active'
            """
        )
        rows = cur.fetchall()
        views_updates = 0
        for row in rows:
            lid, views, fav_boost, ptype, pends, pub, cre = row
            age_days = _listing_age_days(pub, cre, now)
            mult = _promo_multiplier(ptype, pends, now)
            dv = _compute_views_increment(age_days, mult)
            df = _compute_favorites_increment(age_days, mult)
            if dv <= 0 and df <= 0:
                continue
            new_views = int(views or 0) + dv
            new_fav = int(fav_boost or 0) + df
            cur.execute(
                """
                UPDATE Listing
                SET views = ?, favoriteBoost = ?, updatedAt = ?
                WHERE id = ?
                """,
                (new_views, new_fav, now.strftime("%Y-%m-%d %H:%M:%S"), lid),
            )
            views_updates += 1
        conn.commit()
        logger.info(
            "view_boost: оновлено %s активних оголошень (views + favoriteBoost) з %s.",
            views_updates,
            len(rows),
        )
        return {"skipped": False, "updated": views_updates, "rows": len(rows)}
    except Exception as e:
        conn.rollback()
        logger.error("view_boost: помилка циклу: %s", e, exc_info=True)
        raise
    finally:
        conn.close()


async def run_view_boost_cycle() -> None:
    await asyncio.to_thread(run_view_boost_cycle_sync)


def register_view_boost_job(scheduler) -> None:
    if not VIEW_BOOST_ENABLED:
        logger.info("VIEW_BOOST: не реєструємо job (VIEW_BOOST_ENABLED вимкнено).")
        return
    job_id = "view_boost_daily"
    existing = scheduler.get_job(job_id)
    if existing:
        scheduler.remove_job(job_id)
    scheduler.add_job(
        run_view_boost_cycle,
        "cron",
        hour=VIEW_BOOST_CRON_HOUR,
        minute=VIEW_BOOST_CRON_MINUTE,
        id=job_id,
        replace_existing=True,
        max_instances=1,
        misfire_grace_time=3600,
    )
    logger.info(
        "VIEW_BOOST: job '%s' щодня о %02d:%02d",
        job_id,
        VIEW_BOOST_CRON_HOUR,
        VIEW_BOOST_CRON_MINUTE,
    )


async def _standalone_loop() -> None:
    interval_sec = 24 * 3600
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )
    logger.info("VIEW_BOOST standalone: старт (раз на 24 год).")
    while True:
        await run_view_boost_cycle()
        logger.info("VIEW_BOOST: наступний запуск через 24 год.")
        await asyncio.sleep(interval_sec)


if __name__ == "__main__":
    asyncio.run(_standalone_loop())
