"""Спільна перевірка дублікатів для парсерів."""

from __future__ import annotations

from typing import Optional

from parser.embedding_dedup import (
    compute_listing_embedding,
    embedding_to_json,
    is_fuzzy_dedup_enabled,
    is_fuzzy_semantic_duplicate,
)
from parser.storage.parsed_items import (
    clear_repostable_parsed_item,
    parsed_item_claimed_by_other_parser,
    parsed_item_exists,
    parsed_item_is_raw_duplicate,
    parsed_item_is_semantic_duplicate,
)


def check_parser_duplicates(
    *,
    source_channel: str,
    message_id: int,
    content_hash: str,
    dedup_key: Optional[str],
    title: str,
    description: str,
    parser_type: str = "default",
) -> tuple[bool, str, Optional[str]]:
    """
    Повертає (is_duplicate, reason, embedding_json_for_insert).
    reason — ключ для stats['reasons'].
    """
    clear_repostable_parsed_item(source_channel, message_id)

    if parsed_item_exists(source_channel, message_id, parser_type):
        return True, "дублікат (бд)", None

    if parsed_item_claimed_by_other_parser(source_channel, message_id, parser_type):
        return True, "вже в іншому парсері", None

    if parsed_item_is_raw_duplicate(content_hash):
        return True, "дублікат (текст)", None

    if parsed_item_is_semantic_duplicate(dedup_key):
        return True, "дублікат (оголошення)", None

    embedding_json: Optional[str] = None
    if is_fuzzy_dedup_enabled():
        vec = compute_listing_embedding(title, description)
        if vec and is_fuzzy_semantic_duplicate(title, description, vec):
            return True, "дублікат (схожий текст)", None
        embedding_json = embedding_to_json(vec)

    return False, "", embedding_json
