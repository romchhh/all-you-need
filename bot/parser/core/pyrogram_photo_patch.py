"""Обхід багів Pyrogram: PhotoSize / PhotoSizeProgressive з None у sizes → порівняння падає."""

from __future__ import annotations

import logging
from typing import List, Optional, Union

logger = logging.getLogger(__name__)

_patched = False


def apply_pyrogram_photo_size_patch() -> None:
    """
    Telegram інколи віддає PhotoSizeProgressive.sizes / PhotoSize.size як None
    (частіше на invite/приватних каналах). Stock Pyrogram робить max()/sort по size →
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
    from pyrogram.types.messages_and_media.thumbnail import Thumbnail

    def _int_or_zero(value) -> int:
        return value if isinstance(value, int) else 0

    def _safe_progressive_size(progressive) -> int | None:
        safe_sizes = [s for s in (getattr(progressive, "sizes", None) or []) if isinstance(s, int)]
        if not safe_sizes:
            return None
        return max(safe_sizes)

    @staticmethod
    def _safe_photo_parse(client, photo, ttl_seconds=None):
        if not isinstance(photo, raw.types.Photo):
            return None

        photos = []

        for p in photo.sizes or []:
            if isinstance(p, raw.types.PhotoSize):
                # size/w/h інколи None — не додаємо битий розмір у список для sort
                if not isinstance(getattr(p, "size", None), int):
                    repaired = raw.types.PhotoSize(
                        type=p.type,
                        w=_int_or_zero(getattr(p, "w", None)),
                        h=_int_or_zero(getattr(p, "h", None)),
                        size=0,
                    )
                    photos.append(repaired)
                else:
                    photos.append(p)
            elif isinstance(p, raw.types.PhotoSizeProgressive):
                size = _safe_progressive_size(p)
                if size is None:
                    continue
                photos.append(
                    raw.types.PhotoSize(
                        type=p.type,
                        w=_int_or_zero(getattr(p, "w", None)),
                        h=_int_or_zero(getattr(p, "h", None)),
                        size=size,
                    )
                )

        if not photos:
            logger.warning(
                "Pyrogram Photo._parse: немає валідних PhotoSize (skip media id=%s)",
                getattr(photo, "id", "?"),
            )
            return None

        photos.sort(key=lambda p: _int_or_zero(getattr(p, "size", None)))
        main = photos[-1]

        try:
            thumbs = Thumbnail._parse(client, photo)
        except TypeError as e:
            logger.warning(
                "Pyrogram Thumbnail._parse failed for photo id=%s: %s",
                getattr(photo, "id", "?"),
                e,
            )
            thumbs = None

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
            width=_int_or_zero(main.w),
            height=_int_or_zero(main.h),
            file_size=_int_or_zero(main.size),
            date=utils.timestamp_to_datetime(photo.date),
            ttl_seconds=ttl_seconds,
            thumbs=thumbs,
            client=client,
        )

    @staticmethod
    def _safe_thumbnail_parse(
        client, media: Union["raw.types.Photo", "raw.types.Document"]
    ) -> Optional[List["Thumbnail"]]:
        if isinstance(media, raw.types.Photo):
            raw_thumbs = [
                i
                for i in (media.sizes or [])
                if isinstance(i, raw.types.PhotoSize)
            ]
            raw_thumbs.sort(key=lambda p: _int_or_zero(getattr(p, "size", None)))
            raw_thumbs = raw_thumbs[:-1]
            file_type = FileType.PHOTO
        elif isinstance(media, raw.types.Document):
            raw_thumbs = media.thumbs or []
            file_type = FileType.THUMBNAIL
        else:
            return None

        parsed_thumbs = []

        for thumb in raw_thumbs:
            if not isinstance(thumb, raw.types.PhotoSize):
                continue

            parsed_thumbs.append(
                Thumbnail(
                    file_id=FileId(
                        file_type=file_type,
                        dc_id=media.dc_id,
                        media_id=media.id,
                        access_hash=media.access_hash,
                        file_reference=media.file_reference,
                        thumbnail_file_type=file_type,
                        thumbnail_source=ThumbnailSource.THUMBNAIL,
                        thumbnail_size=thumb.type,
                        volume_id=0,
                        local_id=0,
                    ).encode(),
                    file_unique_id=FileUniqueId(
                        file_unique_type=FileUniqueType.DOCUMENT,
                        media_id=media.id,
                    ).encode(),
                    width=_int_or_zero(getattr(thumb, "w", None)),
                    height=_int_or_zero(getattr(thumb, "h", None)),
                    file_size=_int_or_zero(getattr(thumb, "size", None)),
                    client=client,
                )
            )

        return parsed_thumbs or None

    Photo._parse = _safe_photo_parse  # type: ignore[method-assign]
    Thumbnail._parse = _safe_thumbnail_parse  # type: ignore[method-assign]
    _patched = True
    logger.info("Applied Pyrogram Photo/Thumbnail None-safe patch")
