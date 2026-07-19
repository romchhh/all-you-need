"""Обхід багів Pyrogram: PhotoSize / VideoSize з None → TypeError при sort/max."""

from __future__ import annotations

import logging
from typing import Any, List, Optional, Union

logger = logging.getLogger(__name__)

_patched = False


def apply_pyrogram_photo_size_patch() -> None:
    """
    Telegram інколи віддає PhotoSize.size / Progressive.sizes / VideoSize.size як None
    (часто invite/приватні канали). Stock Pyrogram: max()/sort →
    TypeError: '<' not supported between instances of 'NoneType' and 'int'.

    Також ловимо збої парсингу окремих повідомлень, щоб один битий пост
    не валив увесь канал.
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
    from pyrogram.types.messages_and_media.animation import Animation
    from pyrogram.types.messages_and_media.photo import Photo
    from pyrogram.types.messages_and_media.thumbnail import Thumbnail

    def _int_or_zero(value: Any) -> int:
        return value if isinstance(value, int) else 0

    def _safe_progressive_size(progressive: Any) -> int | None:
        safe_sizes = [
            s for s in (getattr(progressive, "sizes", None) or []) if isinstance(s, int)
        ]
        if not safe_sizes:
            return None
        return max(safe_sizes)

    def _is_media_sort_typeerror(exc: BaseException) -> bool:
        err = str(exc)
        return (
            "NoneType" in err
            or "not supported between" in err
            or "takes" in err and "positional" in err
        )

    def _safe_photo_parse(client, photo, ttl_seconds=None):
        if not isinstance(photo, raw.types.Photo):
            return None

        photos: list = []

        for p in photo.sizes or []:
            if isinstance(p, raw.types.PhotoSize):
                photos.append(
                    raw.types.PhotoSize(
                        type=getattr(p, "type", "") or "",
                        w=_int_or_zero(getattr(p, "w", None)),
                        h=_int_or_zero(getattr(p, "h", None)),
                        size=_int_or_zero(getattr(p, "size", None)),
                    )
                )
            elif isinstance(p, raw.types.PhotoSizeProgressive):
                size = _safe_progressive_size(p)
                if size is None:
                    continue
                photos.append(
                    raw.types.PhotoSize(
                        type=getattr(p, "type", "") or "",
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

    def _safe_thumbnail_parse(
        client, media: Union["raw.types.Photo", "raw.types.Document"]
    ) -> Optional[List["Thumbnail"]]:
        if isinstance(media, raw.types.Photo):
            raw_thumbs = [
                i
                for i in (media.sizes or [])
                if isinstance(i, raw.types.PhotoSize)
                and isinstance(getattr(i, "size", None), int)
            ]
            raw_thumbs.sort(key=lambda p: _int_or_zero(getattr(p, "size", None)))
            raw_thumbs = raw_thumbs[:-1]
            file_type = FileType.PHOTO
        elif isinstance(media, raw.types.Document):
            raw_thumbs = [
                i
                for i in (media.thumbs or [])
                if isinstance(i, raw.types.PhotoSize)
            ]
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

    Photo._parse = staticmethod(_safe_photo_parse)  # type: ignore[method-assign]
    Thumbnail._parse = staticmethod(_safe_thumbnail_parse)  # type: ignore[method-assign]

    # Animation._parse: сигнатура залежить від версії Pyrogram (3 або 4 args).
    _orig_anim = Animation._parse

    def _safe_anim_parse(*args, **kwargs):
        try:
            return _orig_anim(*args, **kwargs)
        except TypeError as e:
            if _is_media_sort_typeerror(e):
                logger.warning("Animation._parse skipped: %s", e)
                return None
            raise

    Animation._parse = staticmethod(_safe_anim_parse)  # type: ignore[method-assign]

    # Chat animation (video_sizes) — окремий код-шлях з videos.sort(key=size).
    _orig_chat_anim = Animation._parse_chat_animation

    def _safe_chat_anim_parse(client, video, file_name):
        try:
            if isinstance(video, raw.types.Photo) and getattr(video, "video_sizes", None):
                safe_sizes = []
                for v in video.video_sizes or []:
                    if not isinstance(v, raw.types.VideoSize):
                        continue
                    try:
                        safe_sizes.append(
                            raw.types.VideoSize(
                                type=getattr(v, "type", "") or "",
                                w=_int_or_zero(getattr(v, "w", None)),
                                h=_int_or_zero(getattr(v, "h", None)),
                                size=_int_or_zero(getattr(v, "size", None)),
                                video_start_ts=getattr(v, "video_start_ts", None),
                            )
                        )
                    except TypeError:
                        safe_sizes.append(
                            raw.types.VideoSize(
                                type=getattr(v, "type", "") or "",
                                w=_int_or_zero(getattr(v, "w", None)),
                                h=_int_or_zero(getattr(v, "h", None)),
                                size=_int_or_zero(getattr(v, "size", None)),
                            )
                        )
                # Підміняємо на копію з валідними size, щоб stock-код не падав.
                video = raw.types.Photo(
                    id=video.id,
                    access_hash=video.access_hash,
                    file_reference=video.file_reference,
                    date=video.date,
                    sizes=video.sizes or [],
                    dc_id=video.dc_id,
                    has_stickers=getattr(video, "has_stickers", None),
                    video_sizes=safe_sizes or None,
                )
            return _orig_chat_anim(client, video, file_name)
        except TypeError as e:
            if _is_media_sort_typeerror(e):
                logger.warning("Animation._parse_chat_animation skipped: %s", e)
                return None
            raise

    Animation._parse_chat_animation = staticmethod(_safe_chat_anim_parse)  # type: ignore[method-assign]

    # Якщо одне повідомлення в batch падає — парсимо по одному.
    _orig_parse_messages = utils.parse_messages

    async def _safe_parse_messages(client, messages, replies=1, business_connection_id=None):
        try:
            return await _orig_parse_messages(
                client,
                messages,
                replies=replies,
                business_connection_id=business_connection_id,
            )
        except TypeError as e:
            if not _is_media_sort_typeerror(e):
                raise

            logger.warning(
                "parse_messages TypeError (%s) — fallback по одному повідомленню",
                e,
            )
            users = {i.id: i for i in getattr(messages, "users", [])}
            chats = {i.id: i for i in getattr(messages, "chats", [])}
            topics = {i.id: i for i in getattr(messages, "topics", [])}
            parsed = []
            for message in getattr(messages, "messages", None) or []:
                try:
                    m = await types.Message._parse(
                        client=client,
                        message=message,
                        users=users,
                        chats=chats,
                        topics=topics,
                        replies=0,
                        business_connection_id=business_connection_id,
                    )
                    if m is not None:
                        parsed.append(m)
                except TypeError as msg_err:
                    logger.warning(
                        "Skip broken message id=%s: %s",
                        getattr(message, "id", "?"),
                        msg_err,
                    )
                except Exception as msg_err:
                    logger.warning(
                        "Skip message id=%s: %s",
                        getattr(message, "id", "?"),
                        msg_err,
                    )
            return types.List(parsed)

    utils.parse_messages = _safe_parse_messages  # type: ignore[assignment]

    # Invite preview: get_chat(t.me/+…) → Chat._parse_preview → Photo._parse.
    try:
        from pyrogram import enums
        from pyrogram.types.user_and_chats.chat import Chat

        _orig_preview = Chat._parse_preview

        def _safe_parse_preview(client, chat_invite):
            try:
                return _orig_preview(client, chat_invite)
            except TypeError as e:
                if not _is_media_sort_typeerror(e):
                    raise
                logger.warning(
                    "Chat._parse_preview failed (%s) — retry без photo",
                    e,
                )
                return Chat(
                    type=(
                        enums.ChatType.SUPERGROUP
                        if getattr(chat_invite, "megagroup", None)
                        else enums.ChatType.CHANNEL
                        if getattr(chat_invite, "broadcast", None)
                        else enums.ChatType.GROUP
                    ),
                    is_verified=getattr(chat_invite, "verified", None),
                    is_scam=getattr(chat_invite, "scam", None),
                    is_fake=getattr(chat_invite, "fake", None),
                    is_public=getattr(chat_invite, "public", None),
                    is_preview=True,
                    title=chat_invite.title,
                    photo=None,
                    members_count=getattr(chat_invite, "participants_count", None),
                    members=[
                        types.User._parse(client, user)
                        for user in getattr(chat_invite, "participants", []) or []
                    ]
                    or None,
                    description=getattr(chat_invite, "about", None),
                    join_by_request=getattr(chat_invite, "request_needed", None),
                    raw=chat_invite,
                    client=client,
                )

        Chat._parse_preview = staticmethod(_safe_parse_preview)  # type: ignore[method-assign]
    except Exception as e:
        logger.debug("Chat._parse_preview patch skipped: %s", e)

    _patched = True
    logger.info("Applied Pyrogram Photo/Thumbnail/Animation/parse_messages None-safe patch")
