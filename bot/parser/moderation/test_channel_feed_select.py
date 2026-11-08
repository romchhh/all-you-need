import os
import sqlite3
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from parser.moderation.channel_feed_select import (
    FeedCandidate,
    classify_bucket,
    eligible_for_hamburg,
    is_feed_quality,
    normalize_title_key,
    pick_next,
)
from parser.moderation.channel_feed_store import FEED_CANDIDATE_SQL


LONG = (
    "Виїзд по району, досвід кілька років, можна написати в телеграм і домовитись про час."
)


class QualityTests(unittest.TestCase):
    def test_rejects_short_and_earn_bot(self):
        self.assertFalse(is_feed_quality("Прибирання", "Коротко"))
        self.assertFalse(
            is_feed_quality(
                "Легкий заработок",
                "Пиши в бота і отримуй від 50 € в день без досвіду взагалі",
            )
        )

    def test_accepts_service_rejects_job_seeking(self):
        self.assertTrue(
            is_feed_quality(
                "Прибирання квартир",
                LONG,
            )
        )
        self.assertFalse(
            is_feed_quality(
                "Шукаю роботу бариста",
                "Досвід два роки в кав'ярні, Гамбург, готова до зміни зранку і на підміну.",
            )
        )

    def test_rejects_looking_for_flat(self):
        self.assertFalse(
            is_feed_quality(
                "Шукаю квартиру",
                "Шукаю двокімнатну в Гамбурзі до 900 євро, можна з меблями, на довго.",
            )
        )


class RoutingTests(unittest.TestCase):
    def test_hamburg_only_local_and_online(self):
        self.assertTrue(
            eligible_for_hamburg(
                title="Прибирання",
                description=LONG,
                location="Hamburg",
                subcategory="cleaning",
            )
        )
        self.assertTrue(
            eligible_for_hamburg(
                title="Консультація",
                description="Працюю онлайн, сесії по зуму для клієнтів з різних міст Німеччини.",
                location="Germany",
                subcategory="consultations",
            )
        )
        self.assertFalse(
            eligible_for_hamburg(
                title="Прибирання офісів",
                description=LONG,
                location="Berlin",
                subcategory="cleaning",
            )
        )

    def test_service_topics_only(self):
        self.assertEqual(
            classify_bucket("services_work", "cleaning", "Прибирання", LONG),
            "cleaning",
        )
        self.assertIsNone(
            classify_bucket("services_work", "vacancies", "Бариста", LONG)
        )
        self.assertIsNone(
            classify_bucket("realestate", "rent_apartments", "Квартира", LONG)
        )
        self.assertIsNone(
            classify_bucket(
                "services_work",
                "other_services",
                "Концерт",
                "Концерт у суботу, квитки на вході, початок о сьомій.",
            )
        )
        self.assertIsNone(
            classify_bucket(
                "services_work",
                "other_services",
                "Здам 2-кімнатну квартиру",
                "Здам 2 кімнати, тихо, поруч концертний зал і парк, меблі є.",
            )
        )
        self.assertIsNone(classify_bucket("electronics", "smartphones", "iPhone", LONG))

    def test_title_key_ignores_emoji_and_author_footer(self):
        self.assertEqual(normalize_title_key("Прибирання 🧹!"), normalize_title_key("прибирання"))
        self.assertFalse(
            is_feed_quality(
                "Прибирання",
                "Коротко\n\n👤 Автор: @spam\n🔗 Оригінальне: https://t.me/x/1",
                bucket="services",
            )
        )


class RotationTests(unittest.TestCase):
    def _item(self, listing_id, bucket, city, title):
        return FeedCandidate(listing_id, bucket, city, title.lower())

    def test_alternates_subcategories_and_cities(self):
        items = [
            self._item(1, "cleaning", "hamburg", "прибирання"),
            self._item(2, "repair_installation", "berlin", "ремонт"),
            self._item(3, "beauty_health", "hamburg", "манікюр"),
        ]
        first = pick_next(
            items,
            last_bucket="cleaning",
            last_city="hamburg",
            blocked_ids=set(),
            blocked_titles=set(),
        )
        self.assertIsNotNone(first)
        self.assertEqual(first.bucket, "repair_installation")
        self.assertEqual(first.city_key, "berlin")

        second = pick_next(
            items,
            last_bucket="repair_installation",
            last_city="berlin",
            blocked_ids={first.id},
            blocked_titles=set(),
        )
        self.assertEqual(second.bucket, "beauty_health")
        self.assertEqual(second.city_key, "hamburg")

        another_city = pick_next(
            items,
            last_bucket="beauty_health",
            last_city="hamburg",
            blocked_ids=set(),
            blocked_titles=set(),
        )
        self.assertEqual(another_city.id, 1)
        self.assertEqual(another_city.city_key, "hamburg")

    def test_skips_duplicate_title(self):
        items = [self._item(5, "services", "hamburg", "прибирання квартир")]
        picked = pick_next(
            items,
            last_bucket=None,
            last_city=None,
            blocked_ids=set(),
            blocked_titles={"прибирання квартир"},
        )
        self.assertIsNone(picked)


