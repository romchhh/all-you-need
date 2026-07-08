"""Обхід бага Pyrogram: PhotoSizeProgressive.sizes може містити None → max() падає."""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

_patched = False


def apply_pyrogram_photo_size_patch() -> None:
    """
    Pyrogram Photo._parse робить max(p.sizes) для PhotoSizeProgressive.
    У частини постів (invite/приватні канали) sizes містить None →
    TypeError: '<' not supported between instances of 'NoneType' and 'int'.
    """
    global _patched
    if _patched:
        return

    from pyrogram import raw, types, utils
    from pyrogram.file_id import (
        FileId,
        FileType,
        FileUniqueId,
        FileUniqueType,
        ThumbnailSource,
    )
    from pyrogram.types.messages_and_media.photo import Photo

    @staticmethod
    def _safe_parse(client, photo, ttl_seconds=None):
        if not isinstance(photo, raw.types.Photo):
            return None

        photos = []

        for p in photo.sizes or []:
            if isinstance(p, raw.types.PhotoSize):
                photos.append(p)
            elif isinstance(p, raw.types.PhotoSizeProgressive):
                safe_sizes = [s for s in (p.sizes or []) if isinstance(s, int)]
                if not safe_sizes:
                    continue
                photos.append(
                    raw.types.PhotoSize(
                        type=p.type,
                        w=p.w,
                        h=p.h,
                        size=max(safe_sizes),
                    )
                )

        if not photos:
            logger.warning(
                "Pyrogram Photo._parse: немає валідних PhotoSize (skip media id=%s)",
                getattr(photo, "id", "?"),
            )
            return None

        photos.sort(key=lambda p: p.size or 0)
        main = photos[-1]

        return Photo(
            file_id=FileId(
                file_type=FileType.PHOTO,
                dc_id=photo.dc_id,
                media_id=photo.id,
                access_hash=photo.access_hash,
                file_reference=photo.file_reference,
                thumbnail_source=ThumbnailSource.THUMBNAIL,
                thumbnail_file_type=FileType.PHOTO,
                thumbnail_size=main.type,
                volume_id=0,
                local_id=0,
            ).encode(),
            file_unique_id=FileUniqueId(
                file_unique_type=FileUniqueType.DOCUMENT,
                media_id=photo.id,
            ).encode(),
            width=main.w,
            height=main.h,
            file_size=main.size,
            date=utils.timestamp_to_datetime(photo.date),
            ttl_seconds=ttl_seconds,
            thumbs=types.Thumbnail._parse(client, photo),
            client=client,
        )

    Photo._parse = _safe_parse  # type: ignore[method-assign]
    _patched = True
    logger.info("Applied Pyrogram PhotoSizeProgressive None-safe patch")
