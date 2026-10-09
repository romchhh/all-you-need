"""Smoke-тести парсера без Telegram (python -m scripts.test_parser_smoke)."""

import os
import unittest
from importlib import reload

from parser.moderation.formatting import (
    build_marketplace_description,
    ensure_marketplace_description_has_source,
    preserve_parsed_source_fields,
    resolved_author_username,
)
from parser.storage.parsed_items import parsed_item_row_blocks_duplicate


class ParserSmokeTests(unittest.TestCase):
    def test_publish_description_has_author(self):
        source = {
            "source_channel": "@test_ch",
            "message_id": 1,
            "author_username": "seller_x",
            "msg_link": "https://t.me/test_ch/1",
            "raw_text": "Стол 50€ @seller_x",
        }
        listing = {"title": "Стол", "description": ""}
        ctx = preserve_parsed_source_fields(listing, source)
        desc = ensure_marketplace_description_has_source(
            build_marketplace_description(ctx),
            ctx,
        )
        self.assertIn("seller_x", desc)
        self.assertTrue(len(desc.strip()) > 10)

    def test_author_not_channel_slug(self):
        item = {
            "author_username": "channel_slug",
            "source_channel": "@channel_slug",
            "raw_text": "Продам @real_seller",
        }
        self.assertEqual(resolved_author_username(item), "real_seller")

    def test_dedup_rejected_not_blocking(self):
        self.assertFalse(parsed_item_row_blocks_duplicate({"status": "rejected"}))

    def test_postgres_listing_sql(self):
        import database_functions.db_connection as dbc
        from parser.storage.listing_sql import create_listing_insert_sql

        os.environ["DATABASE_URL"] = "postgresql://u:p@localhost/db"
        reload(dbc)
        sql = create_listing_insert_sql()
        self.assertIn("RETURNING id", sql)
        os.environ.pop("DATABASE_URL", None)
        reload(dbc)


if __name__ == "__main__":
    unittest.main()
