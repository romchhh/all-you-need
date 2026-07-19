"""Метадані Telegram-повідомлень."""

import logging
import re
from typing import Optional, Union

from parser.config.channels import normalize_channel_key

logger = logging.getLogger(__name__)

PyrogramChatTarget = Union[str, int]

# Як у pyrogram.Client.INVITE_LINK_RE
_INVITE_HASH_RE = re.compile(
    r"^(?:https?://)?(?:www\.)?(?:t(?:elegram)?\.(?:org|me|dog)/(?:joinchat/|\+))([\w-]+)$",
    re.IGNORECASE,
)


def is_invite_link(channel: str) -> bool:
    s = (channel or "").strip().lower()
    return "/+" in s or "/joinchat/" in s or s.startswith("+") and len(s) > 8


def extract_invite_hash(ref: str) -> Optional[str]:
    raw = (ref or "").strip()
    if not raw:
        return None
    m = _INVITE_HASH_RE.match(raw)
    if m:
        return m.group(1)
    if raw.startswith("+") and len(raw) > 8:
        return raw[1:]
    return None


def resolve_pyrogram_chat_ref(channel: str) -> str:
    """
    Pyrogram chat id для get_chat_history / get_chat.
    Invite-посилання t.me/+… — лише з https://, інакше USERNAME_INVALID.
    """
    raw = (channel or "").strip()
    if not raw:
        return raw

    if raw.startswith("http://") or raw.startswith("https://"):
        return raw.rstrip("/")

    key = normalize_channel_key(raw)
    if not key:
        return raw

    lower = key.lower()
    if lower.startswith("t.me/+") or lower.startswith("t.me/joinchat/"):
        return f"https://{key}"

    if lower.startswith("t.me/"):
        username = key.split("/", 1)[1]
        return f"@{username}"

    if key.startswith("+"):
        return f"https://t.me/{key}"

    return f"@{key.lstrip('@')}"


def _usable_chat_id(chat) -> Optional[int]:
    """Preview після get_chat(invite) часто має id=None — для history непридатний."""
    if chat is None:
        return None
    if getattr(chat, "is_preview", False):
        return None
    cid = getattr(chat, "id", None)
    if cid is None:
        return None
    try:
        return int(cid)
    except (TypeError, ValueError):
        return None


def _raw_chat_to_peer_id(raw_chat) -> Optional[int]:
    from pyrogram import raw, utils

    if isinstance(raw_chat, (raw.types.Channel, raw.types.ChannelForbidden)):
        return int(utils.get_channel_id(raw_chat.id))
    if isinstance(raw_chat, (raw.types.Chat, raw.types.ChatForbidden)):
        return int(-raw_chat.id)
    return None


async def _resolve_invite_via_check(app, invite_hash: str) -> Optional[int]:
    """CheckChatInvite → numeric id + прогрів peer у session storage."""
    from pyrogram import raw

    result = await app.invoke(raw.functions.messages.CheckChatInvite(hash=invite_hash))
    if not isinstance(result, (raw.types.ChatInviteAlready, raw.types.ChatInvitePeek)):
        return None

    raw_chat = result.chat
    cid = _raw_chat_to_peer_id(raw_chat)
    if cid is None:
        return None

    # Без access_hash у storage get_chat_history(numeric_id) падає з PeerIdInvalid.
    try:
        if isinstance(raw_chat, raw.types.Channel) and getattr(raw_chat, "access_hash", None) is not None:
            await app.invoke(
                raw.functions.channels.GetChannels(
                    id=[
                        raw.types.InputChannel(
                            channel_id=raw_chat.id,
                            access_hash=raw_chat.access_hash,
                        )
                    ]
                )
            )
        elif isinstance(raw_chat, raw.types.Chat):
            await app.invoke(raw.functions.messages.GetChats(id=[raw_chat.id]))
    except Exception as warm_err:
        logger.info("Warm peer after CheckChatInvite(%s): %s", invite_hash[:8], warm_err)

    return cid


async def resolve_pyrogram_chat_target(app, channel: str) -> PyrogramChatTarget:
    """
    Резолвить канал/групу для Pyrogram.
    Invite: ніколи не повертає None (preview без id) — CheckChatInvite / join_chat.
    """
    ref = resolve_pyrogram_chat_ref(channel)
    if not is_invite_link(ref):
        return ref

    invite_hash = extract_invite_hash(ref)
    if invite_hash:
        try:
            cid = await _resolve_invite_via_check(app, invite_hash)
            if cid is not None:
                logger.info("CheckChatInvite(%s) → chat_id=%s", channel, cid)
                return cid
        except Exception as check_err:
            logger.info("CheckChatInvite(%r): %s", ref, check_err)

    try:
        chat = await app.get_chat(ref)
        cid = _usable_chat_id(chat)
        if cid is not None:
            return cid
        logger.info("get_chat(%r) → preview/без id — join_chat", ref)
    except Exception as get_err:
        logger.info("get_chat(%r): %s — join_chat", ref, get_err)

    try:
        chat = await app.join_chat(ref)
        cid = _usable_chat_id(chat)
        if cid is not None:
            logger.info("join_chat(%r) → chat_id=%s", ref, cid)
            return cid
    except Exception as join_err:
        err_text = str(join_err)
        already = (
            "USER_ALREADY_PARTICIPANT" in err_text
            or "already a participant" in err_text.lower()
        )
        if already and invite_hash:
            cid = await _resolve_invite_via_check(app, invite_hash)
            if cid is not None:
                logger.info(
                    "already member → CheckChatInvite chat_id=%s (%s)",
                    cid,
                    channel,
                )
                return cid
        raise

    raise RuntimeError(
        f"Invite {channel!r}: немає numeric chat_id "
        f"(preview без id; join теж без id)"
    )

