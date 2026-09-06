"""Приховує дублікати активних оголошень на маркетплейсі (лишає найновіше)."""

from __future__ import annotations

import logging
from collections import defaultdict
from typing import Any

from parser.storage.connection import get_connection
from parser.storage.parsed_items import fingerprint_title_desc

logger = logging.getLogger(__name__)


def run_marketplace_duplicate_cleanup(
    *,
    lookback_days: int = 30,
    dry_run: bool = False,
) -> dict[str, Any]:
    """
    Групує активні Listing за fingerprint(title+desc+price).
    У кожній групі залишає запис з max(id), старіші ховає (status=hidden).
    """
    days = max(7, int(lookback_days))
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT id, title, description, price, isFree, createdAt
        FROM Listing
        WHERE status = 'active'
          AND (expiresAt IS NULL OR datetime(expiresAt) > datetime('now'))
          AND datetime(createdAt) >= datetime('now', ?)
        ORDER BY id ASC
        """,
        (f"-{days} days",),
    )
    rows = [dict(r) for r in cursor.fetchall()]

    groups: dict[str, list[dict]] = defaultdict(list)
    no_fp = 0
    for row in rows:
        fp = fingerprint_title_desc(
            str(row.get("title") or ""),
            str(row.get("description") or ""),
            price=str(row.get("price") or ""),
            is_free=row.get("isFree") in (1, True, "1"),
        )
        if not fp:
            no_fp += 1
            continue
        groups[fp].append(row)

    hide_ids: list[int] = []
    duplicate_groups = 0
    for fp, items in groups.items():
        if len(items) < 2:
            continue
        duplicate_groups += 1
        items.sort(key=lambda r: int(r.get("id") or 0))
        keep_id = int(items[-1]["id"])
        for item in items[:-1]:
            lid = int(item.get("id") or 0)
            if lid and lid != keep_id:
                hide_ids.append(lid)

    hidden = 0
    if hide_ids and not dry_run:
        for lid in hide_ids:
            cursor.execute(
                """
                UPDATE Listing
                SET status = 'hidden',
                    updatedAt = datetime('now')
                WHERE id = ?
                  AND status = 'active'
                """,
                (lid,),
            )
            if cursor.rowcount:
                hidden += 1
        conn.commit()

    conn.close()
    stats = {
        "scanned": len(rows),
        "duplicate_groups": duplicate_groups,
        "to_hide": len(hide_ids),
        "hidden": hidden,
        "no_fingerprint": no_fp,
        "dry_run": dry_run,
        "lookback_days": days,
    }
    if hidden or (dry_run and hide_ids):
        logger.info(
            "🧹 MP dedup cleanup: scanned=%s groups=%s hide=%s (dry_run=%s)",
            stats["scanned"],
            duplicate_groups,
            len(hide_ids),
            dry_run,
        )
    return stats


def register_marketplace_dedup_cleanup_job(scheduler) -> None:
    from parser.config.settings import (
        PARSER_MP_DEDUP_CLEANUP_ENABLED,
        PARSER_MP_DEDUP_CLEANUP_INTERVAL_MIN,
        PARSER_MP_DEDUP_CLEANUP_LOOKBACK_DAYS,
    )

    if not PARSER_MP_DEDUP_CLEANUP_ENABLED:
        logger.info("MP dedup cleanup вимкнено (tuning.py)")
        return

    async def _job():
        try:
            from parser.storage.connection import parser_db_cycle

            with parser_db_cycle():
                stats = run_marketplace_duplicate_cleanup(
                    lookback_days=PARSER_MP_DEDUP_CLEANUP_LOOKBACK_DAYS,
                )
            if stats.get("hidden"):
                logger.info(
                    "🧹 MP dedup: приховано %s дублікатів (груп %s)",
                    stats["hidden"],
                    stats.get("duplicate_groups"),
                )
        except Exception:
            logger.exception("MP dedup cleanup job failed")

    scheduler.add_job(
        _job,
        trigger="interval",
        minutes=PARSER_MP_DEDUP_CLEANUP_INTERVAL_MIN,
        id="marketplace_dedup_cleanup",
        replace_existing=True,
        misfire_grace_time=max(300, int(PARSER_MP_DEDUP_CLEANUP_INTERVAL_MIN * 60)),
        max_instances=1,
    )
    logger.info(
        "✅ MP dedup cleanup зареєстровано (кожні %s хв, lookback %s дн.)",
        PARSER_MP_DEDUP_CLEANUP_INTERVAL_MIN,
        PARSER_MP_DEDUP_CLEANUP_LOOKBACK_DAYS,
    )