class QueueSqlTests(unittest.TestCase):
    def _db(self):
        conn = sqlite3.connect(":memory:")
        conn.row_factory = sqlite3.Row
        conn.execute(
            """
            CREATE TABLE Listing (
                id INTEGER PRIMARY KEY,
                title TEXT,
                description TEXT,
                price TEXT,
                currency TEXT,
                isFree INTEGER,
                category TEXT,
                subcategory TEXT,
                location TEXT,
                images TEXT,
                condition TEXT,
                status TEXT,
                expiresAt TEXT,
                moderationStatus TEXT,
                publishedAt TEXT,
                createdAt TEXT
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE channel_feed_post (
                id INTEGER PRIMARY KEY,
                listing_id INTEGER,
                channel_key TEXT,
                title_key TEXT,
                bucket TEXT,
                city_key TEXT,
                status TEXT,
                posted_at INTEGER
            )
            """
        )
        return conn

    def test_sqlite_queue_skips_posted_and_keeps_live(self):
        conn = self._db()
        now = 1_700_000_000
        conn.execute(
            """
            INSERT INTO Listing VALUES
            (1, 'Берлін', 'текст', '10', 'EUR', 0, 'services_work', 'cleaning', 'Berlin', '[]', '', 'active', NULL, 'approved', '2026-01-01', '2026-01-01'),
            (2, 'Гамбург', 'текст', '10', 'EUR', 0, 'services_work', 'cleaning', 'Hamburg', '[]', '', 'sold', NULL, 'approved', '2026-01-02', '2026-01-02'),
            (3, 'Ще Гамбург', 'текст', '10', 'EUR', 0, 'services_work', 'cleaning', 'Hamburg', '[]', '', 'active', NULL, 'approved', '2026-01-03', '2026-01-03')
            """
        )
        conn.execute(
            "INSERT INTO channel_feed_post VALUES (1, 1, 'hamburg', 'берлін', 'services', 'berlin', 'ok', ?)",
            (now,),
        )
        rows = conn.execute(FEED_CANDIDATE_SQL, ("hamburg", now - 10, now - 10, now - 10)).fetchall()
        conn.close()
        self.assertEqual([row["id"] for row in rows], [3])

    def test_postgres_sql_stays_valid(self):
        from database_functions.db_connection import adapt_sql

        previous = os.environ.get("DATABASE_URL")
        os.environ["DATABASE_URL"] = "postgresql://localhost/tradeground_sql_check"
        try:
            sql = adapt_sql(FEED_CANDIDATE_SQL)
        finally:
            if previous is None:
                os.environ.pop("DATABASE_URL", None)
            else:
                os.environ["DATABASE_URL"] = previous
        self.assertIn('"Listing"', sql)
        self.assertIn('"expiresAt"', sql)
        self.assertIn('"moderationStatus"', sql)
        self.assertIn("NOW()", sql)
        self.assertNotIn("datetime(", sql.lower())
        self.assertEqual(sql.count("?"), 4)


class CoverTests(unittest.TestCase):
    def test_hash_and_cleaning_icon_match_marketplace(self):
        from parser.moderation.marketplace_cover import (
            cover_scheme_index,
            hash_listing_id,
            render_marketplace_cover,
            resolve_cover_icon_name,
            shorten_cover_title,
        )

        self.assertEqual(hash_listing_id(1), 873244444)
        self.assertEqual(cover_scheme_index(1), 12)
        self.assertEqual(hash_listing_id(7), 839689206)
        self.assertEqual(cover_scheme_index(7), 6)
        self.assertEqual(
            resolve_cover_icon_name(
                title="Прибирання квартир",
                description=LONG,
                category="services_work",
                subcategory="cleaning",
            ),
            "SprayCan",
        )
        self.assertEqual(shorten_cover_title("Прибирання квартир"), "Прибирання квартир")
        path = render_marketplace_cover(
            listing_id=7,
            title="Прибирання квартир",
            description=LONG,
            category="services_work",
            subcategory="cleaning",
        )
        self.assertIsNotNone(path)
        self.assertGreater(Path(path).stat().st_size, 10_000)


class _FakeBot:
    def __init__(self, fail_urls=False):
        self.calls = []
        self.fail_urls = fail_urls

    async def send_photo(self, **kwargs):
        photo = kwargs.get("photo")
        label = str(getattr(photo, "path", photo))
        if self.fail_urls and label.startswith("http"):
            raise RuntimeError("photo url failed")
        self.calls.append(kwargs)
        return SimpleNamespace(message_id=77)

    async def send_message(self, **kwargs):
        raise AssertionError("text post has no photo")

    async def send_media_group(self, **kwargs):
        raise AssertionError("album drops the buttons")


