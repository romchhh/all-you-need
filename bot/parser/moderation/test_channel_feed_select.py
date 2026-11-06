import unittest

from parser.moderation.channel_feed_select import (
    FeedCandidate,
    classify_bucket,
    eligible_for_hamburg,
    is_feed_quality,
    pick_next,
)


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

    def test_accepts_service_and_job(self):
        self.assertTrue(
            is_feed_quality(
                "Прибирання квартир",
                LONG,
                bucket="services",
            )
        )
        self.assertTrue(
            is_feed_quality(
                "Шукаю роботу бариста",
                "Досвід два роки в кав'ярні, Гамбург, готова до зміни зранку і на підміну.",
                bucket="work",
            )
        )

    def test_rejects_looking_for_flat(self):
        self.assertFalse(
            is_feed_quality(
                "Шукаю квартиру",
                "Шукаю двокімнатну в Гамбурзі до 900 євро, можна з меблями, на довго.",
                bucket="realestate",
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

    def test_buckets(self):
        self.assertEqual(
            classify_bucket("services_work", "cleaning", "Прибирання", LONG),
            "services",
        )
        self.assertEqual(
            classify_bucket("services_work", "vacancies", "Бариста", LONG),
            "work",
        )
        self.assertEqual(
            classify_bucket("realestate", "rent_apartments", "Квартира", LONG),
            "realestate",
        )
        self.assertEqual(
            classify_bucket("services_work", "other_services", "Концерт", "Концерт у суботу, квитки на вході, початок о сьомій."),
            "events",
        )
        self.assertIsNone(classify_bucket("electronics", "smartphones", "iPhone", LONG))


class RotationTests(unittest.TestCase):
    def _item(self, listing_id, bucket, city, title):
        return FeedCandidate(listing_id, bucket, city, title.lower())

    def test_alternates_buckets_and_cities(self):
        items = [
            self._item(1, "services", "hamburg", "прибирання"),
            self._item(2, "services", "berlin", "ремонт"),
            self._item(3, "work", "hamburg", "бариста"),
            self._item(4, "realestate", "münchen", "квартира"),
        ]
        first = pick_next(
            items,
            last_bucket="services",
            last_city="hamburg",
            blocked_ids=set(),
            blocked_titles=set(),
        )
        self.assertIsNotNone(first)
        self.assertEqual(first.bucket, "work")

        second = pick_next(
            items,
            last_bucket="work",
            last_city="hamburg",
            blocked_ids={first.id},
            blocked_titles=set(),
        )
        self.assertEqual(second.bucket, "realestate")

        germany_services = pick_next(
            items,
            last_bucket="events",
            last_city="hamburg",
            blocked_ids=set(),
            blocked_titles=set(),
        )
        self.assertEqual(germany_services.id, 2)
        self.assertEqual(germany_services.city_key, "berlin")

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


if __name__ == "__main__":
    unittest.main()