def message_link(channel: str, message_id: int, chat_id: Optional[int] = None) -> str:
    if chat_id is not None:
        try:
            cid = int(chat_id)
            if cid < 0:
                internal = str(cid).replace("-100", "", 1)
                return f"https://t.me/c/{internal}/{message_id}"
        except (TypeError, ValueError):
            pass

    clean = normalize_channel_key(channel)
    lower = clean.lower()
    if lower.startswith("t.me/+") or lower.startswith("t.me/joinchat/"):
        return f"https://{clean}/{message_id}"
    if lower.startswith("t.me/"):
        clean = clean.split("/", 1)[1]
    clean = clean.lstrip("@").split("/")[0]
    return f"https://t.me/{clean}/{message_id}"


def parsed_item_message_link(item: dict) -> Optional[str]:
    """Посилання на оригінальний пост у групі/каналі (parsed_items)."""
    source_channel = (item.get("source_channel") or "").strip()
    message_id = item.get("message_id")
    if source_channel and message_id is not None:
        try:
            return message_link(source_channel, int(message_id))
        except (TypeError, ValueError):
            pass
    link = (item.get("msg_link") or "").strip()
    return link or None


def _is_real_telegram_user(user) -> bool:
    if user is None:
        return False
    if getattr(user, "is_bot", False):
        return False
    if getattr(user, "is_deleted", False):
        return False
    uid = getattr(user, "id", None)
    try:
        if uid is None or int(uid) <= 0:
            return False
    except (TypeError, ValueError):
        return False
    return True


def _sender_user_from_message(msg):
    origin = getattr(msg, "forward_origin", None)
    if origin is not None:
        sender = getattr(origin, "sender_user", None)
        if _is_real_telegram_user(sender):
            return sender
    user = getattr(msg, "from_user", None)
    if _is_real_telegram_user(user):
        return user
    return None


def get_sender_username(msg) -> Optional[str]:
    origin = getattr(msg, "forward_origin", None)
    if origin is not None:
        sender = getattr(origin, "sender_user", None)
        if sender is not None and getattr(sender, "username", None):
            return str(sender.username).lstrip("@")
    if getattr(msg, "from_user", None) and getattr(msg.from_user, "username", None):
        return str(msg.from_user.username).lstrip("@")
    return None


# Канали/боти — не плутати з автором оголошення при парсингу @ з тексту
_IGNORE_MENTION_USERNAMES: frozenset[str] = frozenset({
    "gamburg_baraxlanet",
    "gamburg_baraholka",
    "secondhand_hh",
    "hamburggggggg",
    "hamburgbeauty",
    "baraholkaberlin",
    "tradeground",
    "tradeground_seller",
    "tradeground_seller2",
})


def extract_username_from_text(text: str, channel: str = "") -> Optional[str]:
    """Витягує @username автора з тексту поста (барахолки часто без from_user)."""
    if not text:
        return None

    channel_key = normalize_channel_key(channel)
    if channel_key.lower().startswith("t.me/"):
        channel_slug = channel_key.rsplit("/", 1)[-1].lower()
    else:
        channel_slug = channel_key.lstrip("@").split("/")[0].lower()

    ignore = _IGNORE_MENTION_USERNAMES | {channel_slug}

    for match in re.finditer(r"@([a-zA-Z][a-zA-Z0-9_]{3,31})\b", text):
        username = match.group(1)
        if username.lower() in ignore:
            continue
        return username

    return None


def resolve_author_username(msg, text: str, channel: str = "") -> Optional[str]:
    """Telegram meta → @ з тексту поста."""
    return get_sender_username(msg) or extract_username_from_text(text, channel)


def resolve_author_contact(
    msg,
    text: str,
    channel: str = "",
) -> tuple[Optional[str], Optional[int]]:
    """
    (username, user_id) автора оголошення для DM / модерації.

    @ з тексту — пріоритет. user_id зберігаємо лише якщо from_user збігається
    з цим @ (інакше id часто належить адміну групи, а не автору).
    """
    text_username = extract_username_from_text(text, channel)
    meta_username = get_sender_username(msg)
    username = text_username or meta_username

    sender = _sender_user_from_message(msg)
    user_id: Optional[int] = None
    if not sender:
        return username, None

    sender_un = (getattr(sender, "username", None) or "").strip().lstrip("@").lower()

    if text_username:
        if sender_un and sender_un == text_username.lower():
            user_id = int(sender.id)
    elif meta_username:
        if sender_un == meta_username.lower():
            user_id = int(sender.id)
    elif not username:
        user_id = int(sender.id)
        if not username and sender_un:
            username = sender_un

    return username, user_id


def get_sender_id(msg) -> Optional[int]:
    """Зворотна сумісність — id лише для «реального» from_user."""
    sender = _sender_user_from_message(msg)
    if sender is None:
        return None
    return int(sender.id)
