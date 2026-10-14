"""Smoke-тести парсера без Telegram (python -m scripts.test_parser_smoke)."""

import asyncio
import os
import unittest
from importlib import reload

from parser.core.album import expand_incoming_message
from parser.core.channel_fetch import resolve_cursor_commit
from parser.core.discussion_parse import discussion_history_offset, discussion_storage_id
from parser.core.location import canonicalize_known_city, detect_cities_in_text, resolve_parsed_location
from parser.core.parse_pipeline import _finalize_fields
from parser.moderation.formatting import (
    build_final_marketplace_description,
    is_effectively_empty_marketplace_description,
    preserve_parsed_source_fields,
    resolved_author_username,
)
from parser.storage.listing_sql import listing_title_price_duplicate_sql, published_parsed_dedup_sql
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
        desc = build_final_marketplace_description(ctx)
        self.assertIn("seller_x", desc)
        self.assertFalse(is_effectively_empty_marketplace_description(desc, ctx.get("title")))

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

    def test_cursor_gap_larger_than_page_does_not_jump_head(self):
        last, seen, resume = resolve_cursor_commit(
            stored_cursor=100,
            seen_head=0,
            head_id=5000,
            oldest_id=4900,
            reached_stop=False,
            history_ended=False,
            commit_head=False,
        )
        self.assertEqual(last, 100)
        self.assertEqual(seen, 5000)
        self.assertEqual(resume, 4900)

        last, seen, resume = resolve_cursor_commit(
            stored_cursor=100,
            seen_head=5000,
            head_id=5000,
            oldest_id=80,
            reached_stop=True,
            history_ended=False,
            commit_head=False,
        )
        self.assertEqual(last, 5000)
        self.assertEqual(seen, 5000)
        self.assertEqual(resume, 0)

    def test_discussion_reply_id_does_not_collide_with_post_id(self):
        self.assertEqual(discussion_storage_id(42), -42)
        self.assertNotEqual(discussion_storage_id(42), 42)
        self.assertEqual(discussion_history_offset(80, 15, 10), 81)
        self.assertEqual(discussion_history_offset(80, 0, 10), 80)
        self.assertEqual(discussion_history_offset(0, 0, 10), 0)

    def test_album_canonical_id_is_caption_frame(self):
        class Frame:
            def __init__(self, frame_id, caption=None, photo=True):
                self.id = frame_id
                self.caption = caption
                self.text = None
                self.photo = object() if photo else None
                self.media_group_id = "grp-1"

            async def get_media_group(self):
                return frames

        frames = [Frame(10), Frame(11, caption="Продам стіл 40€"), Frame(12)]
        text, photos, link_msg, canonical, gid, ids, link = asyncio.run(
            expand_incoming_message(frames[0])
        )
        self.assertEqual(canonical, 11)
        self.assertEqual(ids, [10, 11, 12])
        self.assertEqual(gid, "grp-1")
        self.assertIn("стіл", text)
        self.assertEqual(link_msg.id, 11)
        self.assertEqual(len(photos), 3)
        self.assertIsNone(link)

    def test_free_shipping_is_not_a_giveaway(self):
        fields = _finalize_fields(
            title="Велосипед",
            description="Продам, безкоштовна доставка по місту",
            raw_text="Продам велосипед 80€, безкоштовна доставка, free parking поруч",
            category="sport",
            subcategory=None,
            price="80",
            currency="EUR",
            is_free=False,
            condition=None,
            location="Hamburg",
        )
        self.assertFalse(fields["is_free"])
        self.assertNotEqual(fields["category"], "free")
        self.assertEqual(fields["price"], "80")

        giveaway = _finalize_fields(
            title="Віддам диван",
            description="Самовіз",
            raw_text="Віддам диван, самовіз",
            category="home",
            subcategory=None,
            price=None,
            currency=None,
            is_free=False,
            condition=None,
            location="Hamburg",
        )
        self.assertTrue(giveaway["is_free"])
        self.assertEqual(giveaway["category"], "free")
        self.assertEqual(giveaway["price"], "Free")

    def test_city_outside_top40_stays_specific(self):
        self.assertEqual(canonicalize_known_city("Magdeburg"), "Magdeburg")
        self.assertEqual(canonicalize_known_city("Marl"), "Marl")
        self.assertIsNone(canonicalize_known_city("Germany"))
        self.assertEqual(
            resolve_parsed_location(channel_city="Germany", text="Продам шафу у Chemnitz"),
            "Chemnitz",
        )
        self.assertEqual(
            detect_cities_in_text("Frankfurt (Oder), не просто Frankfurt")[0],
            "Frankfurt (Oder)",
        )

    def test_dedup_sql_has_no_row_cap(self):
        title_sql = listing_title_price_duplicate_sql()
        key_sql = published_parsed_dedup_sql()
        self.assertNotIn("800", title_sql)
        self.assertNotIn("800", key_sql)
        self.assertIn("dedup_key", key_sql)
        self.assertIn("LIMIT 1", title_sql)


if __name__ == "__main__":
    unittest.main()
