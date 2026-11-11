"""Надійний парсинг / нормалізація images TelegramListing і Listing."""

from __future__ import annotations

import json
import logging
from typing import Any

logger = logging.getLogger(__name__)


def parse_listing_images(raw: Any) -> list[Any]:
    """
    Повертає список медіа: str file_id/url або {"type","file_id"}.
    Не затирає дані, якщо значення вже list (PostgreSQL/jsonb або подвійний parse).
    """
    if raw is None:
        return []
    if isinstance(raw, memoryview):
        raw = raw.tobytes()
    if isinstance(raw, (bytes, bytearray)):
        try:
            raw = raw.decode("utf-8")
        except Exception:
            return []
    if isinstance(raw, list):
        return [x for x in raw if x is not None and x != ""]
    if isinstance(raw, dict):
        # інколи помилково зберігають один об'єкт замість масиву
        if raw.get("file_id") or raw.get("url"):
            return [raw]
        return []
    if not isinstance(raw, str):
        raw = str(raw)
    text = raw.strip()
    if not text or text in ("[]", "null", "None"):
        return []
    try:
        parsed = json.loads(text)
    except Exception as e:
        logger.warning("parse_listing_images: JSON fail (%s): %r", e, text[:120])
        # один file_id рядком
        if text and not text.startswith(("[", "{")):
            return [text]
        return []
    if isinstance(parsed, list):
        return [x for x in parsed if x is not None and x != ""]
    if isinstance(parsed, dict):
        if parsed.get("file_id") or parsed.get("url"):
            return [parsed]
        return []
    if isinstance(parsed, str) and parsed.strip():
        return [parsed.strip()]
    return []


def media_item_file_id_and_type(item: Any) -> tuple[str, str]:
    if isinstance(item, dict):
        fid = str(item.get("file_id") or item.get("url") or "").strip()
        mtype = str(item.get("type") or "photo").lower()
        if fid.startswith("http") or fid.startswith("/"):
            return fid, mtype if mtype in ("photo", "video") else "photo"
        return fid, mtype if mtype in ("photo", "video") else "photo"
    return (str(item or "").strip(), "photo")


def images_to_json(images: list[Any]) -> str:
    return json.dumps(images or [], ensure_ascii=False)


def normalize_media_for_db(media: list[Any]) -> list[dict[str, str]]:
    """Єдиний формат у БД: [{"type":"photo"|"video","file_id":"..."}]."""
    out: list[dict[str, str]] = []
    for item in media or []:
        fid, mtype = media_item_file_id_and_type(item)
        if not fid:
            continue
        out.append({"type": mtype, "file_id": fid})
    return out
