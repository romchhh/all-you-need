"""Тихі години публікації парсера в канали (08:00–20:00 Europe/Berlin)."""

from __future__ import annotations

import unittest

from parser.moderation.services_publish import quiet_hours_active_for_hour


class QuietHoursTests(unittest.TestCase):
    def test_default_berlin_window_8_to_20(self):
        start, end = 20, 8  # quiet 20:00–08:00 → publish 08:00–20:00
        for hour in (8, 9, 12, 15, 19):
            self.assertFalse(
                quiet_hours_active_for_hour(hour, start, end),
                f"{hour}:00 should publish",
            )
        for hour in (20, 21, 23, 0, 3, 7):
            self.assertTrue(
                quiet_hours_active_for_hour(hour, start, end),
                f"{hour}:00 should be quiet",
            )

    def test_same_start_end_disables_quiet(self):
        self.assertFalse(quiet_hours_active_for_hour(3, 0, 0))
        self.assertFalse(quiet_hours_active_for_hour(22, 12, 12))

    def test_daytime_quiet_window(self):
        # start < end: quiet only inside [start, end)
        self.assertTrue(quiet_hours_active_for_hour(14, 12, 16))
        self.assertFalse(quiet_hours_active_for_hour(11, 12, 16))
        self.assertFalse(quiet_hours_active_for_hour(16, 12, 16))


if __name__ == "__main__":
    unittest.main()
