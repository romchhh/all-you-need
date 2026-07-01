"""Fuzzy-дедуп оголошень через OpenAI embeddings (опційно)."""

from __future__ import annotations

import json
import logging
import math
import os
from typing import Optional

from parser.config.settings import (
    PARSER_DEDUP_DAYS,
    PARSER_EMBEDDING_MODEL,
    PARSER_FUZZY_DEDUP_ENABLED,
    PARSER_FUZZY_DEDUP_THRESHOLD,
)

logger = logging.getLogger(__name__)

OPENAI_API_KEY = (os.getenv("OPENAI_API_KEY") or "").strip()


def is_fuzzy_dedup_enabled() -> bool:
    if not PARSER_FUZZY_DEDUP_ENABLED:
        return False
    if not OPENAI_API_KEY:
        return False
    return True


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


def _embedding_input(title: str, description: str) -> str:
    title = (title or "").strip()
    description = (description or "").strip()
    blob = f"{title}\n{description}".strip()
    return blob[:6000]


def compute_listing_embedding(title: str, description: str) -> Optional[list[float]]:
    """Один запит embedding; викликати лише для кандидатів після exact-dedup."""
    if not is_fuzzy_dedup_enabled():
        return None
    text = _embedding_input(title, description)
    if len(text) < 20:
        return None
    try:
        from openai import OpenAI

        client = OpenAI(api_key=OPENAI_API_KEY)
        response = client.embeddings.create(
            model=PARSER_EMBEDDING_MODEL,
            input=text,
        )
        vec = response.data[0].embedding
        return [float(x) for x in vec]
    except Exception as e:
        logger.warning("Fuzzy dedup embedding failed: %s", e)
        return None


def is_fuzzy_semantic_duplicate(
    title: str,
    description: str,
    embedding: Optional[list[float]] = None,
) -> bool:
    """Порівнює з оголошеннями, що ще активні на платформі або в черзі модерації."""
    if not is_fuzzy_dedup_enabled():
        return False

    vec = embedding or compute_listing_embedding(title, description)
    if not vec:
        return False

    from parser.storage.parsed_items import get_recent_parsed_embeddings

    for row in get_recent_parsed_embeddings(PARSER_DEDUP_DAYS):
        stored = row.get("embedding")
        if not stored:
            continue
        score = _cosine_similarity(vec, stored)
        if score >= PARSER_FUZZY_DEDUP_THRESHOLD:
            logger.info(
                "Fuzzy dedup hit: score=%.3f item_id=%s title=%r",
                score,
                row.get("id"),
                (title or "")[:60],
            )
            return True
    return False


def embedding_to_json(vec: Optional[list[float]]) -> Optional[str]:
    if not vec:
        return None
    return json.dumps(vec, separators=(",", ":"))


def embedding_from_json(raw: Optional[str]) -> Optional[list[float]]:
    if not raw:
        return None
    try:
        data = json.loads(raw)
        if isinstance(data, list) and data:
            return [float(x) for x in data]
    except Exception:
        return None
    return None