class PublishTests(unittest.IsolatedAsyncioTestCase):
    async def _run(self, row, *, fail_urls=False):
        from parser.moderation.channel_feed import _publish_one

        saved = {}
        skipped = []

        def fetch(_key):
            return [row]

        def remember_many(_key, items):
            skipped.extend(items)

        def save_rotation(_key, **kwargs):
            saved.update(kwargs)

        bot = _FakeBot(fail_urls=fail_urls)
        with (
            patch("parser.moderation.channel_feed.fetch_feed_rows", fetch),
            patch("parser.moderation.channel_feed.recent_title_keys", return_value=set()),
            patch("parser.moderation.channel_feed.load_rotation", return_value=(None, None)),
            patch("parser.moderation.channel_feed.remember_many", remember_many),
            patch("parser.moderation.channel_feed.save_rotation", save_rotation),
            patch("parser.moderation.channel_feed_store.remember_channel_publish", lambda **_kw: None),
            patch("utils.translations.get_user_language", return_value="uk"),
        ):
            await _publish_one(bot, "hamburg", -1003627644062)
        return bot, saved, skipped

    async def test_cover_and_buttons_when_no_photo(self):
        row = {
            "id": 7,
            "title": "Прибирання квартир",
            "description": LONG,
            "price": "25",
            "currency": "EUR",
            "isFree": 0,
            "category": "services_work",
            "subcategory": "cleaning",
            "location": "Hamburg",
            "images": "[]",
            "condition": "",
        }
        bot, saved, skipped = await self._run(row)
        self.assertEqual(len(bot.calls), 1)
        photo = str(getattr(bot.calls[0]["photo"], "path", ""))
        self.assertIn("allyouneed-marketplace-covers", photo)
        self.assertTrue(photo.endswith(".jpg"))
        self.assertIn("7-", Path(photo).name)
        buttons = [btn for row_btns in bot.calls[0]["reply_markup"].inline_keyboard for btn in row_btns]
        self.assertEqual(len(buttons), 2)
        self.assertIn("Маркетплейс", buttons[0].text)
        self.assertIn("listing_7", buttons[0].url)
        self.assertIn("оголошення", buttons[1].text.lower())
        self.assertEqual(saved["listing_id"], 7)
        self.assertEqual(saved["bucket"], "cleaning")
        self.assertEqual(skipped, [])
        self.assertIn("Прибирання квартир", bot.calls[0]["caption"])

    async def test_bad_photo_falls_back_to_cover_and_other_city_is_skipped(self):
        good = {
            "id": 8,
            "title": "Ремонт пралок",
            "description": LONG,
            "price": "40",
            "currency": "EUR",
            "isFree": 0,
            "category": "services_work",
            "subcategory": "repair_installation",
            "location": "Hamburg",
            "images": '["https://example.com/missing-photo.jpg"]',
            "condition": "",
        }
        berlin = {
            "id": 9,
            "title": "Прибирання офісів Берлін",
            "description": LONG,
            "price": "30",
            "currency": "EUR",
            "isFree": 0,
            "category": "services_work",
            "subcategory": "cleaning",
            "location": "Berlin",
            "images": "[]",
            "condition": "",
        }
        from parser.moderation.channel_feed import _publish_one

        calls = {"n": 0}

        def fetch(_key):
            calls["n"] += 1
            if calls["n"] == 1:
                return [berlin, good]
            return [good]

        skipped = []
        saved = {}
        bot = _FakeBot(fail_urls=True)
        with (
            patch("parser.moderation.channel_feed.fetch_feed_rows", fetch),
            patch("parser.moderation.channel_feed.recent_title_keys", return_value=set()),
            patch("parser.moderation.channel_feed.load_rotation", return_value=("cleaning", "berlin")),
            patch("parser.moderation.channel_feed.remember_many", lambda _k, items: skipped.extend(items)),
            patch("parser.moderation.channel_feed.save_rotation", lambda _k, **kw: saved.update(kw)),
            patch("parser.moderation.channel_feed_store.remember_channel_publish", lambda **_kw: None),
            patch("utils.translations.get_user_language", return_value="uk"),
        ):
            await _publish_one(bot, "hamburg", -1003627644062)
        self.assertEqual(skipped, [(9, "Прибирання офісів Берлін", None, None, "skipped")])
        self.assertEqual(saved["listing_id"], 8)
        self.assertEqual(saved["city_key"], "hamburg")
        self.assertEqual(len(bot.calls), 1)
        cover = str(getattr(bot.calls[0]["photo"], "path", ""))
        self.assertIn("allyouneed-marketplace-covers", cover)
        self.assertIn("8-", Path(cover).name)


if __name__ == "__main__":
    unittest.main()
