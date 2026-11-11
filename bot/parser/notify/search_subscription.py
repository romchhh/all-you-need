"""Сповіщення підписників пошукового запиту після публікації Listing (через Next.js API)."""

from __future__ import annotations

import asyncio
import logging
import os

logger = logging.getLogger(__name__)


async def _notify_search_subscribers_listing(listing_id: int) -> None:
    base = (os.getenv("WEBAPP_URL") or os.getenv("NEXT_PUBLIC_BASE_URL") or "").strip().rstrip("/")
    if not base:
        return
    secret = (
        os.getenv("CRON_SECRET")
        or os.getenv("BOT_API_KEY")
        or os.getenv("INTERNAL_API_SECRET")
        or ""
    ).strip()
    if not secret:
        logger.debug("search-subscription notify skipped: no CRON_SECRET/BOT_API_KEY")
        return

    url = f"{base}/api/cron/notify-search-subscribers"
    try:
        import aiohttp

        timeout = aiohttp.ClientTimeout(total=60)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(
                url,
                headers={"Authorization": f"Bearer {secret}"},
                json={"listingId": int(listing_id)},
            ) as resp:
                if resp.status >= 400:
                    body = await resp.text()
                    logger.warning(
                        "search-subscription notify HTTP %s listing=%s: %s",
                        resp.status,
                        listing_id,
                        body[:300],
                    )
                else:
                    try:
                        data = await resp.json()
                        logger.info(
                            "search-subscription notify listing=%s result=%s",
                            listing_id,
                            data,
                        )
                    except Exception:
                        pass
    except Exception as e:
        logger.debug("search-subscription notify failed listing=%s: %s", listing_id, e)


def schedule_search_subscription_notify(listing_id: int) -> None:
    if not listing_id:
        return
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return
    loop.create_task(_notify_search_subscribers_listing(listing_id))
