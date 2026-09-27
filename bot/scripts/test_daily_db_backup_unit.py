"""Unit tests for daily_db_backup (без реального pg_dump / Telegram)."""

from __future__ import annotations

import gzip
import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

BOT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BOT_ROOT))


class DailyDbBackupTests(unittest.TestCase):
    def test_human_size(self):
        from utils.daily_db_backup import _human_size

        self.assertIn("KB", _human_size(2048))
        self.assertEqual(_human_size(500), "500 B")

    def test_sqlite_backup_gzip(self):
        import tempfile

        from utils.daily_db_backup import create_database_backup

        with tempfile.TemporaryDirectory() as td:
            td_path = Path(td)
            db = td_path / "ayn_marketplace.db"
            db.write_bytes(b"sqlite-test-data-" * 50)
            backup_dir = td_path / "backups"
            with patch("utils.daily_db_backup.is_postgres", return_value=False), patch(
                "utils.daily_db_backup.DB_PATH", db
            ), patch("utils.daily_db_backup.BACKUP_DIR", backup_dir), patch(
                "utils.daily_db_backup._timestamp_label", return_value="unit_test"
            ):
                path = create_database_backup()
            self.assertEqual(path.name, "ayn_marketplace_unit_test.db.gz")
            with gzip.open(path, "rb") as f:
                self.assertIn(b"sqlite-test-data", f.read())

    def test_register_cron_defaults(self):
        from utils.daily_db_backup import backup_cron_hour, backup_cron_minute, backup_enabled

        self.assertTrue(backup_enabled())
        self.assertEqual(backup_cron_hour(), 22)
        self.assertEqual(backup_cron_minute(), 0)


if __name__ == "__main__":
    unittest.main()
