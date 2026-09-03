"""Оновлення публічної статистики «+N сьогодні / по містах» після публікації."""

from __future__ import annotations

import asyncio
import logging
import os

logger = logging.getLogger(__name__)


async def _revalidate_home_activity() -> None:
    base = (os.getenv("WEBAPP_URL") or "").strip().rstrip("/")
    if not base:
        return
    secret = (
        os.getenv("CRON_SECRET")
        or os.getenv("BOT_API_KEY")
        or os.getenv("INTERNAL_API_SECRET")
        or ""
    ).strip()
    if not secret:
        logger.debug("home-activity revalidate skipped: no CRON_SECRET/BOT_API_KEY")
        return

    url = f"{base}/api/cron/revalidate-home-activity"
    try:
        import aiohttp

        timeout = aiohttp.ClientTimeout(total=12)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(
                url,
                headers={"Authorization": f"Bearer {secret}"},
            ) as resp:
                if resp.status >= 400:
                    body = await resp.text()
                    logger.warning(
                        "home-activity revalidate HTTP %s: %s",
                        resp.status,
                        body[:200],
                    )
    except Exception as e:
        logger.debug("home-activity revalidate failed: %s", e)


def schedule_home_activity_revalidate() -> None:
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return
    loop.create_task(_revalidate_home_activity())
