import unittest

from utils.bot_category_map import (
    channel_publish_mode,
    map_bot_category_to_marketplace,
)


class BotCategoryMapTests(unittest.TestCase):
    def test_maps_bot_ua_names(self):
        self.assertEqual(
            map_bot_category_to_marketplace("Послуги"),
            ("services_work", "services"),
        )
        self.assertEqual(
            map_bot_category_to_marketplace("Нерухомість"),
            ("realestate", "other"),
        )
        self.assertEqual(
            map_bot_category_to_marketplace("Вакансія/пошук роботи"),
            ("services_work", "vacancies"),
        )
        self.assertEqual(
            map_bot_category_to_marketplace("Подія"),
            ("services_work", "other_services"),
        )
        self.assertEqual(
            map_bot_category_to_marketplace("Краса та здоров'я"),
            ("services_work", "beauty_health"),
        )

    def test_keeps_marketplace_slugs(self):
        self.assertEqual(
            map_bot_category_to_marketplace("services_work", "cleaning"),
            ("services_work", "cleaning"),
        )
        self.assertEqual(
            map_bot_category_to_marketplace("realestate", "rent_apartments"),
            ("realestate", "rent_apartments"),
        )

    def test_channel_publish_modes(self):
        self.assertEqual(channel_publish_mode("services_work", "cleaning"), "services")
        self.assertEqual(channel_publish_mode("services_work", "vacancies"), "trade")
        self.assertEqual(channel_publish_mode("realestate", "rooms"), "trade")
        self.assertEqual(channel_publish_mode("electronics", "smartphones"), None)
        self.assertEqual(channel_publish_mode("fashion", "women_clothing"), None)


if __name__ == "__main__":
    unittest.main()
