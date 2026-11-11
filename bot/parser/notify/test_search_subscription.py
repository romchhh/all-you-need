"""Тести HTTP-хука сповіщень пошукової підписки (без реального Telegram)."""

from __future__ import annotations

import asyncio
import os
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from parser.notify.search_subscription import (
    _notify_search_subscribers_listing,
    schedule_search_subscription_notify,
)


class TestScheduleSearchSubscriptionNotify(unittest.TestCase):
    def test_schedule_no_loop_does_not_raise(self):
        schedule_search_subscription_notify(99)

    def test_schedule_zero_id_ignored(self):
        schedule_search_subscription_notify(0)


class TestNotifySearchSubscribersHttp(unittest.TestCase):
    def test_skips_without_webapp_url(self):
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("WEBAPP_URL", None)
            os.environ.pop("NEXT_PUBLIC_BASE_URL", None)
            asyncio.run(_notify_search_subscribers_listing(1))

    def test_posts_json_with_auth(self):
        mock_resp = AsyncMock()
        mock_resp.status = 200
        mock_resp.json = AsyncMock(return_value={"ok": True, "matched": 2})
        mock_resp.text = AsyncMock(return_value="")

        mock_cm = AsyncMock()
        mock_cm.__aenter__.return_value = mock_resp
        mock_cm.__aexit__.return_value = None

        mock_session = MagicMock()
        mock_session.post = MagicMock(return_value=mock_cm)
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=None)

        with patch.dict(
            os.environ,
            {
                "WEBAPP_URL": "https://trade.example",
                "BOT_API_KEY": "secret-abc",
            },
            clear=False,
        ):
            with patch("aiohttp.ClientSession", return_value=mock_session):
                asyncio.run(_notify_search_subscribers_listing(42))

        mock_session.post.assert_called_once()
        call_kwargs = mock_session.post.call_args
        self.assertEqual(
            call_kwargs[0][0],
            "https://trade.example/api/cron/notify-search-subscribers",
        )
        self.assertEqual(
            call_kwargs[1]["headers"]["Authorization"],
            "Bearer secret-abc",
        )
        self.assertEqual(call_kwargs[1]["json"]["listingId"], 42)


if __name__ == "__main__":
    unittest.main()
